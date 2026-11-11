// Research tracking for the Profile page (docs/research-data.md, section 4). Everything goes out as the
// existing `crew.view` event with a `kind` that starts "profile-": no new event type, so no server needs
// a deploy. Taps on its buttons are recorded by the app-wide capture as `ui.tap`, its sheets as `ui.sheet`
// (labels "Profile day", "Profile crew", "Achievement <id>") and the page itself as `ui.screen`.
import { R } from '../research/capture';

/** One profile event: `kind` is profile-open, -section, -crew, -night, -table, -mark, -day, -milestones or -achievement. */
export const track = R.guard((kind: string, p: Record<string, unknown> = {}): void => { R.emit('crew.view', { kind, ...p }); });

/** Watches the page's sections: each time one leaves the screen (or the page closes, or the app goes to
 * the background) the time it was in view is recorded. A section counts as in view when 40% of it shows,
 * or it fills 40% of the screen. `onMilestones` runs once, when the milestone bars are first seen.
 * Returns the function that stops watching (and records what is still in view). */
export function watchSections(root: HTMLElement, onMilestones: () => void): () => void {
  if (!('IntersectionObserver' in window)) { onMilestones(); return () => undefined; }
  const since = new Map<string, number>();
  let told = false;
  const leave = (name: string): void => {
    const t = since.get(name);
    if (t === undefined) return;
    since.delete(name);
    const ms = Math.round(performance.now() - t);
    if (ms >= 300) track('profile-section', { section: name, ms });
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const name = (e.target as HTMLElement).dataset.sec!;
      const seen = e.isIntersecting && (e.intersectionRatio >= 0.4 || e.intersectionRect.height >= 0.4 * (e.rootBounds?.height ?? innerHeight));
      if (seen && !since.has(name)) { since.set(name, performance.now()); if (name === 'miles' && !told) { told = true; onMilestones(); } }
      if (!seen) leave(name);
    }
  }, { threshold: [0, 0.2, 0.4, 0.6, 1] });
  root.querySelectorAll<HTMLElement>('[data-sec]').forEach((s) => io.observe(s));
  const onHide = (): void => { if (document.visibilityState === 'hidden') for (const k of [...since.keys()]) leave(k); };
  document.addEventListener('visibilitychange', onHide);
  return () => { io.disconnect(); document.removeEventListener('visibilitychange', onHide); for (const k of [...since.keys()]) leave(k); };
}
