// Today's table layout at 2-9 players on every screen size: nothing off-screen, no seats overlapping.
import { test, expect } from '@playwright/test';
import { MODELS, newPhone, expectNoErrors, type ModelName } from '../harness';

const NAMES = ['Dev', 'Rohan', 'Riya', 'Aditya', 'Sneha', 'Kabir', 'Meera', 'Arjun', 'Zoya'];
const SIZES: ModelName[] = ['smallAndroid', 'pixel7', 'iphoneSE', 'iphone15', 'tablet', 'laptop'];

for (const m of SIZES) {
  for (const n of [2, 6, 9]) {
    test(`${n} players fit on ${MODELS[m].label}`, async ({ browser, baseURL }) => {
      const ph = await newPhone(browser, 'Dev', MODELS[m], baseURL!);
      const p = ph.page;
      await p.getByRole('button', { name: 'Host a new table' }).click();
      await p.getByTestId('qr-host').click();
      for (let i = 2; i < n; i++) await p.getByRole('button', { name: 'Add player' }).click();
      const inputs = p.locator('.name-row input');
      for (let i = 0; i < n; i++) await inputs.nth(i).fill(NAMES[i]!);
      await p.getByRole('button', { name: 'Open the table' }).click();
      // stand-in guests: mark seats connected so the host can deal without pairing phones
      await p.evaluate(() => { const h = (window as any).__tp.host; h.e.s.players.forEach((x: any) => (x.connected = true)); h.push([{ t: 'seat' }]); });
      await p.evaluate(() => localStorage.setItem('tp-intro-done', '1'));
      await p.getByRole('button', { name: 'Start the game' }).click();
      await p.waitForTimeout(3000);
      // the QR mode plays on the same designed table as online and offline tables
      await expect(p.locator('.tp.live')).toBeVisible();
      const boxes = await p.locator('.tp.live .plate').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
      expect(boxes.length).toBeGreaterThanOrEqual(n - 1); // everyone's name plate (yours may be the hero area)
      const vw = MODELS[m].width, vh = MODELS[m].height;
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(-1);
        expect(b.y).toBeGreaterThanOrEqual(-1);
        expect(b.x + b.w).toBeLessThanOrEqual(vw + 1);
        expect(b.y + b.h).toBeLessThanOrEqual(vh + 1);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        expect(overlap, `seats ${i} and ${j} overlap`).toBeLessThan(0.15 * Math.min(a.w * a.h, b.w * b.h));
      }
      expectNoErrors([ph]);
    });
  }
}
