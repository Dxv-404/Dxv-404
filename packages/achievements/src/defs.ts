// The 37 achievements as data: what each is called, how it is earned, how rare it is and which card part
// it unlocks. The checker (hand.ts, night.ts, history.ts) decides who earned what; the profile page and
// the cabinet read this table for the words. Ids are stored in the database, so they never change.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type Group = 'cards' | 'play' | 'nights' | 'crew' | 'hidden';
export interface Unlock { kind: 'frame' | 'backdrop' | 'pose' | 'finish' | 'title'; name: string }
export interface Tier { at: number; rarity: Rarity; unlocks: Unlock[] }

export interface AchievementDef {
  id: string;
  name: string;
  /** How to earn it, in the words shown under a locked one. */
  how: string;
  group: Group;
  rarity: Rarity;
  unlocks: Unlock[];
  /** Shown as "???" until earned. */
  hidden: boolean;
  /** Counted achievements: tier 1, 2, 3... is earned when the count reaches `at`. */
  tiers?: Tier[];
  /** When the checker can tell: after a hand, when the night ends, or from the crew's history. */
  when: 'hand' | 'night' | 'history';
}

const u = (kind: Unlock['kind'], name: string): Unlock[] => [{ kind, name }];
const d = (id: string, name: string, how: string, group: Group, rarity: Rarity, when: AchievementDef['when'], unlocks: Unlock[] = [], more: Partial<AchievementDef> = {}): AchievementDef =>
  ({ id, name, how, group, rarity, unlocks, hidden: group === 'hidden', when, ...more });

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // ---- the cards you hold
  d('quads', 'Quads', 'Win a hand with four of a kind', 'cards', 'rare', 'hand', u('frame', 'Four Corners')),
  d('straight_flush', 'Straight Flush', 'Make a straight flush', 'cards', 'legendary', 'hand', u('finish', 'Foil')),
  d('royal', 'Royal', 'Make a royal flush', 'cards', 'mythic', 'hand', u('backdrop', 'Throne Room')),
  d('the_wheel', 'The Wheel', 'Win with A-2-3-4-5', 'cards', 'uncommon', 'hand', u('pose', 'Smirk')),
  d('seven_deuce', 'Seven-Deuce Glory', 'Win a pot holding 7-2 offsuit, the worst starting hand', 'cards', 'rare', 'hand', u('title', 'The Worst Hand Wins')),
  d('set_mining', 'Set Mining', 'Flop three of a kind with a pocket pair', 'cards', 'common', 'hand'),
  d('pocket_rockets', 'Pocket Rockets, Grounded', 'Lose a showdown holding aces', 'cards', 'uncommon', 'hand', u('title', 'Aces Cracked')),
  d('cooler', 'Cooler', 'Lose a showdown with a full house or better', 'cards', 'rare', 'hand', u('backdrop', 'Rain')),
  d('board_plays', 'Board Plays', 'Split a pot because the five board cards were the best hand for everyone', 'cards', 'uncommon', 'hand'),
  // ---- how you play
  d('stone_cold_bluff', 'Stone Cold Bluff', 'Win a pot with no pair and no draw by betting and getting everyone to fold', 'play', 'uncommon', 'hand', u('pose', 'Poker Face'), {
    tiers: [{ at: 1, rarity: 'uncommon', unlocks: u('pose', 'Poker Face') }, { at: 10, rarity: 'rare', unlocks: [] }, { at: 50, rarity: 'epic', unlocks: [] }],
  }),
  d('hero_call', 'Hero Call', 'Call a river bet with one pair or less and win', 'play', 'rare', 'hand', u('title', 'I Knew It')),
  d('great_fold', 'Great Fold', 'Fold two pair or better to a bet when the other player really had you beat', 'play', 'rare', 'hand', u('title', 'The Reader')),
  d('check_raise', 'Check-Raise', 'Check, then raise the bettor on the same street, and win the pot', 'play', 'uncommon', 'hand'),
  d('the_trap', 'The Trap', 'Check or call with three of a kind or better on the flop and win a pot over 30 big blinds', 'play', 'rare', 'hand', u('backdrop', "Spider's Web")),
  d('runner_runner', 'Runner-Runner', 'Win at showdown when you needed both the turn and the river to be ahead', 'play', 'epic', 'hand', u('finish', 'Gloss')),
  d('survivor', 'Survivor', 'Be all-in and behind when the chips went in, then win', 'play', 'rare', 'hand', u('pose', 'Relieved')),
  d('ten_high_hero', 'Ten-High Hero', 'Win a showdown with ten-high or worse', 'play', 'epic', 'hand', u('title', 'All Nerve')),
  d('second_best', 'Second Best', 'Lose with the second-best possible hand on that board', 'play', 'uncommon', 'hand'),
  // ---- your nights
  d('phoenix', 'Phoenix', 'Win a night after dropping below 20% of your starting stack', 'nights', 'epic', 'night', u('backdrop', 'Ashes and Fire')),
  d('flawless', 'Flawless', 'Win a night with no rebuys and never below your starting stack', 'nights', 'legendary', 'night', u('finish', 'Etched')),
  d('wire_to_wire', 'Wire to Wire', 'Chip leader from hand 10 to the end, and win', 'nights', 'rare', 'night', u('frame', 'Laurel')),
  d('double_up', 'Double Up', 'Double your stack in a single hand', 'nights', 'common', 'hand'),
  d('bounty_hunter', 'Bounty Hunter', 'Knock out 3 players in one night', 'nights', 'rare', 'hand', u('title', 'Bounty Hunter')),
  d('rebuy_royalty', 'Rebuy Royalty', 'Rebuy 2 or more times and still finish top 3', 'nights', 'uncommon', 'night', u('title', 'Never Dead')),
  d('last_hand_best_hand', 'Last Hand, Best Hand', 'Win the last hand of the night and take the lead with it', 'nights', 'rare', 'night'),
  d('iron_focus', 'Iron Focus', 'Play a 30+ hand night with no timeouts', 'nights', 'common', 'night'),
  // ---- crew and seasons
  d('regular', 'Regular', 'Hands played', 'crew', 'common', 'hand', u('frame', 'Regular 100'), {
    tiers: [
      { at: 100, rarity: 'common', unlocks: u('frame', 'Regular 100') },
      { at: 500, rarity: 'uncommon', unlocks: u('frame', 'Regular 500') },
      { at: 1000, rarity: 'rare', unlocks: [{ kind: 'frame', name: 'Regular 1,000' }, { kind: 'finish', name: 'Gold Leaf' }] },
      { at: 5000, rarity: 'legendary', unlocks: u('frame', 'Regular 5,000') },
    ],
  }),
  d('every_week', 'Every Week', 'Play at least once a week for 4 weeks in a row', 'crew', 'uncommon', 'history', u('backdrop', 'Calendar Wall')),
  d('podium', 'Podium', 'Finish a season in the top 3', 'crew', 'epic', 'history', u('frame', 'Podium')),
  d('champion', 'Champion', 'Win a season', 'crew', 'legendary', 'history', u('finish', 'Holographic')),
  d('nemesis', 'Nemesis', 'Finish above the same player 3 nights in a row', 'crew', 'uncommon', 'history', u('title', "[name]'s Problem")),
  d('full_house_party', 'Full House Party', 'Play a night with every member of the crew at the table', 'crew', 'uncommon', 'history', u('backdrop', 'Crowded Table')),
  d('host', 'Host', 'Host 10 games', 'crew', 'uncommon', 'history', u('pose', 'Host')),
  d('night_owl', 'Night Owl', 'Play a hand after 2:00 AM', 'crew', 'uncommon', 'hand', u('backdrop', 'Midnight')),
  // ---- hidden: "???" until earned
  d('trust_issues', 'Trust Issues', 'Peek at your cards 20 times in one hand', 'hidden', 'uncommon', 'hand'),
  d('same_again', 'Same Again', 'Win two hands in a row with the exact same starting hand', 'hidden', 'epic', 'hand'),
  d('gone_fishing', 'Gone Fishing', 'Time out three hands in a row', 'hidden', 'common', 'hand'),
];

export type AchievementId = string;
export const ACHIEVEMENT: Readonly<Record<string, AchievementDef>> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

/** The tier a count has reached (0 = none yet) for a counted achievement. */
export function tierFor(id: string, count: number): number {
  const t = ACHIEVEMENT[id]?.tiers;
  if (!t) return 0;
  let n = 0;
  for (const x of t) if (count >= x.at) n++;
  return n;
}

/** Rarity and unlocks of one owned achievement (a tier of a counted one has its own). */
export function ownedLook(id: string, tier = 0): { rarity: Rarity; unlocks: Unlock[] } | null {
  const a = ACHIEVEMENT[id];
  if (!a) return null;
  const t = a.tiers?.[tier - 1];
  return t ? { rarity: t.rarity, unlocks: t.unlocks } : { rarity: a.rarity, unlocks: a.unlocks };
}

// ---------------------------------------------------------------- milestones
// Tiered goals shown as progress bars, so there is always a next one in view.
export interface MilestoneTrack { id: string; name: string; unit: string; steps: number[]; reward?: (step: number) => string | null }

export const MILESTONES: readonly MilestoneTrack[] = [
  { id: 'hands', name: 'Hands played', unit: 'hands', steps: [100, 500, 1000, 5000], reward: (s) => (s === 1000 ? 'Frame and Gold Leaf finish' : 'Frame') },
  { id: 'nights', name: 'Nights played', unit: 'nights', steps: [5, 25, 50, 100] },
  { id: 'wins', name: 'Wins', unit: 'wins', steps: [1, 5, 15, 40] },
  { id: 'showdowns', name: 'Showdowns won', unit: 'showdowns', steps: [25, 100, 300] },
  { id: 'bluffs', name: 'Bluffs that worked', unit: 'bluffs', steps: [1, 10, 50], reward: (s) => (s === 1 ? 'Pose: Poker Face' : null) },
  { id: 'bb', name: 'Big blinds won', unit: 'big blinds', steps: [100, 500, 2000] },
  { id: 'weeks', name: 'Weekly streak', unit: 'weeks', steps: [2, 4, 8, 12], reward: (s) => (s === 4 ? 'Backdrop: Calendar Wall' : null) },
  { id: 'achievements', name: 'Achievements collected', unit: 'achievements', steps: [10, 20, ACHIEVEMENTS.length] },
];

export interface MilestoneBar {
  id: string; name: string; unit: string;
  /** Where the player is, the step they are working towards and the one before it (0 at the start). */
  value: number; next: number; prev: number;
  /** 0..1 along the whole way to `next` (what the bar shows) . */
  part: number;
  /** Every step is reached. */
  done: boolean;
  /** Steps reached so far. */
  reached: number;
  reward: string | null;
}

/** One bar per track from the player's numbers (a missing number counts as 0). */
export function milestoneBars(values: Readonly<Record<string, number | undefined>>): MilestoneBar[] {
  return MILESTONES.map((t) => {
    const value = Math.max(0, Math.floor(Number(values[t.id]) || 0));
    const reached = t.steps.filter((s) => value >= s).length;
    const done = reached === t.steps.length;
    const next = t.steps[Math.min(reached, t.steps.length - 1)]!;
    const prev = done ? (t.steps[t.steps.length - 2] ?? 0) : (t.steps[reached - 1] ?? 0);
    return { id: t.id, name: t.name, unit: t.unit, value, next, prev, part: done ? 1 : Math.min(1, value / next), done, reached, reward: t.reward?.(next) ?? null };
  });
}

/** The `n` closest unfinished milestones: the largest part of the way there first; ties keep the table's order. */
export function nextMilestones(values: Readonly<Record<string, number | undefined>>, n = 3): MilestoneBar[] {
  return milestoneBars(values).filter((b) => !b.done).map((b, i) => ({ b, i })).sort((x, y) => y.b.part - x.b.part || x.i - y.i).slice(0, n).map((x) => x.b);
}
