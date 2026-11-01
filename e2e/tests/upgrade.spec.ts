// Upgrade path: a host phone that saved a table with the first app (engine v1) opens the new build
// and resumes the same table, stacks intact, and can deal the next hand.
import { test, expect } from '@playwright/test';
import { MODELS, newPhone, expectNoErrors } from '../harness';

const v1Save = {
  me: 'p_dev',
  savedAt: Date.now(),
  state: {
    v: 1, gameId: 'oldgame1', cfg: { startStack: 1000, sb: 5, bb: 10, blindUpEvery: 0, turnTime: 0, rebuys: true },
    level: { sb: 5, bb: 10, n: 1 },
    players: [
      { id: 'p_dev', name: 'Dev', seat: 0, stack: 1240, buyins: 1000, sittingOut: false, leaving: false, connected: true, busted: false },
      { id: 'p_rohan', name: 'Rohan', seat: 1, stack: 760, buyins: 1000, sittingOut: false, leaving: false, connected: false, busted: false },
      { id: 'p_riya', name: 'Riya', seat: 2, stack: 1000, buyins: 1000, sittingOut: false, leaving: false, connected: false, busted: false },
    ],
    button: 1, handNo: 7, hand: null, phase: 'between', log: [], stats: {}, paused: false,
  },
};

test('a table saved by the first app resumes on the new engine', async ({ browser, baseURL }) => {
  const host = await newPhone(browser, 'Dev', MODELS.pixel7, baseURL!);
  await host.page.evaluate((s) => localStorage.setItem('tp-host-v1', JSON.stringify(s)), v1Save);
  await host.page.reload();
  await host.page.getByRole('button', { name: 'Resume your table' }).click();
  const s = await host.page.evaluate(() => { const e = (window as any).__tp.host.e; return { v: e.s.v, hand: e.s.handNo, stacks: e.s.players.map((p: any) => p.stack) }; });
  expect(s).toEqual({ v: 2, hand: 7, stacks: [1240, 760, 1000] });
  // stand-in guests so the host can deal without pairing phones
  await host.page.evaluate(() => { const h = (window as any).__tp.host; h.e.s.players.forEach((x: any) => (x.connected = true)); h.push([{ t: 'seat' }]); });
  await host.page.evaluate(() => (window as any).__tp.host.dealNext());
  await expect.poll(() => host.page.evaluate(() => (window as any).__tp.host.e.s.handNo)).toBe(8);
  // The old save had the button on Rohan; it moves on one seat exactly as the first app did.
  const pos = await host.page.evaluate(() => { const e = (window as any).__tp.host.e, h = e.s.hand; return [h.buttonId, h.sbId, h.bbId].map((id: string) => e.player(id).name); });
  expect(pos).toEqual(['Riya', 'Dev', 'Rohan']);
  expectNoErrors([host]);
});
