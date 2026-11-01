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
  rebuys: boolean;
}

export interface Level { sb: number; bb: number; n: number }

export interface Player {
  id: PlayerId;
  name: string;
  seat: number;
  stack: number;
  buyins: number;
  sittingOut: boolean;
  leaving: boolean;
  connected: boolean;
  busted: boolean;
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
export interface PotResult { label: string; amount: number; awards: Award[]; hand: HandEval | null }
export interface HandResults { pots: PotResult[]; evals: Record<PlayerId, HandEval>; showdown: boolean }

export interface Hand {
  id: number;
  deck: Card[];
  board: Card[];
  burns: number;
  street: Street;
  /** Acting order, starting left of the button; the button is last. */
  order: PlayerId[];
  ps: Record<PlayerId, HandPlayer>;
  currentBet: number;
  lastFullRaise: number;
  toAct: PlayerId | null;
  lastAggressor: PlayerId | null;
  pots: unknown[];
  results: HandResults | null;
  revealed: Record<PlayerId, boolean>;
  shown: Record<PlayerId, boolean>;
  sbId: PlayerId | null;
  bbId: PlayerId | null;
  buttonId: PlayerId;
  runout: boolean;
  endedAt: number | null;
}

export interface LogLine { h: number; text: string }
export interface Stat { won: number; biggest: number }

export interface GameState {
  v: 1;
  gameId: string;
  cfg: GameConfig;
  level: Level;
  players: Player[];
  /** Seat index of the button; -1 before the first hand. */
  button: number;
  handNo: number;
  hand: Hand | null;
  phase: Phase;
  log: LogLine[];
  stats: Record<PlayerId, Stat>;
  paused: boolean;
  departed?: Player[];
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
  | { t: 'handStart'; handNo: number; buttonId: PlayerId; level: Level }
  | { t: 'blind'; pid: PlayerId; amount: number; kind: 'sb' | 'bb' }
  | { t: 'dealHole'; order: PlayerId[] }
  | { t: 'turn'; pid: PlayerId | null }
  | { t: 'act'; pid: PlayerId; a: Exclude<LastAction, null>; amount?: number; to?: number }
  | { t: 'refund'; pid: PlayerId; amount: number }
  | { t: 'collect' }
  | { t: 'street'; street: Street; cards: string[] }
  | { t: 'reveal'; cards: Record<PlayerId, string[]>; order?: PlayerId[] }
  | { t: 'win'; results: HandResults }
  | { t: 'show'; pid: PlayerId; cards: string[] }
  | { t: 'rebuy'; pid: PlayerId; amount: number }
  | { t: 'undo' };

export type ActResult = { events: GameEvent[]; error?: undefined } | { error: string; events?: undefined };

export interface Standing { id: PlayerId; name: string; stack: number; buyins: number; net: number; won: number; biggest: number }

export interface PlayerView {
  id: PlayerId; name: string; seat: number; stack: number; sittingOut: boolean;
  connected: boolean; busted: boolean; leaving: boolean; buyins: number;
}

export interface HandPlayerView {
  streetBet: number; total: number; folded: boolean; allIn: boolean;
  lastAction: LastAction; inHand: true; cards: string[] | null; revealed: boolean;
}

export interface HandView {
  id: number; board: string[]; street: Street; order: PlayerId[]; ps: Record<PlayerId, HandPlayerView>;
  toAct: PlayerId | null; currentBet: number; pot: number; collected: number;
  sbId: PlayerId | null; bbId: PlayerId | null; buttonId: PlayerId; results: HandResults | null; runout: boolean;
  pots: { amount: number; n: number }[] | null;
}

/** What one seat is allowed to see. Never contains another player's hidden cards or the deck. */
export interface View {
  gameId: string;
  phase: Phase;
  handNo: number;
  level: Level;
  cfg: Pick<GameConfig, 'startStack' | 'rebuys' | 'turnTime' | 'blindUpEvery'>;
  button: number;
  paused: boolean;
  players: PlayerView[];
  log: LogLine[];
  me: PlayerId;
  hand: HandView | null;
  legal: Legal | null;
  canUndo: boolean;
}
