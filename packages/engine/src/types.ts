import type { Card } from './cards';

export type PlayerId = string;
export type Phase = 'lobby' | 'hand' | 'between' | 'ended';
export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
export type LastAction = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin' | null;

export interface GameConfig {
  startStack: number;
  sb: number;
  bb: number;
  /** Raise blinds every N hands; 0 = never. */
  blindUpEvery: number;
  /** Seconds per action; 0 = no timer. */
  turnTime: number;
  /** Time bank in seconds, used once the per-action time runs out. */
  timeBank: number;
  /** Seconds added back to every bank every `bankRefillEvery` hands (never above `timeBank`). */
  bankRefill: number;
  bankRefillEvery: number;
  /** Extra seconds, once per hand, when a player's connection drops on their turn. */
  disconnectGrace: number;
  rebuys: boolean;
  /** Rebuys per player; 0 = no limit. */
  maxRebuys: number;
  /** A rebuy is allowed only below this stack. New tables: 1, i.e. only at 0 chips (no top-ups). Tables saved
   *  before v3 keep the starting stack here (top-ups up to the starting stack). */
  rebuyBelow: number;
  /** Chips a rebuy brings the stack up to; 0 = the starting stack. A custom amount is 20 to 500 big blinds. */
  rebuyAmount: number;
  /** No rebuys after this blind level; 0 = always allowed. */
  rebuyUntilLevel: number;
  /** Antes start at this blind level (1 = from the start); 0 = never. */
  anteFromLevel: number;
  /** A player left of the big blind may post a straddle of 2 big blinds. */
  straddle: boolean;
  /** When everyone is all-in, players may agree to deal the rest of the board twice. */
  dealItTwice: boolean;
  /** Seconds players get to agree to Deal it twice. */
  dealItTwiceVote: number;
  /** Every phone adds randomness to each shuffle. */
  sharedShuffle: boolean;
  maxPlayers: number;
}

export interface Level { sb: number; bb: number; n: number; ante: number }

export interface Player {
  id: PlayerId;
  name: string;
  /** Position in the seat order, 0..n-1 (what screens use). */
  seat: number;
  /** Stable place at the table, 0..maxPlayers-1; empty chairs keep their number (dead button). */
  chair: number;
  stack: number;
  buyins: number;
  rebuysUsed: number;
  sittingOut: boolean;
  /** Sat out 3 hands in a row. */
  away: boolean;
  sitOutHands: number;
  leaving: boolean;
  connected: boolean;
  busted: boolean;
  /** Not dealt in until the big blind reaches this chair. */
  waitForBB: boolean;
  /** Owes blinds missed while sitting out. */
  missedSB: boolean;
  missedBB: boolean;
  /** Chose to post the owed blinds and play straight away. */
  postMissed: boolean;
  wantsStraddle: boolean;
  /** Seconds left in this player's time bank. */
  bank: number;
}

export interface HandPlayer {
  cards: Card[];
  streetBet: number;
  total: number;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  /** currentBet at the moment this player last acted (for re-open checks). */
  actedAt: number;
  lastAction: LastAction;
}

export interface Award { pid: PlayerId; amount: number }
export interface HandEval { score: number; name: string; desc: string; best: string[] }
export interface PotResult { label: string; amount: number; awards: Award[]; hand: HandEval | null; board?: 1 | 2 }
export interface HandResults { pots: PotResult[]; evals: Record<PlayerId, HandEval>; showdown: boolean; evals2?: Record<PlayerId, HandEval>; twice?: boolean }

export interface SeedInfo { dealerSeed: string; contributions: string[]; seed: string; dealerSeedCommit: string | null }

export interface TwiceVote { pids: PlayerId[]; yes: Record<PlayerId, boolean>; deadline: number }

export interface Hand {
  id: number;
  deck: Card[];
  board: Card[];
  /** Second board when the hand is dealt twice. */
  board2: Card[] | null;
  burns: number;
  street: Street;
  /** Acting order, starting left of the button; the button (or the seat before a dead button) is last. */
  order: PlayerId[];
  ps: Record<PlayerId, HandPlayer>;
  currentBet: number;
  lastFullRaise: number;
  toAct: PlayerId | null;
  lastAggressor: PlayerId | null;
  results: HandResults | null;
  revealed: Record<PlayerId, boolean>;
  shown: Record<PlayerId, boolean>;
  sbId: PlayerId | null;
  bbId: PlayerId | null;
  straddleId: PlayerId | null;
  /** Player on the button, or null when the button is dead (empty chair). */
  buttonId: PlayerId | null;
  buttonChair: number;
  sbChair: number;
  bbChair: number;
  runout: boolean;
  startedAt: number;
  endedAt: number | null;
  turnStartedAt: number;
  graceUsed: Record<PlayerId, boolean>;
  vote: TwiceVote | null;
  /** Fingerprint of the deck, published before any card is dealt. */
  deckCommit: string;
  seedInfo: SeedInfo;
  engineVersion: number;
}

export interface LogLine { h: number; text: string }
export interface Stat { won: number; biggest: number }

export interface GameState {
  v: 2;
  gameId: string;
  cfg: GameConfig;
  level: Level;
  players: Player[];
  /** Seat index of the button for screens (-1 before the first hand or when the button is dead). */
  button: number;
  /** Chair positions carried between hands for the dead-button rule (-1 before the first hand). */
  lastButtonChair: number;
  lastSBChair: number;
  lastBBChair: number;
  handNo: number;
  hand: Hand | null;
  phase: Phase;
  log: LogLine[];
  stats: Record<PlayerId, Stat>;
  paused: boolean;
  departed?: Player[];
  /** Blinds the host set, applied at the next hand. */
  pendingLevel: { sb: number; bb: number; ante: number } | null;
  /** Dealer's promise (hash) of the seed for the next hand, for Shared shuffle. */
  nextSeedCommit: string | null;
  /** Wall clock of the latest input (passed in, never read). */
  now: number;
}

export interface Action { type: ActionType; to?: number; force?: boolean }

export interface Legal {
  toCall: number;
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  isBet: boolean;
  minTo: number;
  maxTo: number;
  currentBet: number;
  streetBet: number;
  pot: number;
}

/** Events the engine emits for clients to animate. */
export type GameEvent =
  | { t: 'handStart'; handNo: number; buttonId: PlayerId | null; level: Level; deckCommit: string }
  | { t: 'ante'; pid: PlayerId; amount: number }
  | { t: 'blind'; pid: PlayerId; amount: number; kind: 'sb' | 'bb' | 'straddle' | 'deadsb' | 'missedbb' }
  | { t: 'dealHole'; order: PlayerId[] }
  | { t: 'turn'; pid: PlayerId | null; deadline?: number | null }
  | { t: 'act'; pid: PlayerId; a: Exclude<LastAction, null>; amount?: number; to?: number; auto?: boolean }
  | { t: 'refund'; pid: PlayerId; amount: number }
  | { t: 'collect' }
  | { t: 'street'; street: Street; cards: string[]; board?: 1 | 2 }
  | { t: 'reveal'; cards: Record<PlayerId, string[]>; order?: PlayerId[] }
  | { t: 'voteTwice'; pids: PlayerId[]; deadline: number }
  | { t: 'twice'; agreed: boolean }
  | { t: 'win'; results: HandResults }
  | { t: 'deckReveal'; dealerSeed: string; contributions: string[]; deckCommit: string }
  | { t: 'show'; pid: PlayerId; cards: string[] }
  | { t: 'rebuy'; pid: PlayerId; amount: number }
  | { t: 'presence'; pid: PlayerId; connected: boolean }
  | { t: 'sit'; pid: PlayerId; out: boolean; away: boolean }
  | { t: 'seat' }
  | { t: 'paused'; paused: boolean }
  | { t: 'level'; level: Level }
  | { t: 'undo' }
  | { t: 'ended' };

export type ActResult = { events: GameEvent[]; error?: undefined } | { error: string; events?: undefined };

export interface Standing { id: PlayerId; name: string; stack: number; buyins: number; net: number; won: number; biggest: number }

export interface PlayerView {
  id: PlayerId; name: string; seat: number; chair: number; stack: number; sittingOut: boolean; away: boolean;
  connected: boolean; busted: boolean; leaving: boolean; buyins: number; bank: number;
  waitForBB: boolean; missedSB: boolean; missedBB: boolean; rebuysUsed: number;
  /** The avatar the player picked (an id like "train-night-owl"; added by the table server). None: initials. */
  avatar?: string;
}

export interface HandPlayerView {
  streetBet: number; total: number; folded: boolean; allIn: boolean;
  lastAction: LastAction; inHand: true; cards: string[] | null; revealed: boolean;
}

export interface HandView {
  id: number; board: string[]; board2: string[] | null; street: Street; order: PlayerId[]; ps: Record<PlayerId, HandPlayerView>;
  toAct: PlayerId | null; currentBet: number; pot: number; collected: number;
  sbId: PlayerId | null; bbId: PlayerId | null; straddleId: PlayerId | null; buttonId: PlayerId | null;
  results: HandResults | null; runout: boolean;
  pots: { amount: number; n: number }[] | null;
  /** When the player to act will be timed out (ms, same clock as the inputs); null without a timer. */
  deadline: number | null;
  deckCommit: string;
  /** Revealed after the hand so any phone can check the deal. */
  proof: { dealerSeed: string; contributions: string[]; dealerSeedCommit: string | null } | null;
  vote: { pids: PlayerId[]; deadline: number; voted: PlayerId[] } | null;
}

export interface RebuyView {
  /** Rebuys allowed at this table at all. */
  on: boolean;
  /** Chips one rebuy gives (the stack becomes this). */
  amount: number;
  /** Rebuys per player; 0 = no limit. */
  max: number;
  /** Rebuys close after this blind level; 0 = never. */
  untilLevel: number;
  /** Closed by the blind level (the table is past untilLevel). */
  closed: boolean;
  /** Only at 0 chips (true for every new table); false on tables saved before v3, which allow top-ups. */
  atZero: boolean;
  /** The viewer's rebuys so far, and how many are left (null = no limit). */
  used: number;
  left: number | null;
  /** The viewer may rebuy right now; otherwise why not (null when they may). */
  can: boolean;
  why: string | null;
}

/** What one seat (or a spectator) is allowed to see. Never contains another player's hidden cards or the deck. */
export interface View {
  gameId: string;
  phase: Phase;
  handNo: number;
  level: Level;
  cfg: Pick<GameConfig, 'startStack' | 'rebuys' | 'turnTime' | 'blindUpEvery' | 'timeBank' | 'dealItTwice' | 'straddle' | 'maxPlayers' | 'maxRebuys' | 'rebuyUntilLevel'>;
  /** The table's rebuy rules and where the viewer stands with them. */
  rebuy: RebuyView;
  /** The viewer's night so far (pots won, biggest pot); null for a spectator. */
  stats: { won: number; biggest: number } | null;
  button: number;
  paused: boolean;
  players: PlayerView[];
  log: LogLine[];
  /** Viewer's player id; null for a spectator. */
  me: PlayerId | null;
  hand: HandView | null;
  legal: Legal | null;
  canUndo: boolean;
  engineVersion: number;
}

/** Everything that changes a table. Time and randomness always come in from outside. */
export type Input =
  | { t: 'join'; id: PlayerId; name: string; now: number; chair?: number; waitForBB?: boolean }
  | { t: 'start'; now: number; seed: string; contributions?: string[] }
  | { t: 'act'; pid: PlayerId; action: Action; now: number }
  | { t: 'tick'; now: number }
  | { t: 'presence'; pid: PlayerId; connected: boolean; now: number }
  | { t: 'sitOut'; pid: PlayerId; now: number }
  | { t: 'sitIn'; pid: PlayerId; postNow: boolean; now: number }
  | { t: 'rebuy'; pid: PlayerId; now: number }
  | { t: 'straddle'; pid: PlayerId; on: boolean; now: number }
  | { t: 'vote'; pid: PlayerId; yes: boolean; now: number }
  | { t: 'show'; pid: PlayerId; now: number }
  | { t: 'commitSeed'; commit: string; now: number }
  | { t: 'host'; cmd: 'pause' | 'resume' | 'undo' | 'end'; now: number }
  | { t: 'host'; cmd: 'move'; pid: PlayerId; dir: number; now: number }
  | { t: 'host'; cmd: 'remove'; pid: PlayerId; now: number }
  | { t: 'host'; cmd: 'setBlinds'; sb: number; bb: number; ante?: number; now: number };

/** Everything needed to replay one hand: the table just before it, and every input during it. */
export interface HandRecord {
  engineVersion: number;
  gameId: string;
  handNo: number;
  before: GameState;
  inputs: Input[];
  results: HandResults;
  deckCommit: string;
  proof: { dealerSeed: string; contributions: string[]; dealerSeedCommit: string | null };
  board: string[];
  board2: string[] | null;
  startedAt: number;
  endedAt: number;
}
