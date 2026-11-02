// Text contrast as people see it: every text run in the chosen elements is measured against the pixels
// actually behind it (gradients, panels and the page under transparent buttons included), with its colour
// blended by its own alpha and every opacity up to `scope`. The text is hidden while the background is
// photographed, so antialiasing never counts as background.
import type { Page } from '@playwright/test';

export interface TextContrast { what: string; text: string; ratio: number; color: string; bg: string }

/** WCAG 2 contrast of two sRGB colours (0-255). */
export function ratio(a: number[], b: number[]): number {
  const lum = (c: number[]) => {
    const [r, g, bl] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/**
 * The contrast of each text run inside the elements matched by `sel` (each element is one `scope` for
 * opacity). Returns one entry per text run: the lowest contrast over the pixels under it.
 */
export async function textContrast(page: Page, sel: string): Promise<TextContrast[]> {
  // where the text is, and its effective colour
  const runs = await page.evaluate((sel) => {
    const out: { what: string; text: string; rect: { x: number; y: number; w: number; h: number }; rgba: number[] }[] = [];
    const parse = (c: string): number[] => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (m) { const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]; }
      const s = c.match(/color\(srgb ([^)]+)\)/);
      if (s) { const p = s[1]!.split(/[\s/]+/).filter(Boolean).map(Number); return [p[0]! * 255, p[1]! * 255, p[2]! * 255, p[3] ?? 1]; }
      return [0, 0, 0, 1];
    };
    document.querySelectorAll<HTMLElement>(sel).forEach((scope, si) => {
      const walk = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const text = (n.textContent ?? '').trim();
        if (!text) continue;
        const el = n.parentElement!;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const range = document.createRange(); range.selectNodeContents(n);
        // the text's box, inside its button (a tall font's line box can reach past the edge)
        const t = range.getBoundingClientRect(), b = scope.getBoundingClientRect();
        const x = Math.max(t.left, b.left + 2), y = Math.max(t.top, b.top + 2);
        const r = { x, y, width: Math.min(t.right, b.right - 2) - x, height: Math.min(t.bottom, b.bottom - 2) - y };
        if (r.width < 1 || r.height < 1) continue;
        const rgba = parse(cs.color);
        let op = 1;
        for (let e: HTMLElement | null = el; e; e = e.parentElement) { op *= Number(getComputedStyle(e).opacity); if (e === scope) break; }
        rgba[3] = rgba[3]! * op;
        const label = `${scope.className.split(' ').slice(0, 2).join('.') || scope.tagName}#${si} ${el.tagName.toLowerCase()}`;
        out.push({ what: label, text, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, rgba });
      }
    });
    return out;
  }, sel);
  if (!runs.length) return [];
  // photograph the background with the text hidden
  const tag = await page.addStyleTag({ content: `${sel},${sel} *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}` });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shot = await page.screenshot({ animations: 'disabled' });
  await tag.evaluate((t) => (t as Element).remove());
  return page.evaluate(async ([b64, runs]) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const cv = new OffscreenCanvas(img.width, img.height);
    const cx = cv.getContext('2d')!;
    cx.drawImage(img, 0, 0);
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
    return runs.map((run) => {
      const x0 = Math.max(0, Math.floor(run.rect.x)), y0 = Math.max(0, Math.floor(run.rect.y));
      const w = Math.max(1, Math.min(img.width - x0, Math.ceil(run.rect.w))), h = Math.max(1, Math.min(img.height - y0, Math.ceil(run.rect.h)));
      const d = cx.getImageData(x0, y0, w, h).data;
      let worst = Infinity, wc = [0, 0, 0], wb = [0, 0, 0];
      const a = run.rgba[3]!;
      for (let i = 0; i < d.length; i += 4) {
        const bg = [d[i]!, d[i + 1]!, d[i + 2]!];
        const fg = [0, 1, 2].map((k) => run.rgba[k]! * a + bg[k]! * (1 - a));
        const r = ratio(fg, bg);
        if (r < worst) { worst = r; wc = fg; wb = bg; }
      }
      const hex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
      return { what: run.what, text: run.text, ratio: Math.round(worst * 100) / 100, color: hex(wc), bg: hex(wb) };
    });
  }, [shot.toString('base64'), runs] as const);
}
