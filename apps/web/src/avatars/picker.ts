// "Choose your avatar" (the approved board, tools/design/avatars/board.py picker()): nine style tabs, a grid of
// eight, the Initials option, and a live preview of the pick at a table seat and in a crew list. Opened from
// Profile (tap your picture) and from the menu's avatar. Phone: 4 columns, tabs scroll sideways. Tablet: 4 large
// columns, tabs wrap. Laptop (and phones on their side): the preview on the left, all eight in one row, and
// "Jump to another style". Selecting and changing tabs move in the theme's own way (calm: less; off: none).
import './picker.css';
import { AVATAR_THEMES, avatarTheme, type AvatarTheme } from '@tp/protocol/avatars';
import { avatarMarkup, chooseAvatar, isAvatarId, loadAvatars, myAvatar, type AvatarArt, type AvatarId } from './index';
import type { STYLE_LOOK as LookT } from './set';
import { THEMES, avatar } from '../table/render';
import { currentTheme } from '../table/screen';
import { FEEL } from '../table/motion';
import { settings } from '../legacy/fx.js';
import { toast } from '../legacy/ui.js';

type Layout = 'phone' | 'tablet' | 'laptop' | 'land';
type Look = typeof LookT;
import { avatarBrowse, type AvatarBrowse } from '../research/avatar';

export interface PickerOptions {
  /** Signed-in phones: where the pick is kept (the account); guests keep it on the phone. */
  account?: () => Promise<{ profile: unknown; setAvatar(id: string | null): Promise<string | null> } | null>;
  /** After a pick was kept (to redraw the screen that opened the picker). */
  onSaved?: (id: AvatarId | null) => void;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const layoutFor = (w: number, h: number): Layout => (h < 560 && w > h ? 'land' : w >= 1000 ? 'laptop' : w >= 600 ? 'tablet' : 'phone');
const motionLevel = (): 'full' | 'calm' | 'off' => (settings.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : settings.motion === 'calm' ? 'calm' : 'full');
const fmtIN = (n: number): string => n.toLocaleString('en-IN');

let openNow: (() => void) | null = null;

/** Opens the picker over the current screen. Resolves when it closes (with the pick, or undefined if backed out). */
export async function openAvatarPicker(o: PickerOptions = {}): Promise<AvatarId | null | undefined> {
  openNow?.();
  const app = document.getElementById('app') ?? document.body;
  const opener = document.activeElement as HTMLElement | null;
  const me = (() => { try { return JSON.parse(localStorage.getItem('tp-me') ?? 'null') as { account?: string; name?: string } | null; } catch { return null; } })();
  const name = me?.name ?? (localStorage.getItem('tp-name') || 'Player');
  const pid = me?.account ?? `guest-${name}`;
  const th = THEMES[currentTheme()] ?? THEMES.classic!;

  const root = document.createElement('div');
  root.className = 'avp';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'avp-title');
  root.dataset.testid = 'avatar-picker';
  root.innerHTML = `<div class="a-pk-top"><button type="button" class="a-ib" data-x="back" aria-label="Back">&#8249;</button><h2 id="avp-title">Choose your avatar</h2><span class="a-ib a-ghost" aria-hidden="true"></span></div><div class="avp-wait" role="status">Loading avatars…</div>`;
  // everything behind the picker is out of reach (keyboard and screen readers) while it is open
  const behind = Array.from(app.children).filter((c): c is HTMLElement => c instanceof HTMLElement && !c.inert);
  for (const c of behind) c.inert = true;
  app.append(root);
  document.documentElement.classList.add('avp-open');
  (root.querySelector('[data-x=back]') as HTMLElement).focus();

  let set: Record<AvatarId, AvatarArt>;
  let look: Look;
  let done!: (v: AvatarId | null | undefined) => void;
  const result = new Promise<AvatarId | null | undefined>((r) => { done = r; });
  let rb: AvatarBrowse | null = null;
  const close = (v: AvatarId | null | undefined): void => {
    if (!root.isConnected) return;
    rb?.close(v);
    root.remove();
    for (const c of behind) c.inert = false;
    document.documentElement.classList.remove('avp-open');
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey, true);
    openNow = null;
    try { opener?.focus(); } catch { /* gone */ }
    done(v);
  };
  openNow = () => close(undefined);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(undefined); return; }
    if (e.key === 'Tab') { // keep the keyboard inside the picker
      const f = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),[tabindex="0"]')).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  root.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-x=back]')) close(undefined); });

  try {
    const mod = await import('./set');
    set = await loadAvatars();
    look = mod.STYLE_LOOK;
  } catch {
    root.querySelector('.avp-wait')!.textContent = 'Could not load the avatars. Check your connection and try again.';
    return result;
  }
  if (!root.isConnected) return result;

  // ---------------------------------------------------------------- state
  let sel: AvatarId | null = myAvatar();
  let tab: AvatarTheme = sel ? avatarTheme(sel) : ((AVATAR_THEMES as readonly string[]).includes(currentTheme()) ? currentTheme() as AvatarTheme : 'classic');
  let layout = layoutFor(innerWidth, innerHeight);
  let saving = false;
  rb = avatarBrowse(root, { current: sel, tab });

  const sw = (k: AvatarTheme): string => `<span class="a-sw" style="background:${look[k].bg};box-shadow:inset 0 0 0 2px ${look[k].acc}"></span>`;
  const ids = (k: AvatarTheme): AvatarId[] => (Object.keys(set) as AvatarId[]).filter((i) => set[i].theme === k);
  const art = (id: AvatarId | null, size: number): string => `<span class="av" style="--av:${size}px">${id ? avatarMarkup(id) : avatar(th, pid, name)}</span>`;

  const heroHtml = (): string => sel
    ? `<div class="a-pv-hero" data-testid="avp-hero">${art(sel, 96).replace('class="av"', 'class="av a-pv-big"')}<div class="a-pv-txt"><div class="a-pv-name">${esc(set[sel].name)}</div><div class="a-pv-from">${sw(set[sel].theme)}${esc(look[set[sel].theme].label)} style</div></div></div>`
    : `<div class="a-pv-hero" data-testid="avp-hero">${art(null, 96).replace('class="av"', 'class="av a-pv-big"')}<div class="a-pv-txt"><div class="a-pv-name">Initials</div><div class="a-pv-from">In the table’s own style</div></div></div>`;
  const seatHtml = (): string => `<div class="a-pv-seat"><div class="a-felt"><div class="a-seatbox">${art(sel, 30).replace('class="av"', 'class="av a-sav"')}<span class="a-snm">${esc(name)}</span><span class="a-sst">${fmtIN(1240)}</span></div></div><span class="a-cap">At a table seat</span></div>`;
  const crewHtml = (): string => `<div class="a-pv-crew"><div class="a-crow"><span class="a-rk">4</span>${art(sel, 22).replace('class="av"', 'class="av a-cav"')}<span class="a-cn">${esc(name)} (you)</span><span class="a-cw">+96</span></div>`
    + `<div class="a-crow a-dim"><span class="a-rk">5</span><span class="av a-cav" style="--av:22px">${avatarMarkup('edo-samurai')}</span><span class="a-cn">Kabir</span><span class="a-cw">+12</span></div>`
    + `<div class="a-crow a-dim"><span class="a-rk">6</span><span class="av a-cav" style="--av:22px">${avatar(th, 'sample-zoya', 'Zoya')}</span><span class="a-cn">Zoya</span><span class="a-cw a-neg">&minus;48</span></div><span class="a-cap">In a crew list</span></div>`;
  const tabsHtml = (): string => `<div class="a-tabs" role="tablist" aria-label="Avatar styles">${AVATAR_THEMES.map((k) => `<button type="button" class="a-tab${k === tab ? ' a-on' : ''}" role="tab" aria-selected="${k === tab}" data-tab="${k}"><span class="a-pill">${sw(k)}${esc(look[k].label)}</span></button>`).join('')}</div>`;
  const tilesHtml = (): string => `<div class="a-tiles" role="radiogroup" aria-label="${esc(look[tab].label)} avatars">${ids(tab).map((id) => {
    const on = id === sel;
    return `<button type="button" class="a-tile${on ? ' a-on' : ''}" role="radio" aria-checked="${on}" data-av-id="${id}" style="--tbg:${look[tab].bg}"><span class="a-art">${avatarMarkup(id)}</span><span class="a-tn">${esc(set[id].name)}</span>${on ? '<span class="a-chk" aria-hidden="true">&#10003;</span>' : ''}</button>`;
  }).join('')}</div>`;
  const iniHtml = (): string => `<button type="button" class="a-ini-opt${sel ? '' : ' a-on'}" role="radio" aria-checked="${!sel}" data-x="initials">${art(null, 42).replace('class="av"', 'class="av a-ini"')}<span class="a-it"><b>Initials</b><span>Plain letters in the table’s own style</span></span><span class="a-radio" aria-hidden="true"></span></button>`;
  const note = '<p class="a-pk-note">Shows in its own style at every table, whatever the theme.</p>';
  const stripHtml = (): string => `<h3 class="a-jump">Jump to another style</h3><div class="a-strip">${AVATAR_THEMES.filter((k) => k !== tab).map((k) => `<button type="button" class="a-sp" data-tab="${k}" style="background:${look[k].bg}"><i>${avatarMarkup(ids(k)[1]!)}</i><b style="color:${look[k].tx}">${esc(look[k].label)}</b></button>`).join('')}</div>`;
  const ctaLabel = (): string => (saving ? 'Saving…' : sel ? 'Use this avatar' : 'Use initials');
  const footHtml = (): string => `<div class="a-pk-foot"><button type="button" class="a-cta" data-x="use" data-testid="avp-use">${ctaLabel()}</button></div>`;

  const build = (): void => {
    const top = root.querySelector('.a-pk-top')!.outerHTML;
    root.className = `avp l-${layout}`;
    root.dataset.motion = motionLevel();
    const f = FEEL[currentTheme()] ?? FEEL.classic!;
    root.style.setProperty('--avp-k', String(f.k * (root.dataset.motion === 'calm' ? 0.6 : 1)));
    root.style.setProperty('--avp-ease', f.ease);
    if (layout === 'laptop' || layout === 'land') {
      root.innerHTML = `${top}<div class="a-lap-cols"><aside class="a-lap-pv"><div data-part="hero">${heroHtml()}</div><div data-part="seat">${seatHtml()}</div><div data-part="crew">${crewHtml()}</div>${note}</aside>`
        + `<div class="a-lap-main"><div class="a-lap-scroll"><div data-part="tabs">${tabsHtml()}</div><div data-part="tiles">${tilesHtml()}</div><div data-part="ini">${iniHtml()}</div><div data-part="strip">${stripHtml()}</div></div><div data-part="foot">${footHtml()}</div></div></div>`;
    } else {
      root.innerHTML = `${top}<div class="a-pk-scroll"><div data-part="hero">${heroHtml()}</div><div class="a-pv-pair"><div data-part="seat">${seatHtml()}</div><div data-part="crew">${crewHtml()}</div></div><div data-part="tabs">${tabsHtml()}</div><div data-part="tiles">${tilesHtml()}</div><div data-part="ini">${iniHtml()}</div>${note}</div><div data-part="foot">${footHtml()}</div>`;
    }
    showTab(false);
  };
  const part = (k: string, html: string): HTMLElement | null => { const p = root.querySelector<HTMLElement>(`[data-part=${k}]`); if (p) p.innerHTML = html; return p; };
  // the active tab in view (phones: the row scrolls sideways)
  const showTab = (smooth: boolean): void => {
    const b = root.querySelector<HTMLElement>(`.a-tab[data-tab=${tab}]`);
    const row = b?.parentElement;
    if (!b || !row || row.scrollWidth <= row.clientWidth) return;
    const left = b.offsetLeft - (row.clientWidth - b.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: smooth && motionLevel() === 'full' ? 'smooth' : 'auto' });
  };

  // ---------------------------------------------------------------- motion (the theme's feel)
  const k = (): number => Number(root.style.getPropertyValue('--avp-k')) || 1;
  const ease = (): string => root.style.getPropertyValue('--avp-ease') || 'ease';
  const anim = (el: Element | null, frames: Keyframe[], ms: number, delay = 0): void => {
    if (!el || motionLevel() === 'off' || typeof (el as HTMLElement).animate !== 'function') return;
    (el as HTMLElement).animate(frames, { duration: ms * k(), delay: delay * k(), easing: ease(), fill: 'backwards' });
  };
  const selectMotion = (): void => {
    const lv = motionLevel();
    const tile = root.querySelector('.a-tile.a-on, .a-ini-opt.a-on');
    const big = root.querySelector('.a-pv-big');
    if (lv === 'calm') { anim(big, [{ opacity: 0.4 }, { opacity: 1 }], 160); return; }
    anim(tile?.querySelector('.a-chk') ?? null, [{ transform: 'scale(0)' }, { transform: 'scale(1.15)', offset: 0.7 }, { transform: 'scale(1)' }], 260);
    anim(tile, [{ transform: 'scale(.94)' }, { transform: 'scale(1)' }], 220);
    anim(big, [{ opacity: 0, transform: 'scale(.86)' }, { opacity: 1, transform: 'scale(1)' }], 280);
  };
  const tabMotion = (): void => {
    const lv = motionLevel();
    const tiles = Array.from(root.querySelectorAll('.a-tiles .a-tile'));
    if (lv === 'calm') { anim(root.querySelector('.a-tiles'), [{ opacity: 0 }, { opacity: 1 }], 160); return; }
    tiles.forEach((t, i) => anim(t, [{ opacity: 0, transform: 'translateY(10px) scale(.96)' }, { opacity: 1, transform: 'none' }], 260, i * 28));
  };

  // ---------------------------------------------------------------- interaction
  const redrawPreview = (): void => { part('hero', heroHtml()); part('seat', seatHtml()); part('crew', crewHtml()); part('foot', footHtml()); };
  // a part drawn again takes the keyboard's place with it: focus goes to the same control in the new markup
  const refocus = (sel2: string): void => { if (!root.contains(document.activeElement) || document.activeElement === root) root.querySelector<HTMLElement>(sel2)?.focus({ preventScroll: true }); };
  const select = (id: AvatarId | null): void => {
    if (id === sel) return;
    rb?.select(id);
    sel = id;
    part('tiles', tilesHtml());
    part('ini', iniHtml());
    redrawPreview();
    refocus(id ? `[data-av-id="${id}"]` : '[data-x=initials]');
    selectMotion();
  };
  const toTab = (t: AvatarTheme, focusTab = false): void => {
    if (t === tab) return;
    rb?.tab(t);
    tab = t;
    part('tabs', tabsHtml());
    part('tiles', tilesHtml());
    part('strip', stripHtml());
    showTab(true);
    tabMotion();
    if (focusTab) root.querySelector<HTMLElement>(`.a-tab[data-tab=${t}]`)?.focus();
    else refocus(`.a-tab[data-tab=${t}]`);
  };
  const save = async (): Promise<void> => {
    if (saving) return;
    saving = true; part('foot', footHtml());
    root.querySelector<HTMLButtonElement>('.a-cta')!.disabled = true;
    try {
      const acc = o.account ? await o.account() : null;
      await chooseAvatar(sel, acc);
      toast(sel ? `${set[sel].name} is your avatar` : 'Your initials are back');
      o.onSaved?.(sel);
      close(sel);
    } catch (err) {
      saving = false; part('foot', footHtml());
      toast((err as Error)?.message && !/fetch|network/i.test((err as Error).message) ? (err as Error).message : 'Could not save your avatar. Check your connection and try again.');
    }
  };
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const tile = t.closest<HTMLElement>('[data-av-id]');
    if (tile && isAvatarId(tile.dataset.avId)) return select(tile.dataset.avId);
    if (t.closest('[data-x=initials]')) return select(null);
    const tb = t.closest<HTMLElement>('[data-tab]');
    if (tb) return toTab(tb.dataset.tab as AvatarTheme, tb.classList.contains('a-tab'));
    if (t.closest('[data-x=use]')) void save();
  });
  // arrow keys move between the tabs (and between the tiles)
  root.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const d = e.key === 'ArrowRight' ? 1 : -1;
    if (t.classList.contains('a-tab')) {
      e.preventDefault();
      const i = AVATAR_THEMES.indexOf(tab);
      toTab(AVATAR_THEMES[(i + d + AVATAR_THEMES.length) % AVATAR_THEMES.length]!, true);
    } else if (t.classList.contains('a-tile')) {
      e.preventDefault();
      const all = Array.from(root.querySelectorAll<HTMLElement>('.a-tile'));
      all[(all.indexOf(t) + d + all.length) % all.length]?.focus();
    }
  });
  const onResize = (): void => {
    const l = layoutFor(innerWidth, innerHeight);
    if (l === layout) return;
    layout = l; build();
  };
  window.addEventListener('resize', onResize);

  build();
  (root.querySelector<HTMLElement>('.a-tile.a-on') ?? root.querySelector<HTMLElement>('[data-x=back]'))?.focus({ preventScroll: true });
  return result;
}
