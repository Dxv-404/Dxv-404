// A real game through the real screens: host plus two guests pair up and play hands.
import { test, expect } from '@playwright/test';
import { MODELS, newPhone, hostTable, pair, chipTotal, playOneAction, seeded, expectNoErrors, type ModelName } from '../harness';

const MIXES: [string, ModelName[]][] = [
  ['android trio', ['pixel7', 'smallAndroid', 'pixel7']],
  ['iphone trio', ['iphone15', 'iphoneSE', 'iphone15']],
  ['mixed with tablet and laptop', ['laptop', 'tablet', 'iphoneSE']],
];

for (const [label, models] of MIXES) {
  test(`three phones play 40 actions without losing a chip (${label})`, async ({ browser, baseURL }) => {
    test.setTimeout(600_000); // three phones each on two shared CPUs
    const names = ['Dev', 'Rohan', 'Riya'];
    const phones = await Promise.all(models.map((m, i) => newPhone(browser, names[i]!, MODELS[m], baseURL!)));
    const [host, g1, g2] = phones as [typeof phones[0], typeof phones[0], typeof phones[0]];
    await hostTable(host, names);
    await pair(host, g1);
    await pair(host, g2);
    await host.page.getByRole('button', { name: 'Start the game' }).click();
    await host.page.waitForFunction(() => (window as any).__tp.host.e.s.phase === 'hand');
    const T = await chipTotal(host);
    void T;
    expect(T).toBe(3000);
    let buyins = 3000;
    const rnd = seeded(label.length * 7919);
    let acted = 0;
    // Play until 40 actions or 3 minutes. Showdowns and result animations take a while, so the pace
    // varies; what must never happen is a table where nobody can act for 30 seconds (a stuck game).
    const until = Date.now() + 180_000;
    let lastAction = Date.now();
    while (acted < 40 && Date.now() < until) {
      if (await playOneAction(phones, rnd)) { acted++; lastAction = Date.now(); }
      expect(Date.now() - lastAction, 'nobody could act for 30 seconds: the game is stuck').toBeLessThan(30_000);
      await host.page.waitForTimeout(250);
      const b = await host.page.evaluate(() => (window as any).__tp.host.e.s.players.reduce((a: number, p: any) => a + p.buyins, 0));
      buyins = b;
      expect(await chipTotal(host)).toBe(buyins); // chips on the table always equal everything bought in
    }
    expect(acted).toBeGreaterThanOrEqual(30);
    // Every phone agrees with the host on the stacks once the next view arrives.
    await host.page.waitForTimeout(1500);
    const hostStacks = await host.page.evaluate(() => (window as any).__tp.host.e.s.players.map((p: any) => p.stack));
    for (const g of [g1, g2]) {
      // Read host and guest at the same moment; the game keeps dealing while we look.
      await expect.poll(async () => {
        const hs = await host.page.evaluate(() => JSON.stringify((window as any).__tp.host.e.s.players.map((p: any) => p.stack)));
        const gs = await g.page.evaluate(() => JSON.stringify((window as any).__tp.guest.view.players.map((p: any) => p.stack)));
        return hs === gs;
      }, { timeout: 15_000, intervals: [100, 200, 300] }).toBe(true);
    }
    expect(hostStacks.reduce((a: number, b: number) => a + b, 0)).toBeLessThanOrEqual(buyins);
    // A guest's view never contains another player's hidden cards.
    const leak = await g1.page.evaluate(() => {
      const v = (window as any).__tp.guest.view;
      if (!v.hand) return false;
      return Object.entries(v.hand.ps).some(([pid, hp]: [string, any]) => pid !== v.me && hp.cards && !hp.revealed);
    });
    expect(leak).toBe(false);
    expectNoErrors(phones);
    await Promise.all(phones.map((p) => p.ctx.close()));
  });
}
