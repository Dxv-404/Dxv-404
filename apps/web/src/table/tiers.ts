// Win tiers: the signed-off design scenes (tools/design/gen, exported by export_tiers.py into tiers.json),
// filled with the real result and played once over the live table.
//
// Every scene was drawn for a 390 x 844 phone. Here it plays in a 390 x 844 stage, centred over the screen and
// scaled to fit; on screens of another shape its full-screen backdrops are stretched to the screen edges so
// the table is covered the same way, and the marks that sit on a seat (bust-out) are placed on the real seat.
import { CATEGORY, RANK_NAME, RANK_PLURAL } from '@tp/engine';
import { fmt, type ThemeKey } from './render';

interface Scene { html: string; css: string; dur: number; shake: boolean }
type Scenes = Record<string, Scene[]>;

let scenes: Scenes | null = null;
/** The scenes are loaded on first use (they are a large file nobody needs before the first hand ends). */
export async function loadTiers(): Promise<Scenes> {
  if (!scenes) scenes = (await import('./tiers.json')).default as unknown as Scenes;
  return scenes;
}

/** Hand category (0 high card .. 9 royal flush) -> tier 1..4. No showdown (-1) is tier 1. */
export const tierFor = (cat: number): 1 | 2 | 3 | 4 => (cat >= 8 ? 4 : cat >= 6 ? 3 : cat >= 3 ? 2 : 1);
/** The engine's hand name ("Full House", "One Pair") -> category, or -1. */
export const categoryOf = (name: string | null | undefined): number => (name ? (CATEGORY as readonly string[]).indexOf(name) : -1);

export interface WinInfo {
  names: string[];
  amount: number;
  /** 0 high card .. 9 royal flush; -1 when the pot was won without a showdown */
  cat: number;
  /** the winning five, e.g. ['Ks', 'Kh', 'Kd', '7c', '7s'] (any order) */
  cards: string[];
  handNo: number;
  code: string;
}
export interface BustInfo {
  name: string;
  /** finishing place and players at the table, e.g. 9 of 13 */
  place: number; of: number;
  rebuys: boolean;
  /** chips a rebuy gives */
  stack: number;
  /** seat number shown to players (1-based) */
  seatNo: number;
}

// ---------------- the words ----------------
const RANKS = '23456789TJQKA';
const HAND = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'];
const JA = ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ', 'ロイヤルフラッシュ'];
// edo: kanji in the style of the theme's 順 (straight), 一色 (flush), 四枚 (four of a kind), 天下一 (royal);
// the one-glyph crest beside it as 色 and 四 were. Full house is 大入 ("a full house" in the kabuki theatre).
const EDO = ['高札', '二枚', '二対', '三枚', '順', '一色', '大入', '四枚', '順一色', '天下一'];
const EDO1 = ['札', '二', '対', '三', '順', '色', '満', '四', '順', '王'];
const SUIT = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as Record<string, string>;
// edo's suits are seasonal crests: wave, cherry blossom, chrysanthemum, pine
const SUIT_EDO = { s: 'waves', h: 'cherry blossom', d: 'chrysanthemum', c: 'pine' } as Record<string, string>;

const rk = (c: string): number => RANKS.indexOf(c[0]!);
const word = (r: number): string => RANK_NAME[r]!.toLowerCase();
const plural = (r: number): string => RANK_PLURAL[r]!.toLowerCase();
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const listNames = (n: string[]): string => (n.length <= 1 ? (n[0] ?? 'Someone') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);
const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** The five as the scenes show them: straights low to high, everything else by group, then rank. */
export function orderCards(cards: string[], cat: number): string[] {
  const c = cards.filter((x) => /^[2-9TJQKA][shdc]$/.test(x));
  if (cat === 4 || cat === 8 || cat === 9) {
    const wheel = c.some((x) => x[0] === 'A') && c.some((x) => x[0] === '2') && !c.some((x) => x[0] === 'K');
    const v = (x: string) => (wheel && x[0] === 'A' ? -1 : rk(x));
    return c.sort((a, b) => v(a) - v(b));
  }
  const n: Record<string, number> = {};
  for (const x of c) n[x[0]!] = (n[x[0]!] ?? 0) + 1;
  return c.sort((a, b) => n[b[0]!]! - n[a[0]!]! || rk(b) - rk(a));
}

/** The cyber "decrypting" frames: noise, then the hand name coming through. */
function scramble(s: string): string[] {
  const noise = '#$%&*/@!=?';
  const leet: Record<string, string> = { O: '0', E: '3', A: '@', S: '$', I: '!', L: '1', T: '7' };
  const f = (keep: number) => [...s].map((ch, i) => (ch === ' ' ? ' ' : ((i * 7 + 3) % 10) / 10 < keep ? ch : (leet[ch] && keep > 0.5 ? leet[ch] : noise[(i * 3 + Math.round(keep * 10)) % noise.length]))).join('');
  return [[...s].map((ch, i) => (ch === ' ' ? ' ' : noise[i % noise.length])).join(''), f(0.35), f(0.6), f(0.85)];
}

/** Every value a scene can ask for (see the key list in tools/design/gen/export_tiers.py). */
export function winValues(w: WinInfo, theme: ThemeKey): Record<string, string | boolean> {
  const cat = w.cat;
  const show = cat >= 0;
  const cards = orderCards(w.cards, cat);
  const many = w.names.length > 1;
  const name = listNames(w.names);
  const amt = fmt(w.amount);
  const r0 = cards[0] ? rk(cards[0]) : 12, rN = cards[cards.length - 1] ? rk(cards[cards.length - 1]!) : 12;
  const grp = cards.filter((c, i) => i === 0 || c[0] !== cards[i - 1]![0]).map(rk); // ranks by group
  const high = cat === 4 || cat === 8 || cat === 9 ? rN : r0;
  const low = cards[0] ? (cards[0][0] === 'A' && (cat === 4 || cat === 8) ? 12 : r0) : 0;
  const suits = theme === 'edo' ? SUIT_EDO : SUIT;
  const suit = suits[cards[0]?.[1] ?? 'h'] ?? '';
  const hand = show ? HAND[cat]! : 'Pot';
  const HANDU = hand.toUpperCase();
  const art = !show ? 'the' : cat === 2 || cat === 3 || cat === 7 ? '' : 'a';
  const desc = !show ? 'everyone else folded'
    : cat === 0 ? `${word(r0)} high`
    : cat === 1 ? `pair of ${plural(grp[0]!)}`
    : cat === 2 ? `${plural(grp[0]!)} and ${plural(grp[1]!)}`
    : cat === 3 ? `three ${plural(grp[0]!)}`
    : cat === 4 ? `${word(low)} to ${word(high)}`
    : cat === 5 ? `${word(high)}-high flush, all ${suit}`
    : cat === 6 ? `${plural(grp[0]!)} full of ${plural(grp[1]!)}`
    : cat === 7 ? `four ${plural(grp[0]!)}`
    : `${word(low)} to ${word(high)} of ${suit}`;
  const short = !show ? 'The pot' : cat === 6 ? `${cap(plural(grp[0]!))} full` : cat === 7 ? `Four ${plural(grp[0]!)}` : cat === 3 ? `Three ${plural(grp[0]!)}`
    : cat === 4 || cat === 5 ? `${cap(word(high))}-high ${hand.toLowerCase()}` : cat >= 8 ? hand : cap(desc);
  const two: [string, string] = !show ? ['THE', 'POT'] : ([
    [word(r0), 'high'], ['pair of', plural(grp[0]!)], ['two', 'pair'], ['three', plural(grp[0]!)], [word(high), 'straight'],
    [word(high), 'flush'], ['full', 'house'], ['four', plural(grp[0]!)], ['straight', 'flush'], ['royal', 'flush'],
  ][cat]!.map((s) => s.toUpperCase()) as [string, string]);
  const HIGH = !show ? '' : cat === 6 ? `${plural(grp[0]!)} full`.toUpperCase() : cat === 1 || cat === 3 || cat === 7 ? plural(grp[0]!).toUpperCase() : cat === 2 ? `${plural(grp[0]!)} and ${plural(grp[1]!)}`.toUpperCase() : `${word(high)} high`.toUpperCase();
  const prev = show && cat > 0 ? `← ${HAND[cat - 1]!.toUpperCase()}` : '';
  const next = show && cat < 9 ? `${HAND[cat + 1]!.toUpperCase()} →` : '';
  const NAME = name.toUpperCase();
  const year = String(new Date().getFullYear());
  const scr = scramble(HANDU);
  const v: Record<string, string | boolean> = {
    amount: String(w.amount), name, NAME, I: (w.names[0] ?? '?').charAt(0).toUpperCase(), amt, amtRaw: String(Math.round(w.amount)),
    wins: many ? 'win' : 'wins', takes: many ? 'take' : 'takes',
    hand, HAND: HANDU, H1: hand.charAt(0), HANDlen: String(HANDU.length), art, aHand: `${art} ${hand}`.trim(),
    madeA: !show ? `${many ? 'take' : 'takes'} the` : art ? `made ${art}` : 'made',
    L1: two[0], L2: two[1], desc, Desc: cap(desc), DESC: desc.toUpperCase(), Short: short, HIGH,
    ranksDot: show ? cards.map((c) => (c[0] === 'T' ? '10' : c[0])).join(' · ') : 'no showdown',
    CLS: String(cat + 1).padStart(2, '0'), JA: show ? JA[cat]! : 'ポット', EDO: show ? EDO[cat]! : '総取', EDO1: show ? EDO1[cat]! : '勝',
    PREV_A: prev, NEXT_A: next, TRAIN_LINE: show ? [prev, next].filter(Boolean).join(' · ') : 'NO SHOWDOWN',
    odds: cat === 9 ? '649,740' : '72,193', PKEY: cat === 9 ? 'ROYAL' : 'STR. FLUSH', PCT: cat === 9 ? '0.000154%' : '0.00139%',
    year, yy: year.slice(2), handNo: String(w.handNo || 1), TABLE: w.code ? `TABLE ${w.code.toUpperCase()}` : 'TRAIN POKER', tableAt: w.code ? `table ${w.code.toUpperCase()}` : 'the table',
    five: cat !== 7, scr0: scr[0]!, scr1: scr[1]!, scr2: scr[2]!, scr3: scr[3]!,
  };
  v.tw0 = String(`found ${art} ${HANDU}! +${amt} gold`.replace(/\s+/g, ' ').length);
  v.tw2 = String(`${NAME} obtained ${HANDU}!`.length);
  for (let i = 0; i < 5; i++) v[`card${i}`] = cards[i] ?? cards[cards.length - 1] ?? 'Ah';
  return v;
}

export function bustValues(b: BustInfo): Record<string, string | boolean> {
  const place = `${ordinal(b.place)} of ${b.of}`;
  return {
    bname: b.name, BNAME: b.name.toUpperCase(), place, PLACE: place.toUpperCase(),
    rebuyNote: b.rebuys ? ' · rebuy open' : '', stack: fmt(b.stack), seatNo: String(b.seatNo), seatNo2: String(b.seatNo).padStart(2, '0'),
  };
}

/** The design's own sample (Meera's hands, Arjun's bust-out): the text lengths each scene was drawn for. */
export function sampleValues(index: number, theme: ThemeKey): Record<string, string | boolean> {
  if (index === 4) return bustValues({ name: 'Arjun', place: 9, of: 13, rebuys: true, stack: 1000, seatNo: 5 });
  const S: [number, number, string[]][] = [
    [860, 4, ['8h', '9s', 'Td', 'Jc', 'Qh']], [1480, 5, ['Ah', 'Jh', '8h', '5h', '2h']],
    theme === 'edo' ? [2860, 7, ['9s', '9h', '9d', '9c', '2s']] : [2860, 6, ['Ks', 'Kh', 'Kd', '7c', '7s']], [4120, 9, ['Th', 'Jh', 'Qh', 'Kh', 'Ah']],
  ];
  const [amount, cat, cards] = S[index]!;
  return winValues({ names: ['Meera'], amount, cat, cards, handNo: 23, code: '' }, theme);
}

// ---------------- filling a template ----------------
const escH = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const escC = (s: string): string => s.replace(/["\\]/g, (c) => `\\${c}`).replace(/[<>]/g, '');
const use = (id: string, cls: string): string => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
/** The inside of a face-up card, exactly as the design's card() draws it at that size (s, m or l). */
function cardFace(code: string, size: string): string {
  const r = code[0]!, s = code[1]!;
  const rr = r === 'T' ? '10' : r;
  let inner = `<b class="r${rr === '10' ? ' ten' : ''}">${rr}</b>`;
  if (size !== 's') inner += use(`su-${s}`, 'su');
  inner += size === 'l' && 'JQK'.includes(rr) ? `<svg class="art" viewBox="0 0 60 80" aria-hidden="true"><use href="#f${rr}"/></svg>` : use(`su-${s}`, 'pip');
  if (size === 'l') inner += `<span class="ix2"><b>${rr}</b><svg aria-hidden="true"><use href="#su-${s}"/></svg></span>`;
  return inner;
}

export function fill(tpl: string, v: Record<string, string | boolean>, css = false): string {
  const esc = css ? escC : escH;
  const str = (k: string): string => { const x = v[k]; return typeof x === 'string' ? x : ''; };
  let out = tpl.replace(/\{\{#each (\w+)( raw)?\}\}([\s\S]*?)\{\{\/each\}\}/g, (_m, k: string, raw: string | undefined, body: string) =>
    [...str(k)].map((ch, i) => body.replace(/\{\{k\}\}/g, String(i)).replace(/\{\{ch\}\}/g, ch === ' ' ? (raw ? ' ' : '&nbsp;') : esc(ch))).join(''));
  out = out.replace(/\{\{\?(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, k: string, body: string) => (v[k] ? body : ''));
  out = out.replace(/\{\{cs:(\d)\}\}/g, (_m, i: string) => str(`card${i}`).charAt(1));
  out = out.replace(/\{\{ci:(\d):([sml])\}\}/g, (_m, i: string, size: string) => cardFace(str(`card${i}`), size));
  out = out.replace(/\{\{amt@([\d.]+)\}\}/g, (_m, f: string) => esc(fmt(Number(v.amount ?? 0) * Number(f))));
  return out.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => esc(str(k)));
}

// ---------------- fitting the real text ----------------
interface Fit { lines: number; l: number; r: number }
/** The block that lays out a marked text (an inline <b> inside a line counts as its line). */
function blockOf(el: Element): HTMLElement {
  let b = el as HTMLElement;
  while (b.parentElement && getComputedStyle(b).display === 'inline') b = b.parentElement;
  return b;
}
function fitBlocks(bn: HTMLElement): HTMLElement[] { return [...new Set([...bn.querySelectorAll('[data-fit]')].map(blockOf))]; }
function textBox(b: HTMLElement, hr: DOMRect, s: number, others: Set<HTMLElement>): Fit {
  // the text this block lays out itself (not that of blocks inside it, which are measured on their own)
  const rects: DOMRect[] = [];
  const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent?.trim() || n.parentElement?.closest('svg')) continue;
    // skip text laid out by another changing block inside this one (it is fitted on its own)
    let o: HTMLElement | null = blockOf(n.parentElement!);
    while (o && o !== b && !others.has(o)) o = o.parentElement;
    if (o !== b) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    rects.push(...[...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5));
  }
  const tops: number[] = [];
  for (const r of rects) if (!tops.some((t) => Math.abs(t - r.top) < r.height * 0.5)) tops.push(r.top);
  let l = Math.min(...rects.map((r) => r.left)), r = Math.max(...rects.map((x) => x.right));
  if (!rects.length) { // text drawn by CSS (content:) only: the element's own box and what overflows it
    const e = b.getBoundingClientRect();
    l = e.left; r = e.left + Math.max(e.width, b.scrollWidth * s);
  }
  return { lines: tops.length, l: (l - hr.left) / s, r: (r - hr.left) / s };
}
function measureFit(bn: HTMLElement, hr: DOMRect, s: number): Fit[] { const all = fitBlocks(bn), set = new Set(all); return all.map((b) => textBox(b, hr, s, set)); }
/** Shrink a text whose real words take more lines than the sample did, or run past the screen edge. */
function fitText(bn: HTMLElement, was: Fit[], hr: DOMRect, s: number): void {
  const all = fitBlocks(bn), set = new Set(all);
  all.forEach((b, i) => {
    const w = was[i];
    if (!w) return;
    // what shrinks: the changing text only (a marked block whole, or the marked words inside a line)
    const marked = b.matches('[data-fit]') ? [b] : [...b.querySelectorAll<HTMLElement>('[data-fit]')].filter((e) => blockOf(e) === b);
    const title = marked.some((m) => m.matches('[data-fit="h"]'));
    const els = marked.flatMap((m) => [m, ...m.querySelectorAll<HTMLElement>('*')]).filter((e) => !(e instanceof SVGElement) && !e.closest('.cd'));
    const size = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
    for (let f = 1, k = 0; k < 12; k++) {
      const now = textBox(b, hr, s, set);
      const wide = title && now.r - now.l > Math.max((w.r - w.l) * 1.04 + 1, Math.min(280, b.clientWidth * 0.9));
      if (!wide && now.lines <= Math.max(1, w.lines) && now.l >= Math.min(16, w.l) - 0.5 && now.r <= Math.max(374, w.r) + 0.5) break;
      f *= 0.92;
      els.forEach((e, j) => { e.style.fontSize = `${(size[j]! * f).toFixed(2)}px`; });
    }
  });
  // the trophy plate (svg text): squeeze the line into its width
  for (const t of bn.querySelectorAll<SVGTextElement>('text[data-fitw]')) {
    const max = Number(t.dataset.fitw);
    if (t.getComputedTextLength() > max) { t.setAttribute('textLength', String(max)); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
  }
}

// ---------------- playing a scene ----------------
/**
 * When each scene is at its fullest (a fraction of its length): the still picture for reduced motion, and
 * where the bust-out waits for the busted player's choice. Measured: the moment the most text is fully shown
 * at its designed size (for the multi-beat scenes, in the final beat, where the hand and the winner are).
 */
const PEAK: Record<string, number[]> = {
  classic: [0.55, 0.55, 0.775, 0.825, 0.6], noir: [0.55, 0.6, 0.6, 0.625, 0.625], ivory: [0.55, 0.675, 0.8, 0.7, 0.6],
  velvet: [0.575, 0.6, 0.75, 0.825, 0.6], cyber: [0.575, 0.625, 0.8, 0.85, 0.625], ink: [0.575, 0.675, 0.8, 0.85, 0.6],
  pixel: [0.55, 0.6, 0.8, 0.825, 0.6], train: [0.6, 0.6, 0.8, 0.875, 0.625], edo: [0.575, 0.7, 0.8, 0.875, 0.675],
};
export const peakOf = (theme: string, index: number): number => PEAK[theme]?.[index] ?? 0.7;

export interface PlayOptions {
  /** the overlay that covers the whole screen */
  over: HTMLElement;
  /** the live table (.tp root): shaken by the big scenes */
  table?: HTMLElement | null;
  theme: ThemeKey;
  /** 0..3 = tier 1..4, 4 = the bust-out moment */
  index: number;
  values: Record<string, string | boolean>;
  /** a still picture instead of the animation (reduced motion) */
  still?: boolean;
  /** no screen shake ('calm' motion) */
  calm?: boolean;
  /** where on screen the seat of the busted player is (bust-out only) */
  anchor?: { x: number; y: number } | null;
  /** bust-out: show working Rebuy / Watch buttons (only the busted player gets them) */
  buttons?: { rebuy: (() => void) | null } | null;
  /** for the lab and the tests: stop at this fraction of the scene and stay */
  pauseAt?: number;
}
export interface Playing { stop(): void; done: Promise<void>; el: HTMLElement }

export async function playTier(o: PlayOptions): Promise<Playing> {
  const all = await loadTiers();
  const sc = (all[o.theme] ?? all.classic!)[o.index]!;
  const W = o.over.clientWidth || innerWidth, H = o.over.clientHeight || innerHeight;
  // the 390 x 844 stage, scaled to fit the screen and centred
  const base = Math.min(W / 390, H / 844);
  let s = base, tx = (W - 390 * s) / 2, ty = (H - 844 * s) / 2;

  const wrap = document.createElement('div');
  wrap.className = `tpw-wrap${o.index >= 1 && o.index <= 3 ? ' tpw-tap' : ''}`;
  wrap.setAttribute('aria-hidden', 'true');
  const host = document.createElement('div');
  host.className = `tpw th-${o.theme} tpw-measure`;
  const place = () => { host.style.transform = `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${s.toFixed(5)})`; };
  place();
  const style = document.createElement('style');
  style.textContent = fill(sc.css, o.values, true);
  const bn = document.createElement('div');
  bn.className = 'bn';
  host.append(style, bn);
  wrap.append(host);
  o.over.prepend(wrap);
  // first the design's sample, to learn how many lines each changing text took, then the real result
  bn.innerHTML = fill(sc.html, sampleValues(o.index, o.theme));
  await document.fonts.ready;
  const hostBox = () => host.getBoundingClientRect();
  const was = measureFit(bn, hostBox(), s);
  bn.innerHTML = fill(sc.html, o.values);
  await document.fonts.ready;
  fitText(bn, was, hostBox(), s);
  // bust-out buttons: real for the busted player, gone for everyone else
  const btns = bn.querySelector('[data-tpw-btns]');
  if (btns && !o.buttons) btns.remove();
  else if (btns && !o.buttons?.rebuy) btns.querySelector('[data-tpw="rebuy"]')?.remove();

  type Box = { l: number; t: number; r: number; b: number };
  const box = (e: Element, hr: DOMRect): Box => { const r = e.getBoundingClientRect(); return { l: (r.left - hr.left) / s, t: (r.top - hr.top) / s, r: (r.right - hr.left) / s, b: (r.bottom - hr.top) / s }; };
  // a short screen (a phone held sideways): the whole phone stage would be tiny, so the stage is scaled to
  // what the scene actually shows (its words, cards and buttons), up to 0.9, and that is centred instead
  if (base < 0.9) {
    const hr = hostBox();
    const parts = [...bn.querySelectorAll<HTMLElement>('*')].filter((e) => !(e instanceof SVGElement)
      && (e.matches('.cd, img, [data-tpw]') || [...e.childNodes].some((n) => n.nodeType === 3 && !!n.textContent?.trim())
        || /^["'].+["']$/.test(getComputedStyle(e, '::after').content))); // a counter drawn by CSS
    let l = 390, t = 844, r = 0, bt = 0;
    for (const e of parts) {
      const b = box(e, hr);
      if (b.r - b.l < 1 || b.r < 0 || b.l > 390 || b.b < 0 || b.t > 844) continue;
      l = Math.min(l, Math.max(0, b.l)); t = Math.min(t, Math.max(0, b.t)); r = Math.max(r, Math.min(390, b.r)); bt = Math.max(bt, Math.min(844, b.b));
    }
    const want = r > l ? Math.min(W / (r - l + 24), H / (bt - t + 24), 0.9) : base;
    if (want > base * 1.05) {
      s = want; tx = W / 2 - ((l + r) / 2) * s; ty = H / 2 - ((t + bt) / 2) * s;
      place();
    }
  }
  if (o.anchor) { // the busted seat, in stage units
    const r = o.over.getBoundingClientRect();
    host.style.setProperty('--sx', `${((o.anchor.x - r.left - tx) / s).toFixed(1)}px`);
    host.style.setProperty('--sy', `${((o.anchor.y - r.top - ty) / s).toFixed(1)}px`);
  }

  // a screen of another shape: the scene's full-screen backdrops reach the screen edges (measured with the
  // animations off, so the boxes are where the design put them)
  const mL = tx / s, mR = (W - tx) / s - 390, mT = ty / s, mB = (H - ty) / s - 844;
  if (Math.max(mL, mR, mT, mB) > 0.5) {
    const hr = hostBox();
    const full = (b: Box) => b.l <= 1 && b.t <= 1 && b.r >= 389 && b.b >= 843;
    bn.style.overflow = 'visible';
    const grow: [HTMLElement | SVGElement, Box, Box][] = [];
    for (const e of bn.querySelectorAll<HTMLElement | SVGElement>('*')) {
      if (e.closest('svg') !== e && e.closest('svg')) continue; // inside a drawing
      const cs = getComputedStyle(e);
      const b = box(e, hr);
      if (full(b) && cs.overflow !== 'visible') e.style.overflow = 'visible';
      if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
      const leaf = e instanceof SVGElement || e.children.length === 0;
      const spansH = b.l <= 1 && b.r >= 389, spansV = b.t <= 1 && b.b >= 843;
      if (!leaf || (!spansH && !spansV)) continue;
      const p = (e as HTMLElement).offsetParent ?? e.parentElement;
      grow.push([e, b, p ? box(p, hr) : { l: 0, t: 0, r: 390, b: 844 }]);
    }
    for (const [e, b, pb] of grow) {
      const l = b.l <= 1 ? Math.min(b.l, -mL) : b.l, r = b.r >= 389 ? Math.max(b.r, 390 + mR) : b.r;
      const t = b.t <= 1 ? Math.min(b.t, -mT) : b.t, bt = b.b >= 843 ? Math.max(b.b, 844 + mB) : b.b;
      e.style.inset = 'auto';
      Object.assign(e.style, { left: `${l - pb.l}px`, top: `${t - pb.t}px`, width: `${r - l}px`, height: `${bt - t}px`, margin: '0' });
    }
  }
  host.classList.remove('tpw-measure');
  const shake = sc.shake && !o.still && !o.calm && o.pauseAt === undefined ? o.table : null;
  shake?.classList.add('tpw-shake');

  let resolve!: () => void;
  const done = new Promise<void>((r) => { resolve = r; });
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const t of timers) clearTimeout(t);
    wrap.remove();
    shake?.classList.remove('tpw-shake');
    resolve();
  };
  const anims = () => host.getAnimations({ subtree: true });
  const freeze = (at: number) => { for (const a of anims()) { a.pause(); a.currentTime = at; } };
  if (o.pauseAt !== undefined) freeze(o.pauseAt * sc.dur);
  else if (o.still) {
    freeze(peakOf(o.theme, o.index) * sc.dur);
    timers.push(setTimeout(stop, o.buttons ? 12000 : o.index === 0 ? 1500 : 2200));
  } else {
    // the end: the scene's own length, or later if staggered beats still run
    let end = sc.dur;
    for (const a of anims()) {
      const t = a.effect?.getComputedTiming();
      if (t && Number.isFinite(t.endTime)) end = Math.max(end, Math.min(Number(t.endTime), sc.dur + 1000));
    }
    if (o.buttons) timers.push(setTimeout(() => freeze(peakOf(o.theme, o.index) * sc.dur), peakOf(o.theme, o.index) * sc.dur), setTimeout(stop, 12000));
    else timers.push(setTimeout(stop, end + 50));
  }
  // tap to skip (tiers 2 to 4); the bust-out buttons
  if (wrap.classList.contains('tpw-tap')) wrap.addEventListener('pointerdown', (e) => { e.preventDefault(); stop(); });
  for (const b of bn.querySelectorAll<HTMLElement>('[data-tpw]')) {
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    const go = () => { if (b.dataset.tpw === 'rebuy') o.buttons?.rebuy?.(); stop(); };
    b.addEventListener('click', go);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  }
  if (bn.querySelector('[data-tpw]')) { wrap.removeAttribute('aria-hidden'); }
  return { stop, done, el: wrap };
}
