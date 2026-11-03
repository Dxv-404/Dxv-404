# Table drama: authoring a character

This is the guide for drawing one more Ink character on top of the drama engine. The plan it implements is the
approved Claude Doc "Train Poker — Drama scenes & reactions plan" (sections *Who's who*, *Every dramatic moment*,
*How a scene is shot*, *Phones, tablets and laptops*, *The Ink cast*, *Ink scene list*, *Ink characters at other
tables*, *Settings, fairness and limits*). The Brawler (`apps/web/src/drama/characters/ink-brawler/`) is the
reference character: copy his folder, keep the structure, redraw everything.

## How the pieces fit

| Piece | Where | What it does |
| --- | --- | --- |
| Triggers | `packages/table/src/drama.ts` | Pure. From public events and views: positions, which moment fires, role, outcome, pile tier, crown, comeback, queue limits. The phones (to play) and the table server (to hold the turn timer) run the same `DramaTracker`. |
| Timer | `packages/table/src/room.ts`, engine input `hold` | The scene's length is given back to the player to act (their turn starts after it); after a hand the next deal waits for in-hand scenes. |
| Director | `apps/web/src/drama/director.ts` | On the game screen: the setting, the queue (one scene at a time), the three acts, tap to skip, motion levels. |
| Engine | `apps/web/src/drama/player.ts` | Plays one scene script: panels, camera, poses, effects, lettering. SVG; only `transform` and `opacity` animate. |
| Registry | `apps/web/src/drama/registry.ts` | Finds `characters/<avatar-id>/index.ts` and `sets/<theme>/index.ts` with `import.meta.glob`. Nothing to register by hand. |
| Format | `apps/web/src/drama/types.ts` | The types below, with the shared constants. |
| Shared art | `apps/web/src/drama/art.ts` | Brush strokes with line weight, tone patterns, sweat drops, anger marks, chips, speed and focus lines. |
| Lab | `/#/drama-lab` | Any character × moment × position × outcome × theme × screen, with play, replay and step-through. |

Assets load per table: a character's folder and a set's folder are separate chunks that load only when a table
needs them (`npm run build` lists them as `index-<hash>.js` chunks under `assets/`).

## File layout for a new character

```
apps/web/src/drama/characters/<avatar-id>/   e.g. ink-ronin (the folder name IS the avatar id)
  index.ts     export default { id, name, home, motif, poses, props, scenes, reactions } satisfies CharacterDef
  body.ts      (suggested) the rig / body parts: head(expression), torso, arms, hands
  poses.ts     (suggested) every named pose as a function of PoseCtx
  scenes.ts    (suggested) the scene scripts and reactions
```

Only `index.ts` is required, and only its default export is read. Never import another character's files; shared
drawing goes in `art.ts` (ask before changing it: everyone uses it). The avatar ids are in
`tools/design/avatars/avatars.json` (`ink-ronin`, `ink-monk`, `ink-brawler`, `ink-sensei`, `ink-kunoichi`,
`ink-ink-tiger`, `ink-crane`, `ink-enso-sun`).

## Poses

A pose is SVG markup (no `<svg>` wrapper) in **character space**: a 240 × 320 box, the character centred on
`x = 120`, seated behind the table. Use the constants in `types.ts`:

* `EYE_Y = 104`: the eye line of every seated character (animals and emblems too). This is what keeps one shared
  eye line in group shots.
* `TABLE_Y = 236`: the table's top edge. Forearms, fists and chips rest on it; the set draws the table front below.
* `HEAD_H = 64`: chin to crown, without hair. Bodies are about 3 heads from crown to the table.
* Standing poses keep the same scale; the feet go below the box (it is clipped by the panel, never by the pose).

A pose may be a string or `(c: PoseCtx) => string` (`c.initials` for the silhouette, `c.lite` on slow phones: drop
the finest hatching and extra tone). Poses are built once and cached.

**Pose naming**: lowercase, dash-separated, `<scene>-<beat>`, e.g. `allin-dom-1`, `allin-dom-2`, `fold-des`,
`rebuy-grip`. A pose that several scenes share gets a plain name (`fist-raise`).

**Required poses** (`REQUIRED_POSES`, checked by `apps/web/test/drama.test.ts`):
`sit`, `shock`, `glare`, `smug`, `win`, `out`, `lost`, `furious`, `stunned`, `split`, `rebuy`, `champion`.
They are what other characters' scenes and group shots use.

## Scene scripts

A scene is a short list of shots. The engine scales the shots' weights `w` to the moment's length (in-hand 1.2 to
1.8 s, results 3 to 5 s, a follow-up 0.8 s; `SCENE_MS` in drama.ts), so the same script works at any length.

```ts
interface Shot {
  cut: 'establish' | 'act' | 'reaction' | 'freeze';
  w: number;                       // share of the scene
  who?: 'star' | 'target' | 'losers' | 'cast' | 'table' | 'dealer';
  poses?: string[]; at?: number[]; // 2-4 key poses for an act; at = when each comes (0..1)
  cam?: Cam; wide?: Cam;           // close-up camera, character space; wide = sideways phones, tablets, laptops
  panel?: { tilt?: number; from?: 'left' | 'right' | 'top' | 'bottom'; inset?: boolean };
  fx?: ('speed' | 'speedV' | 'focus' | 'flash' | 'tone' | 'heavy' | 'shake' | 'splash' | 'dust' | 'shatter')[];
  sfx?: { text: string; x: number; y: number; size?: number; rot?: number; at?: number; red?: boolean }[];
  word?: string;                   // the big word (freeze)
  props?: { id: string; x: number; y: number; scale?: number; rot?: number; at?: number;
            move?: { x: number; y: number; rot?: number; scale?: number }; layer?: 'front' | 'back'; if?: string }[];
}
interface Cam { x: number; y: number; zoom: number; to?: { x: number; y: number; zoom: number } }
```

* **Cuts** (plan, *How a scene is shot*): `establish` ≈ 0.3 s, the room and the table (the engine draws it from the
  set; no poses needed); `act` 0.6 to 1.5 s, the star's signature move in 2 to 4 key poses; `reaction` 0.3 to 0.6 s,
  the target (in-hand) or the losers (results), drawn with *their own* character's reaction; `freeze` ≈ 0.3 s, the
  key pose held, ink splash, the word stamped in red, a small shake.
* **Camera**: `zoom 1` shows the whole 320-high box; `2` is waist-up; `3` a face. `to` pans or pushes in over the
  shot. Phones upright get close shots (waist-up); give `wide` a looser camera for sideways phones and laptops.
* **Props** travel with the character (the motif). `if: 'allin'` shows a prop only when the hand's first act had
  that moment: that is how a result calls back to the in-hand scene (the Brawler's ripped tape is on the floor).
* **Lookup** (`scenes` keys): `<moment>.<position>[.<variant>]` for in-hand moments, falling back to less specific
  keys; positions are `dominant`, `contender`, `desperateContender`, `desperate`; variants `call` and `raise` for
  `allinAnswered` and `bigBetAnswered`. Results: `allinResult`, `comeback`, `bigPot`, `split`, `rebuy`,
  `lastStanding` (the star is the winner, or the player rebuying).
* **Reactions** (`reactions` keys): `target`, `out`, `lost`, `split`, `comebackLost`, `lastLost`, `witness`. They are
  what *this* character does in someone else's scene. Missing keys fall back to `lost`.

### Example: the Brawler's dominant all-in

```ts
'allin.dominant': { shots: [
  { cut: 'establish', w: 0.16 },
  { cut: 'act', w: 0.5, poses: ['lift-1', 'lift-2', 'lift-3'],
    cam: { x: 120, y: 180, zoom: 1.5, to: { x: 120, y: 170, zoom: 1.7 } }, wide: { x: 120, y: 180, zoom: 1.2 },
    fx: ['speedV', 'shake'], sfx: [{ text: 'ゴゴゴ', x: 30, y: 70, rot: -12 }],
    props: [{ id: 'chips-slide', x: 150, y: 250, move: { x: 230, y: 300, rot: 20 } }] },
  { cut: 'reaction', w: 0.16 },
  { cut: 'freeze', w: 0.18, poses: ['lift-3'], word: 'ALL IN', fx: ['flash', 'splash', 'shake'] },
] },
```

## Style rules

* **Line weight** (character space, at 1×): outer contours 3.2 to 4.4 with tapered ends (`brush()` in art.ts, never a
  plain uniform stroke for a contour); inner folds and features 1.6 to 2.4; hatching and hair strands 0.7 to 1.1.
  Eyes and brows are the heaviest marks on the face (2.6 to 3.4) so expressions read at phone size.
* **Palette**: ink `#111`, paper `#f5f2ea`, white `#fff`, and ONE red `#e8202a` for the key accent only (the
  headband, anger marks, a seal, the word's accent). Greys are never flat fills: use screentone
  (`url(#dt-tone)` light dots, `url(#dt-tone2)` dense dots, `url(#dt-hatch)` lines; the engine defines them).
* **Screentone**: shadow side of a form gets `dt-tone`; deep shadow and clothing darks `dt-tone2` or solid ink with a
  white highlight streak. A defeated character gets the engine's `heavy` effect (a heavy-tone shadow from above).
* **Faces**: big and readable. Use the art.ts marks: `sweat(x, y, s)`, `anger(x, y, s)` (red), `shadowEyes(...)`
  (a band of ink over the eyes with white glints), `blush`, `tears`. Every character has at least: calm, angry,
  shocked (tiny pupils), smug, crushed (shadowed eyes), joy.
* **Shared scale and eye line**: draw seated poses with the eyes on `EYE_Y` and the table at `TABLE_Y`. Never scale a
  whole pose to fit; move the camera instead.
* **Props travel**: a character's motif props live in their own `props` and are drawn in their own style. Never
  draw Ink-set scenery (paper walls, the lamp, Kage) inside a character: the set and the dealer come from the
  table's theme (`SetDef`), so the same scene plays at a Velvet table.
* **Original**: nothing traced or copied from any film, anime or game. No stock poses: every act pose comes from
  the character's motif (plan, *Ink scene list*).
* **Limited animation**: 2 to 4 strong key poses per action; the panels, camera, speed lines and impact frames do
  the moving. Never tween a limb.

## Players without a character, and other tables

* Avatars with no character folder yet, and players on Initials, appear as the Initials silhouette
  (`characters/initials/`): an ink-wash figure with the initials on the chest and a plain set of poses.
* At a table whose theme has no set yet, scenes play on the neutral stage (`sets/neutral/`): a spotlight on that
  table's felt colours. A theme's set slots in as `sets/<theme>/index.ts`.
* The table's theme owns the room, the dealer, the chips, the frame and the word's lettering; the character keeps
  their line art. Close-ups of a guest character are home-style cut-in panels; katakana sound effects appear only
  inside an Ink character's own cut-ins. The room's light (`SetDef.light`) tints the character and sets the shadow.

## Checklist (every character)

1. `apps/web/src/drama/characters/<avatar-id>/index.ts` exists; `id` equals the folder name and a real avatar id.
2. All `REQUIRED_POSES` and every pose a script names exist; all 20 in-hand rows (5 moments × 4 positions; the
   answered moments with `call` and `raise` where the plan has both) and the 6 result scenes from the plan's scene
   list; reactions for `target`, `out`, `lost`, `split`, `comebackLost`.
3. The full-body figure is recognisably the avatar (same hair, marks, clothes, colours of red).
4. Lab review at **390×664**, **375×553**, **844×390** and **1440×900**: every scene, step through each shot; nothing
   covers the player's own cards or the action buttons on phones; the word is readable.
5. Motion **calm** (one still pose per shot) and **off** (a still card for 1.2 s) in the lab.
6. `pnpm -s typecheck`, `pnpm -s lint`, `pnpm -s test` (the registry test checks every character's poses and scripts).
7. Your e2e smoke test: copy `e2e/tests/drama.spec.ts`'s Brawler test, change the avatar id, run
   `pnpm -s build` then `PW_PORT=<your port> npx playwright test e2e/tests/drama.spec.ts --workers=1`.
