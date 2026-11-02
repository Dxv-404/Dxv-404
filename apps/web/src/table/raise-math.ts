// The numbers behind the raise sheet (design: tools/design/gen/v3raise.py): every amount it can show comes
// from the engine's legal limits, so whatever is on screen is a raise the server accepts as it is.

/** What the engine allows this seat right now (its Legal), plus the big blind. All amounts are "raise to". */
export interface Spot {
  minTo: number; maxTo: number;
  /** the bet to match on this street, and what calling it costs */
  currentBet: number; toCall: number;
  /** every chip in the middle, this street's bets included */
  pot: number;
  bb: number;
  /** no bet yet on this street: it is a bet, not a raise */
  isBet: boolean;
}

export type PresetKey = 'min' | 'half' | 'tq' | 'pot' | 'all';
export interface Preset { key: PresetKey; label: string; to: number }

/** Never below the minimum raise, never above the stack; whole chips. */
export const clampTo = (s: Spot, x: number): number => Math.max(s.minTo, Math.min(s.maxTo, Math.round(Number.isFinite(x) ? x : s.minTo)));

/** − and +: one big blind per step (n steps; Shift with a key moves five). */
export const stepTo = (s: Spot, to: number, dir: 1 | -1, n = 1): number => clampTo(s, to + dir * n * Math.max(1, s.bb));

/**
 * Min, ½ pot, ¾ pot, pot and all-in. A pot-sized raise first matches the bet (the call goes into the pot)
 * and then raises by the whole pot: currentBet + (pot + toCall) × fraction.
 */
export function presets(s: Spot): Preset[] {
  const after = s.pot + s.toCall;
  const at = (f: number) => clampTo(s, s.currentBet + after * f);
  return [
    { key: 'min', label: 'Min', to: s.minTo },
    { key: 'half', label: '½ pot', to: at(0.5) },
    { key: 'tq', label: '¾ pot', to: at(0.75) },
    { key: 'pot', label: 'Pot', to: at(1) },
    { key: 'all', label: 'All-in', to: s.maxTo },
  ];
}

/** ↑ and ↓: the next preset amount above (or below) the current one, ending at all-in (or the minimum). */
export function nextPreset(s: Spot, to: number, dir: 1 | -1): number {
  const vals = [...new Set(presets(s).map((p) => p.to))].sort((a, b) => a - b);
  if (dir > 0) return vals.find((v) => v > to) ?? s.maxTo;
  return [...vals].reverse().find((v) => v < to) ?? s.minTo;
}

/** Which preset reads as selected: the one picked, while the amount is still its amount; else any that matches. */
export function selected(s: Spot, to: number, picked: PresetKey | null): PresetKey | null {
  const ps = presets(s);
  if (picked && ps.find((p) => p.key === picked)?.to === to) return picked;
  if (to === s.maxTo) return 'all';
  return ps.find((p) => p.to === to)?.key ?? null;
}

/** Typed digits: anything above the stack is all-in; below the minimum it raises the minimum. */
export function typedTo(s: Spot, digits: string): { to: number; below: boolean; over: boolean } {
  const n = Number(digits.replace(/\D/g, '') || '0');
  return { to: clampTo(s, n), below: n < s.minTo, over: n >= s.maxTo };
}

/** What the digits may become when one more key is pressed (leading zeros dropped, never longer than the stack allows). */
export function typeKey(s: Spot, digits: string, key: string): string {
  if (key === '⌫' || key === 'Backspace') return digits.slice(0, -1);
  if (!/^\d+$/.test(key)) return digits;
  const next = (digits + key).replace(/^0+(?=\d)/, '');
  // one digit more than the stack has is enough to say "all of it"
  return next.length > String(s.maxTo).length + 1 ? digits : next === '0' ? '' : next;
}

/** The slider: where an amount sits (0 to 1) and the amount at a point (whole big blinds, the ends exact). */
export const sliderPos = (s: Spot, to: number): number => (s.maxTo <= s.minTo ? 1 : (clampTo(s, to) - s.minTo) / (s.maxTo - s.minTo));
export function sliderTo(s: Spot, f: number): number {
  const x = Math.max(0, Math.min(1, f));
  if (x >= 0.995) return s.maxTo;
  if (x <= 0.005) return s.minTo;
  const raw = s.minTo + x * (s.maxTo - s.minTo);
  const bb = Math.max(1, s.bb);
  return clampTo(s, Math.round(raw / bb) * bb);
}

/** Holding − or +: the first repeat after HOLD_START ms, then every 120 ms, every 60 ms once held a second. */
export const HOLD_START = 300;
export const holdEvery = (heldMs: number): number => (heldMs < 1000 ? 120 : 60);

/** The words: "Bet" or "Raise", and the button: "Bet 40", "Raise to 650", "All-in 1,840". */
export const title = (s: Spot): string => (s.isBet ? 'Bet' : 'Raise');
export function goLabel(s: Spot, to: number, fmt: (n: number) => string): string {
  if (to >= s.maxTo) return `All-in ${fmt(s.maxTo)}`;
  return s.isBet ? `Bet ${fmt(to)}` : `Raise to ${fmt(to)}`;
}
export function underLabel(s: Spot, to: number, fmt: (n: number) => string): string {
  if (to >= s.maxTo) return 'all your chips';
  return `${s.isBet ? 'bet' : 'raise to'} · min ${fmt(s.minTo)}`;
}
/** What the table is sent. */
export const actionFor = (s: Spot, to: number): { type: 'allin' } | { type: 'bet' | 'raise'; to: number } =>
  (to >= s.maxTo ? { type: 'allin' } : { type: s.isBet ? 'bet' : 'raise', to: clampTo(s, to) });
