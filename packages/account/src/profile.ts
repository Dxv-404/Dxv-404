// What public.profile_page returns (supabase/migrations/20261111000022_profile.sql): everything the Profile
// page shows, in one answer. Numbers that come from the database as numerics may arrive as numbers or
// strings; the page reads them with Number().
export type Num = number | string;

export interface ProfileNightLine { name: string; hands: number[] | null; stacks: number[] | null }
export interface ProfileNight {
  game: string; crew: string | null; table: string; at: string; started_at: string;
  start_stack: number; big_blind: number; players: number; place: number;
  /** The game score (place points + chip score − rebuys). */
  score: Num; league: boolean; net: number; bb: Num | null;
  /** Everything bought in (the first buy-in plus rebuys). */
  buyins: number;
  /** The hands this player was dealt and the stack after each. */
  hands: number[]; stacks: number[];
  /** Chips added between hands: before which hand, how many. */
  rebuys: { before: number; chips: number }[];
  best: { hand: number; chips: number } | null;
  worst: { hand: number; chips: number } | null;
  achievements: { id: string; tier: number; hand: number | null }[];
  /** Everyone else at the table, for "Show table". */
  lines: ProfileNightLine[];
}
export interface ProfileDayGame { game: string; at: string; place: number; players: number; score: Num; bb: Num | null; league: boolean }
/** One India-time day with at least one finished game. */
export interface ProfileDay { day: string; games: number; score: Num; bb: Num | null; won: boolean; achievements: number; list: ProfileDayGame[] }
export interface HandTile {
  game: string; hand: number; at: string; chips: number; bb: Num | null; pot: number;
  /** 0 high card .. 9 royal flush, when the hand went to a showdown. */
  best_hand: number | null; showdown: boolean;
  /** The player's two cards (their own always; someone else's only when shown at the table). */
  cards: string[] | null; board: string[] | null;
}
export interface Streak { current: number; longest: number; longest_at?: string | null }
export interface ProfileSeason {
  id: string; number: number | null; title: string | null; name: string; ends_at: string;
  scoring: 'points' | 'bb' | 'average'; min_games: number;
  rank: number | null; ranked: boolean; avg: Num | null; points: Num | null; bb: Num | null;
  games: number; wins: number; top3: number; trend: string | null;
  /** Players ranked this season. */
  of: number;
  /** Nights won in a row, still going. */
  streak: number | null;
}
export interface OwnedAchievement {
  id: string; tier: number; at: string; game: string | null; hand: number | null; reveal: 'now' | 'night';
  /** On the profile other people see. */
  shown: boolean;
  /** Not seen on the profile yet (own page only). */
  new: boolean;
  detail: Record<string, string | number>;
}
export interface CardConfig { frame: string | null; backdrop: string | null; pose: string | null; finish: string | null; title: string | null; stats: string[]; emblem: string | null; tagline: string | null; back: string | null }
export interface ProfilePage {
  v: 1; own: boolean;
  account: { id: string; name: string; avatar: string | null; since: string };
  crews: { id: string; name: string; badge: string; color: string }[];
  crew: { id: string; name: string; badge: string; color: string; members: number; serial: number } | null;
  season: ProfileSeason | null;
  career: { hands: number; nights: number; wins: number; top3: number; showdowns: number; showdowns_won: number; bb: Num; hours: Num; bluffs: number; achievements: number };
  milestones: { values: Record<string, Num>; seen: Record<string, Num> };
  /** The last nights, newest first. */
  nights: ProfileNight[];
  /** The last 12 months, oldest first; only days with a game. */
  heatmap: ProfileDay[];
  moments: {
    biggest_won: HandTile | null; biggest_lost: HandTile | null; hand_of_season: HandTile | null;
    winning_hands: { hand: number; n: number }[];
    comebacks: { game: string; at: string; low: number; start_stack: number }[];
  };
  streaks: { wins: Streak; top3: Streak; weeks: Streak };
  history: {
    rank_after: { game: string; at: string; rank: number | null; played: boolean }[];
    seasons: { id: string; number: number | null; title: string | null; name: string; closed: boolean; current: boolean; rank: number | null; avg: Num | null; points: Num | null; bb: Num | null; games: number; wins: number; best_hand: number | null }[];
  } | null;
  achievements: OwnedAchievement[];
  /** How many of the crew have each achievement. */
  crew_has: Record<string, number>;
  card: CardConfig | null;
}
