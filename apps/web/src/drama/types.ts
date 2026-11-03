// Table drama: the authoring format (docs/drama-authoring.md is the guide). A character is a set of drawn key
// poses plus scene scripts; a set is a theme's room. Both are plain data, found by the registry (registry.ts)
// from their folder, so adding a character never means editing a shared file.
import type { InHandKind, Moment, Outcome, Position, ResultKind } from '@tp/table';

export type { InHandKind, Moment, Outcome, Position, ResultKind };

// ---------------------------------------------------------------- the shared drawing space
/**
 * Character space: every pose is drawn in a 240 x 320 box, the character centred on x = 120, seated behind the
 * table, so every character shares one scale and one eye line:
 * - EYE_Y: the eye line of a seated adult-sized character (animals and emblems put their eyes here too);
 * - TABLE_Y: the table's top edge (hands and chips rest on it; below it is the table front);
 * - HEAD_H: a head is about this tall (chin to crown, without hair);
 * standing poses keep the same scale (the eyes go up to about y = 40, the feet are below the box).
 */
export const CHAR_W = 240;
export const CHAR_H = 320;
export const EYE_Y = 104;
export const TABLE_Y = 236;
export const HEAD_H = 64;
/** World space (establish and group shots): the room, 1600 x 900, the table's centre at TABLE_C. */
export const WORLD_W = 1600;
export const WORLD_H = 900;

// ---------------------------------------------------------------- characters
/** What a pose is drawn with (the player's initials, for the silhouette; the room's light). */
export interface PoseCtx { initials: string; lite: boolean }
/** SVG markup in character space (no <svg> wrapper), or a function giving it. */
export type PoseDef = string | ((c: PoseCtx) => string);

/**
 * Required poses (every character has them; scenes may use any others the character draws):
 * - sit: neutral, seated at the table (establish and group shots);
 * - shock, glare: a target's reactions to a bet aimed at them;
 * - win, smug: a winner in group shots;
 * - out, lost, furious, stunned: losers (knocked out; still in; beaten by a comeback) and a comeback winner;
 * - split: sharing a pot; rebuy: taking new chips; champion: the last one standing.
 */
export const REQUIRED_POSES = ['sit', 'shock', 'glare', 'smug', 'win', 'out', 'lost', 'furious', 'stunned', 'split', 'rebuy', 'champion'] as const;

/** A prop the character carries (their motif travels with them to every table) or draws for one scene. */
export interface PropDef { svg: PoseDef; /** drawn in front of the character (default) or behind */ layer?: 'front' | 'back' }

/**
 * Reactions: what this character does in someone else's scene. Keys: 'target' (a bet aimed at them), 'out',
 * 'lost', 'split', 'comebackLost', 'lastLost', 'witness'. Missing keys fall back to 'lost', then to the pose of the
 * same name.
 */
export interface Reaction { poses: string[]; sfx?: Sfx[]; props?: PropUse[]; fx?: Fx[] }

export interface CharacterDef {
  /** The avatar id this character is drawn from ('ink-brawler'); 'initials' is the silhouette. */
  id: string;
  name: string;
  /** The theme the character belongs to: their cut-ins are drawn in its style at other tables. */
  home: string;
  /** Running motif, in a few words (for the lab and the docs). */
  motif: string;
  poses: Record<string, PoseDef>;
  props?: Record<string, PropDef>;
  /**
   * Scene scripts where this character is the star. Keys: `<moment>.<position>[.<variant>]` for in-hand moments
   * (variant: call | raise, for the answered moments), and `<result>` for results (the star won it). Lookup falls
   * back from the most specific key: allinAnswered.dominant.raise -> allinAnswered.dominant -> allinAnswered.
   */
  scenes: Record<string, SceneScript>;
  reactions: Record<string, Reaction>;
}

// ---------------------------------------------------------------- scenes
export type Cut = 'establish' | 'act' | 'reaction' | 'freeze';
export type Fx = 'speed' | 'speedV' | 'focus' | 'flash' | 'tone' | 'heavy' | 'shake' | 'splash' | 'dust' | 'shatter';
export type Framing = 'phone' | 'small' | 'land' | 'tablet' | 'laptop';

/** The camera on a close-up, in character space: the point at the panel's centre and how much of the height shows. */
export interface Cam {
  x: number; y: number;
  /** 1: the whole 320-high character fits the panel's height; 2: half of it (waist-up), 3: a face. */
  zoom: number;
  /** Move to this by the end of the shot (a pan or a push-in). */
  to?: { x: number; y: number; zoom: number };
}

/** A sound effect lettered on the panel (katakana; only inside a character's own home-style cut-in). */
export interface Sfx { text: string; x: number; y: number; size?: number; rot?: number; /** 0..1 of the shot */ at?: number; red?: boolean }

/** A prop placed in a shot (character space), optionally moving. */
export interface PropUse {
  id: string; x: number; y: number; scale?: number; rot?: number;
  /** 0..1 of the shot: when it appears (default 0) */
  at?: number;
  /** where it moves to by the end of the shot */
  move?: { x: number; y: number; rot?: number; scale?: number };
  layer?: 'front' | 'back';
  /** Only when the first act had this moment (a callback): e.g. 'allin' */
  if?: string;
}

export interface Shot {
  cut: Cut;
  /** Share of the scene (all shots' weights are scaled to the moment's length). */
  w: number;
  /** Who is in the panel. Defaults: establish -> table, act/freeze -> star, reaction -> target (in-hand) or losers. */
  who?: 'star' | 'target' | 'losers' | 'cast' | 'table' | 'dealer';
  /** Key poses (2 to 4 for an act), shown in turn; `at` (0..1) when each comes, evenly spaced if left out. */
  poses?: string[];
  at?: number[];
  /** Phones held upright and small phones. */
  cam?: Cam;
  /** Phones sideways, tablets and laptops (wider shots). Falls back to cam. */
  wide?: Cam;
  panel?: { tilt?: number; from?: 'left' | 'right' | 'top' | 'bottom'; inset?: boolean };
  fx?: Fx[];
  sfx?: Sfx[];
  /** The big word, in the table's lettering with a red accent (freeze shots). */
  word?: string;
  props?: PropUse[];
}

export interface SceneScript { shots: Shot[] }

// ---------------------------------------------------------------- sets (a theme's room)
export interface SeatSpot { x: number; y: number; scale: number }
export interface SetDef {
  /** The theme key ('ink'), or 'neutral' for the stand-in stage. */
  id: string;
  /** The room in world space (WORLD_W x WORLD_H): walls, lamp, the dealer behind the table; drawn behind the seats. */
  back(o: { lite: boolean; felt: string; rim: string }): string;
  /** The table top and front, drawn over the seated characters' laps. */
  table(o: { lite: boolean; felt: string; rim: string }): string;
  /** Where seated characters go (behind the table, left to right), and the scale that keeps one eye line. */
  seats: SeatSpot[];
  /** The dealer, in character space (rebuy scenes; a silent witness in results). */
  dealer: Record<string, string>;
  /** The table's edge in character space (close-ups at this table), at TABLE_Y. */
  edge(o: { felt: string; rim: string }): string;
  /** A close-up's background in this room (character space). */
  closeBg(o: { lite: boolean }): string;
  /** The room's light on the characters: a multiply tint and the shadow's side. */
  light: { tint: string; alpha: number; side: -1 | 1 };
  /** Lettering for the big word. */
  font: string;
  ink: string; paper: string; red: string;
  /** Chips and the winner's piles in character space: pile(0|1|2), and the crown. */
  pile(tier: 0 | 1 | 2): string;
  crown(): string;
  chips(n: number): string;
}

/** A theme's felt and rim colours (for the neutral stage). */
export interface TableColours { felt: string; rim: string }
