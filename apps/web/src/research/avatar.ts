// The avatar picker, for research: which styles (tabs) were looked at and for how long, which avatars were on
// screen and for how long (each tile's visible time), every pick before the final one, and the final choice.
import { R } from './capture';

export interface AvatarBrowse { tab(t: string): void; select(id: string | null): void; close(result: string | null | undefined): void }

export function avatarBrowse(root: HTMLElement, start: { current: string | null; tab: string }): AvatarBrowse {
  const t0 = performance.now();
  let tab = start.tab, tabAt = t0;
  const tabs: [string, number][] = [];
  const picks: [number, string | null][] = [];
  const seen = new Map<string, number>(); // avatar id -> ms on screen
  const since = new Map<string, number>(); // avatar id -> on screen since
  let io: IntersectionObserver | null = null;
  let mo: MutationObserver | null = null;
  const stopTile = (id: string, now: number): void => { const s = since.get(id); if (s !== undefined) { seen.set(id, (seen.get(id) ?? 0) + now - s); since.delete(id); } };
  try {
    io = new IntersectionObserver(R.guard((entries: IntersectionObserverEntry[]) => {
      const now = performance.now();
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.avId;
        if (!id) continue;
        if (e.isIntersecting && e.intersectionRatio >= 0.5) { if (!since.has(id)) since.set(id, now); } else stopTile(id, now);
      }
    }), { root: null, threshold: [0, 0.5] });
    const observeAll = (): void => { root.querySelectorAll<HTMLElement>('[data-av-id]').forEach((el) => io!.observe(el)); };
    // tiles are drawn again on each tab and pick: new ones are watched, removed ones stop counting
    mo = new MutationObserver(R.guard(() => {
      const now = performance.now();
      const live = new Set([...root.querySelectorAll<HTMLElement>('.a-tile[data-av-id]')].map((x) => x.dataset.avId!));
      for (const id of [...since.keys()]) if (!live.has(id)) stopTile(id, now);
      observeAll();
    }));
    mo.observe(root, { childList: true, subtree: true });
    observeAll();
  } catch { /* old browser: tabs and picks are still recorded */ }
  R.emit('avatar.browse', { kind: 'open', current: start.current, tab });
  return {
    tab: R.guard((t: string) => {
      const now = performance.now();
      tabs.push([tab, Math.round(now - tabAt)]);
      R.emit('avatar.browse', { kind: 'tab', from: tab, to: t, fromMs: Math.round(now - tabAt) });
      tab = t; tabAt = now;
    }),
    select: R.guard((id: string | null) => { picks.push([Math.round(performance.now() - t0), id]); R.emit('avatar.browse', { kind: 'pick', id, ms: Math.round(performance.now() - t0) }); }),
    close: R.guard((result: string | null | undefined) => {
      const now = performance.now();
      for (const id of [...since.keys()]) stopTile(id, now);
      tabs.push([tab, Math.round(now - tabAt)]);
      io?.disconnect(); mo?.disconnect();
      R.emit('avatar.browse', { kind: 'close', saved: result !== undefined, final: result ?? null, before: start.current, ms: Math.round(now - t0), tabs, picks, viewedMs: Object.fromEntries([...seen].map(([k, v]) => [k, Math.round(v)])) });
    }),
  };
}
