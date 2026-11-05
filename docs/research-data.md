# Train Poker research data: data dictionary

This is the reference for the research dataset the crew agreed to collect. It says what is recorded, when, in
which units, at what rate, with which caveats, how clocks and latency work, where the data is stored, and how
to export it. Everything here is capture only: no statistics or analysis are computed anywhere in the app or
the servers.

Code: `packages/research` (event model, queue, clock sync, samples, hand capture, ingestion, shipper, archive),
`packages/table/src/research-tap.ts` (the table server's recording), `apps/web/src/research/*` (the app's
recording), `apps/web/sw.template.js` (the service worker's recording), `supabase/migrations/20261105000020_research.sql`
(storage), `tools/research/export.mjs` (export).

---

## 1. The event model

Every event, whoever records it, has the same envelope. On the wire the keys are short; in the database each is a column.

| wire | column | type | meaning |
|---|---|---|---|
| `id` | `id` | uuid | Random event id, made when the event is made. A resend carries the same id; the database keeps it once. |
| `sv` | `sv` | int | Envelope schema version (now 1). |
| `t` | `type` | text | Event type (sections 3–5). |
| `v` | `v` | int | Payload version for this type (all 1 today). A payload change bumps it. |
| `src` | `src` | char | Recorder: `c` app (a page on a phone, tablet or laptop), `s` table server, `w` service worker. |
| `tc` | `tc` | float, ms | Recorder's wall clock (ms since 1970, `Date.now()`). For server events: when it happened on the server. |
| `tm` | `tm` | float, ms | Recorder's monotonic clock (`performance.now()`, ms since that page / process started; 0.001 ms resolution). Not comparable across sessions. Server hand events (made after the hand) carry the time they were written, not when they happened: use `tc`. |
| `s` | `session` | text | Recording session: one page load (app), one table room instance on a server (server), one service worker life (`sw-…`), one uploaded offline item (`off-…`). |
| `q` | `seq` | int | Sequence number within the session, from 1, no gaps. A gap means lost events, a repeat means a duplicate (both should not happen: see section 9). |
| `d` | `device` | text | Research device id: a random UUID made once per browser (`localStorage tp-rdev`). On server events, the device the player's connection said it was (newer apps); older apps: their Supabase sign-in id (the accounts feature's device), or null for guests. |
| `a` | `account` | uuid | The account (signed in), when known. |
| `g` | `guest` | text | This browser's guest seat id (`g` + 12 hex), when it has one. An app event can carry both `a` and `g`: that links a guest's earlier games to the account (guest-game claims). |
| `tb` | `table_code` | text | Table code (4 characters online; `OFFLINE` for the host phone; `QR` for QR host mode). |
| `gm` | `game_id` | uuid | League game id (server events only; the app does not know it). Join app events to games by `table_code` + time. |
| `h` | `hand_no` | int | Hand number at the table. |
| `st` | `street` | text | `preflop`, `flop`, `turn`, `river`, `showdown` (hand.end), `between` (between hands). |
| `app` | `app` | text | App version and build (`0.5.0+<git sha>`), or `server:oracle` / `server:cloudflare` / `server:host-upload`. |
| `ts` | `ts` | timestamptz | Server clock: when the ingestion layer received the batch (app and service worker events), or when a server event happened. |
| `p` | `payload` | json | The payload, kept exactly as sent. |
| — | `day` | date | UTC day of the event (from `tc` when believable, else the day it arrived). Partition key. |
| — | `received_at` | timestamptz | When the database stored the row. |

High-frequency streams (raise slider, mouse, motion) arrive as **sample batches** (`SampleBatch`):

```json
{ "t0": 1234.5, "dt": [33, 34, 33], "q": { "x": 1, "y": 1 }, "c": { "x": [512, 3, -2, 0], "y": [300, 0, 1, 1] } }
```

`t0` is the first sample's monotonic time (ms, same clock as `tm`), `dt` the gaps between samples (ms, rounded),
`q` the scale per column (stored integer = round(value × q)), and `c` per column the first value then deltas.
`null` marks a missing value (not part of the deltas). `decodeSamples()` in `packages/research/src/samples.ts`
and `tools/research` decode it. Example above: times t0, t0+33, t0+67, t0+100; x = 512, 515, 513, 513 px.

Identifiers inside payloads: players are identified by their seat id `pid`, which is the account UUID for a
signed-in seat and the guest id otherwise. The export replaces all of them with research ids (section 8).

---

## 2. Clocks and latency

Three clocks: the server's wall clock (`ts`, server `tc`), each device's wall clock (`tc`, can be wrong by
seconds or minutes, can jump), and each device's monotonic clock (`tm`, smooth, starts at 0 per page load).

**Clock samples** (NTP style, `clock.sync`): a request leaves the device at `t0` (monotonic), the server stamps
it with its wall clock `st`, the answer arrives at `t3`. Raw samples are recorded as `[kind, t0, st, t3]`:

- `ping`: `POST /research/ping`, 5 at session start (700 ms apart), 2 on coming back to the foreground, 1 every 5 min while visible;
- `http`: every research batch upload (the reply carries `st`);
- `ws`: every WebSocket ping at a table (every ~5 s when quiet), from `pong {c, s}`: here `t0 = t3 − rtt`.

To map a device's monotonic time to server time: `offset = st − (t0 + t3)/2`; server time ≈ `tm + offset`.
The error of one sample is at most `(t3 − t0)/2`; use the minimum-RTT samples near the moment of interest
(the app also records its own estimate, `est`, the min-RTT sample of the last 16, but only as a convenience).
Each `clock.sync` also has `wall` and `mono` (the device's two clocks read together), to map `tc` and `tm`.

**Latency per action**: the app records `act.send` (with `actionId`, monotonic send time = `tm`) and `act.ack`
(`rttMs` = ack time − send time, 0.1 ms). The server records `msg.in` with the same `actionId`, its receive time
`rx` (server wall clock) and `lag` (time to handle it). So for every action: client decision time
(`act.send.sinceTurnMs`, from when the turn appeared on that screen), server decision time
(`hand.action.decisionMs`, from the server's turn start to receipt), the round trip, and the one-way delays
(using the clock offset). `table.view` events record when each table update arrived on each device
(`recvWall`, and `tm`) with the server's send time (`at`), so display latency is known per update.

Caveats: browsers reduce timer precision (Chrome ~0.1 ms, Safari up to 1 ms; with privacy settings coarser).
Background tabs are throttled and may be frozen; events made while frozen get times from when the page wakes.

---

## 3. Server events (authoritative, `src = s`)

Recorded by the table room on both the Cloudflare and the Oracle builds (and, for nights uploaded from the
offline host phone, by the server that receives the upload). Hand events are worked out after each hand by
replaying the engine's exact hand record, so they cost nothing while players wait.

| type | when | payload |
|---|---|---|
| `table.open` | a table is created by the host's hello | `by` (pid), `settings` (as the host's app sent them), `cfg` (the engine's full config: blinds, stack, `blindUpEvery` hands, `turnTime` s, `timeBank` s, rebuys, `maxRebuys`, `rebuyAmount`, `rebuyUntilLevel`, straddle, `dealItTwice`, `maxPlayers` …), `crew` (uuid or null), `casual`, `gameId`, `server`, `offline`, `createdAt`, `openedAt` (ms) |
| `table.host` | hosting passes on | `from`, `to` (pids), `why` (`away` = host gone 60 s, `removed`) |
| `conn.open` | a socket connects | `c` (connection number in this session), `n` (sockets now) |
| `conn.hello` | a hello is answered | `c`, `ok`, `watch` (seated as a watcher), `asked` (asked to watch), `isNew` (new seat), `wasAway`, `code`/`message` (refused: why), `player` (the seat asked for), `v` (protocol), `lastSeq`, `spectate`, `ticket`/`token` (present or not, never the value), `settings` (present), `avatar`, `rs` (the app's research `{d, s}`: device and session, linking app and server data), `device`/`info` (the account's device and its kind/name), `offlineClaim`, `account` |
| `conn.close` | a socket goes | `c`, `pid`, `hello`, `spectator`, `account`, `ms` (connected for), `n` |
| `conn.bg` | the app says it went to the background or came back | `c`, `pid`, `hidden` |
| `seat.join` | a new player is seated (join order) | `pid`, `name` (as shown; removed by the export), `chair` (stable chair 0..max−1), `seat` (order index), `joinIndex`, `ever` (players so far incl. departed), `stack`, `waitForBB`, `host`, `account` (bool), `avatar`, `phase`, `handNo` |
| `seat.move` | one seat per player: `kind = elsewhere` (a second device of the account opened the table and watches; `heldBy`, `heldInfo`) or `moved` (Move seat here: `to`, `toInfo`, `from` [{c, d, info}]) | |
| `msg.in` | every action message (act, sit, rebuy, vote, straddle, show, host commands) | `c`, `pid`, `kind`, `actionId`, `msg` (the message without its id), `ok`, `error` (refusal text), `dup` (a resend), `rx` (server receive time, ms), `lag` (handling time, ms) |
| `game.input` | an engine input outside a hand's play: join, sit out / in, rebuy, straddle choice, presence (connected / lost), host pause / resume / undo / end / move / remove / setBlinds, seed commit | `input` (as applied, without its time), `events` (engine events), `player` (that player's state after: stack, chair, seat, sittingOut, away, connected, busted, leaving, buyins, rebuysUsed, waitForBB, missedSB/BB, postMissed, wantsStraddle, bank s), `phase`, `handNo`, `level`, `paused`, `pendingLevel` |
| `rebuy.offer` | after a hand, for each player at 0 chips | `pid`, `handNo`, `rebuy` (the table's rebuy view for them: on, amount, max, untilLevel, closed, used, left, can, why) |
| `react.send` | a reaction | `pid`, `reaction` |
| `push.sent` | the room asks for a push | `kind` (`turn`: player's turn waited 3 s; `looking` = an app of theirs was on screen, so no push was sent; `crewTable`: a crew table started, `except` count) |
| `hand.start` | a hand is dealt | `handNo`, `startedAt`, `level` {sb, bb, n, ante}, `levelChanged`, `button` {pid, chair}, `sbChair`, `bbChair`, `sb`/`bb`/`straddle` (pids), `order` (acting order: left of the button first, button last), `seed` {`dealer`, `contributions`, `combined`, `dealerCommit`, `deckCommit`}, **`deck`** (all 52 cards in dealt order: the exact shuffle), **`holes`** (every dealt player's two cards), `posts` (blinds and antes: pid, kind, amount), `players` (everyone at the table: pid, seat, chair, `stackBefore`, `stack` after posting, `dealt`, `pos`, sittingOut, away, waitForBB, missedSB/BB, connected, bank, buyins, rebuysUsed, wantsStraddle, leaving), `cfg`, `engineVersion` |
| `hand.decision` | every time a player is to act: their **information set** | `k` (decision index in the hand), `pid`, `pos` {i (index in acting order), n, fromBtn (0 = button), role (btn/sb/bb/str/null)}, `legal` {toCall, canCheck, canCall, canRaise, isBet, minTo, maxTo, currentBet, streetBet, pot}, `bank` (s left), `turnTime` (s), `turnStartedAt` (ms), `deadline` (ms, null without timer), `grace`, `hist` (actions so far: [orderIndex, action, to, chipsIn, street]), `pots` (pots built so far: amount, eligible pids), `view` (exactly the player's screen data: phase, handNo, level, rebuy view, their night stats, button, paused, all players without names, the hand with only their own cards and any shown cards, board, pot, bets, legal, deadline …) |
| `hand.action` | every action, including timeouts | `pid`, `a` (fold/check/call/bet/raise/allin), `to` (total street bet after), `amount` (chips put in now), `auto`, `timeout`, `requested` (what the app asked for; all-in is resolved by the engine), `pos`, `toCall`, `legal`, `potBefore`, `stackBefore`, `streetBetBefore`, `stackAfter`, `potAfter`, `sizePot` (= amount / potBefore), `sizeStack` (= amount / stackBefore), `toPot` (= to / potBefore), `decisionMs` (server: action time − turn start), `bankBefore`/`bankAfter` (s), `pots`, `stacks` (everyone, after) |
| `hand.street` | flop, turn, river (and second board) dealt | `street`, `cards`, `board` (1 or 2), `boardNow`, `board2Now`, `pot`, `pots`, `stacks`, `live` (pids not folded), `runout` |
| `hand.vote` | deal it twice: `offer` (pids, deadline), each `vote` (pid, yes), `result` (agreed, timedOut) | |
| `hand.show` | a player shows cards voluntarily | `pid`, `cards`, `voluntary`, `afterEnd` |
| `hand.end` | the hand ends | `board`, `board2`, **`holes`** (all, folded hands included), `folded`, `revealed` (shown at showdown by the rules: everyone still in shows), `shown` (by choice), `mucked` (never shown), `showdown`, `twice`, `pots` (label, amount, board, winning hand name, awards), `evals`/`evals2` (each showdown hand: score, name, best five), `stacksBefore`/`stacksAfter`, `net` (per pid, rebuys excluded), `contributed`, `level`, `deckCommit`, `decisions`, `ms`, **`inputs`** (the exact replay log, each with the server's time) and **`before`** (the table just before the hand: `Engine.replay(before, inputs)` reproduces the hand exactly) |
| `hand.cut` | the game is ended in the middle of a hand (chips go back, so no `hand.end`) | `handNo`, `street`, `before` (the table state before the hand), `inputs` (every input of the hand so far: replaying them on `before` with the engine rebuilds it exactly), `hand` (the live hand: holes, board, bets, pots), `refunded` |
| `game.end` | the night ends (End game, or everyone gone 20 min) | `game` (id, crew, table, server, casual, startStack, bigBlind, startedAt), `endedAt`, `hands`, `players` (key, account, name, buyins, final, minStack) |
| `offline.hand` | a hand from the offline host phone reaches a server | `game`, `handNo`, `players` (key, account, net, vpip …, as the league records it). It is followed by that hand's `hand.*` events (session `off-<game>-<hand>`, ids derived from the hand, so a repeated upload is stored once). |

Notes:
- Server hand events are emitted right after the hand, in order; their `tc` is when each happened.
- A hand cut short by the server's own loss (both a crash and the hand log lost) is not recorded; a server
  restart mid-hand continues the hand and records it whole.
- Rebuys taken: `msg.in` (kind `rebuy`) and `game.input` (input `rebuy`, events with the amount). A declined
  rebuy is a `rebuy.offer` with no rebuy after it; the app's `rebuy.sheet` says which button (if any) was tapped.
- Watchers joining: `conn.hello` with `watch: true`.
- `hand_cards_private` (the league's table of a player's own cards) is filled only for account seats, and is
  readable only by that player; the complete set (guests and folded hands too) is `hand.start.holes` /
  `hand.end.holes` here, server-side only.

---

## 4. App events (`src = c`)

Recorded by every page of the app. The table and hand on screen (`tb`, `h`, `st`) are on every app event
while a table is open.

### Session, device, attention, network, quality

| type | when | payload |
|---|---|---|
| `session.start` | page load | `session`, `device`, `sinceLastMs` (since this browser last went to the background or closed), `local` {iso, hour, minute, dow (0 = Sunday), tzOffsetMin, tz}, `url` {path, hash, referrer host}, `authUser` (the Supabase sign-in = accounts "device"), `installed` (Home Screen app), `visible`, `navType` (navigate/reload/back_forward) |
| `session.end` | page hidden for good (pagehide) | `why`, `ms` (page lifetime), `events`, `cost` (capture's own CPU time, see 9), `queue` (sent, dropped …) |
| `session.resume` | page restored from the back/forward cache | `kind` |
| `device.info` | session start | `ua`, `platform`, `lang`, `langs`, `uaData` (brands, mobile, platform), `screen` {w, h, aw, ah, depth}, `viewport` {w, h, vvw, vvh, vvScale, dpr, orient, angle}, `cores`, `memGB`, `touchPoints`, `installed`, `prefs` {dark, reducedMotion, contrastMore, reducedData, fontPx (root font size: font scale = fontPx/16), coarse, fine, hover, forcedColors}, `net` {type, eff, down Mbps, rtt ms, save}, `online`, `cookies`, `sw`, `notifications` (permission), `motion`, `orientation`, `motionNeedsPermission`, `tz`, `locale`, `server` |
| `device.change` | `kind`: `uaHigh` (model, platformVersion, fullVersionList, architecture, bitness, formFactors: Chrome only), `battery` (level 0–1, charging; on 1 % steps; Chrome only), `storage` (usage, quota), `net` (network change), `pref` (a media query changed: query, matches), `viewport` (resize, 500 ms debounce) | |
| `att.visibility` | page visible / hidden (background, lock, tab switch) | `state`, `prevMs` (time in the previous state) |
| `att.focus` | window focus / blur | `focused`, `prevMs` |
| `att.lifecycle` | `pagehide` (persisted), `freeze`, `resume` (Chrome's page lifecycle) | |
| `net.online` | browser online / offline | `online`, `net` |
| `net.status` | table connection status changes | `status` (connecting/live/offline/closed), `prev`, `prevMs`, `online` |
| `net.gap` | an update was missed (the app resyncs) | `have`, `got` (seq numbers) |
| `clock.sync` | every 15 s if new samples, and after pings | `s` (samples, section 2), `est` {offset, rtt, n}, `wall`, `mono` |
| `perf.load` | after load | navigation timing (ms): `type`, `dns`, `connect`, `ttfb`, `response`, `domInteractive`, `dcl`, `load`, `transfer`/`decoded` (bytes), `paints` (first-paint, first-contentful-paint), `sw` |
| `perf.frames` | for 2 s from each deal and each result animation (page visible) | `ctx` (`deal`/`result`), `dt` (every frame interval, ms, 0.1 ms) |
| `perf.capture` | every 60 s | `cost` {ms total, calls, max ms}: time spent in capture code, `queue` stats, `events`, `heapMB` (Chrome) |
| `err.client` | every uncaught error and unhandled rejection | `kind`, `msg`, `src`, `line`, `col`, `stack` (1500 chars), `screen` |
| `report.problem` | Report a problem sent | `text`, `screen` |

### Screens and input

| type | when | payload |
|---|---|---|
| `ui.screen` | a screen (route) opens | `name` (the screen's class: `menu`, `online`, `tp-screen` (the table), `crews …`, `replay`, `profile` …), `prev`, `prevMs` (dwell on the previous one), `prevScroll` (max scroll depth 0–1 reached there, null if it never scrolled), `hash` |
| `ui.sheet` | a sheet (panel) opens / closes | `label`, `open`, `ms` (on close), `screen` |
| `ui.scroll` | scroll depth passes a new maximum (+5 %) | `depth` 0–1, `top`, `height`, `screen`, `el` |
| `ui.tap` | every click on an interactive element (buttons, links, tabs, tiles, inputs …) | `k` (element key: test id, `act:<table action>`, `x:`/`p:`/`k:`/`tab:`/`av:` data keys, else tag + aria-label or text), `x`, `y` (CSS px), `pt` (touch/pen/mouse/keyboard), `downMs` (press duration), `pressure`, `cw`/`ch` (contact size), `screen`, `dis` (disabled) |
| `ui.abort` | touched or pressed but not activated: moved off (`how: moved off`, `dx`, `dy`) or cancelled (scroll gesture) | `k`, `ms`, `pt`, `screen` |
| `ui.hover` | mouse over an interactive element for ≥ 80 ms, on leaving it | `k`, `ms`, `screen` |
| `ui.key` | every key press | outside text boxes: `key` (single characters and named keys; others `other`), `code`, modifiers, `focus`, `screen`. A held key is recorded once; on release (if held ≥ 250 ms or it repeated) `up: true`, `code`, `ms` held, `repeats`. In text boxes: only `typing: true`, `field`, `len`, never the text |
| `ui.orient` | orientation change | `type`, viewport |
| `table.view` | `open`/`close` of a table screen; every table update (`update`: seq, server send time `at`, `recvWall`, event count `n`); every welcome (`welcome`: seq, missed, serverTime) | |
| `turn.start` | a turn appears on this screen (`kind: ended` when it ends without an action from here: timeout or another device) | `handNo`, `street`, `legal`, `turnLeftMs`, `turnTotalMs`, `pot`, `board`, `cards` (own), `players`, `live`, `blinds`, `visible`, `focused`, `events` (event types in that update) |
| `act.send` | anything sent to the table | `kind` (act/show/rebuy/sit/vote/straddle/host/react/moveSeat), `actionId`, the message fields, `sinceTurnMs` (client decision time, monotonic), `legal`, `via` (`button:pointer`, `button:keyboard`, `key:f/c/r`, `raise`), `pt` (last pointer type), `wall`, `visible` |
| `act.ack` | the table answered | `actionId`, `ok`, `error`, `rttMs`, `kind` |
| `table.peek` | hold to look at the cards (and release) | `on`, `how` (pointer type or `key`), `myTurn` |
| `raise.path` | the raise sheet closes | `spot` (minTo, maxTo, currentBet, toCall, pot, bb, isBet), `ms` (open time), `result` (`go`/`cancel`), `final`, `marks` ([ms since open, kind, value]: `step` ±1, `snap` preset/key, `drag` start:pointerType/end, `pad` open/shut, `type` digit), `batch` (amount path `to`, every distinct value, at most ~30 Hz; a value that comes too soon is recorded in the next 34 ms slot, the latest wins) |
| `mouse.path` | mouse only (laptops). During the player's own turn at 20 Hz, otherwise 2 Hz; flushed at each turn's end and every 10 s | `phase` (`turn`/`idle`), `hz`, `vw`, `vh`, `buttons` (the action buttons' rectangles at flush time: k, x, y, w, h, for approach paths), `batch` (x, y px) |
| `rebuy.sheet` | the bust-out sheet: `shown` (sheet kind, place, of, handNo, rebuy view), `choice` (rebuy/watch/leave, ms), `closed` (ms) | |
| `qr.state` | QR host mode (legacy, the engine runs on the host phone): after every change, on the host phone | `seq`, `events`, `phase`, `handNo`, `level`, `button`, `players` (stacks …), `hand` (board, toAct, currentBet, pot, order, turnStartedAt, every player's cards, `seed`, results, legal) |

Pre-selected actions (check/fold ahead): the current table screen has none (they existed only in the retired
legacy table), so there is nothing to record.

### Motion sensors

| type | when | payload |
|---|---|---|
| `motion.perm` | session start (`not-required` (Android/desktop), `unsupported`), the iOS answer (`granted`/`denied`/`error`, `ms`, `via` = the tap it rode on), or `no-events` once (the browser has the API but sends no data: laptops) | |
| `motion.samples` | a recording window closes. Windows: from the moment the player's cards are dealt (`dealt`) and from each of their turns (`turn`), until their decision (`decision`), fold, hand over or leaving | `from`, `to` (why it started / ended), `ms`, `rawEvents`, `hz` (10), `batch` with columns `ax ay az` (acceleration including gravity, m/s², ×100), `lx ly lz` (acceleration without gravity, m/s², ×100), `ra rb rg` (rotation rate α β γ, deg/s, ×10), `oa ob og` (orientation α β γ, deg, ×10) |
| `motion.hold` | every 15 s at a table outside windows: listens for 1 s | `n`, `accMean`, `accSd` (m/s²), `rotMax` (deg/s), `beta`, `gamma`, `state` (`held` if accSd > 0.12 or rotMax > 3, else `resting`), `rule` |

iOS asks permission inside the player's first tap on sit, join or open (or any tap on the table); nothing else
is shown. Listeners exist only inside windows and the 1 s listens. Values are as the browser reports them
(axes in the device frame; iOS and Android differ in sign conventions for some fields).

### Around the table

| type | when | payload |
|---|---|---|
| `api.call` | every call to the accounts project (crews, settings, profile, devices, history, push …) | `fn` (database function, `table:<name>` for table reads/updates, `auth:<op>` for sign-in), `method`, `status`, `ms`, `ok`, `err`, `args` (arguments; secrets replaced by `[r:<length>]`: anything named like a code, token, ticket, key or push credential; crew invite codes also get a fingerprint `[r:len:fnv]` so a join can be matched to its preview), `result` (answers up to 1.5 KB, same redaction; secret functions only their length). This is where crew create/join/leave/kick/role changes, invites and requests (and the leader's decision: `decide_join_request` timing vs the request), crew settings, seasons, trophies reads, profile creation (`ensure_account`), renames, guest-game claims (`claim_guest_games`), device linking (`new_device_code`, `redeem_device_code`), "Not me" logouts (`logout_phone`), push settings (`save_push`/`remove_push`), offline confirmations and disputes (`confirm_offline_game`, `dispute_offline_seat`) appear. |
| `settings.change` | a setting is saved | `key` (theme, sound, motion, largeText, fourColor, holdToPeek …), `from`, `to`, `where`, `screen` |
| `avatar.browse` | picker `open` (current, tab), `tab` (from, to, fromMs), `pick` (id, ms), `close` (`saved`, `final`, `before`, `ms`, `tabs` [[tab, ms]], `picks` [[ms, id]], `viewedMs` {avatar id: ms on screen ≥ 50 % visible}) | |
| `crew.view` | a crew tab is drawn (`kind: tab`: crew, tab (home/overview/league/games/members/trophies), size, role, cached) or a player card is opened (`kind: card`: crew, account) | |
| `replay.view` | a replay opens (`open`: game, hand, players (whose hands), steps, mine, myCards) and each step shown (`step`: step, of, say, prevMs (time on the previous step)). Total time: the `ui.screen` dwell of the replay screen | |
| `id.event` | `seatElsewhere` (this device watches: the seat is on another of the account's devices) and `seatMoved` | `device` (kind, name) |
| `push.prompt` | the in-app card (`shown`, `dismissed`, `accepted`, `not-enabled`, `failed`, with `ms`) and the browser's own prompt (`browser`: before, after, ms) | |
| `push.open` | the app opened or came forward after a notification tap | `via` (`launch`, `launch-late`, `message`), `clickId` (the `push.click` event id), `clickAt`, `msSinceClick`, `action` (`join` = Join now), `kind`, `tag`, `hash` |

---

## 5. Service worker events (`src = w`)

| type | when | payload |
|---|---|---|
| `push.arrive` | a push reaches the phone | `kind`, `tag`, `url`, `title` |
| `push.click` | a notification is tapped | `at`, `action` (`join` or empty), `kind`, `tag`, `url`, `appOpen` (an app window existed) |

The worker sends them straight to the ingestion endpoint; if it cannot, they wait in IndexedDB and the app
sends them at its next start. Service worker events carry the device id but no account or guest id.
Pushes the database queues itself (approvals, trophies, season ends; sent by the worker's 3-minute outbox job)
are visible only as `push.arrive` on the phone.

---

## 6. Sampling and rates (summary)

| stream | rate | when |
|---|---|---|
| raise amount | every distinct value, ≤ ~30 Hz | raise sheet open |
| mouse | 20 Hz own turn, 2 Hz otherwise | table screen, mouse only |
| motion | 10 Hz (from ~60 Hz sensor events, latest value per 100 ms) | cards dealt → decision; own turns |
| motion hold | 1 s every 15 s | table screen, outside windows |
| frames | every frame for 2 s | deal and result animations |
| clock | pings at start/foreground/5 min; every upload; every WS pong | always |
| capture cost | 60 s | always |

---

## 7. Storage, partitions, archive

**Ingestion.** The app sends batches (`POST /research/ingest`, plain-text JSON `{"events": [...]}`, ≤ 512 KB,
≤ 1000 events, ≤ 64 KB per event) every 4 s, and on going to the background (beacon). The endpoint runs on the
Cloudflare table worker (`https://train-poker-tables.apins-subdomain.workers.dev`) and on the Oracle build. It
checks every event's shape (bad ones are dropped one by one; a phone may send only `c` and `w` events), limits
each device (60 batches and 4 MB a minute), stamps `ts`, and writes to the database through the signed
`research_ingest` function (the table servers' recorder key, `RECORDER_TOKEN`). The Oracle build answers at once
and writes in the background (batches wait on disk under `DATA_DIR/research` when the database is down); the
Cloudflare worker answers after the write (503 → the app retries). The table rooms' own events go through the
same function from a shipper in each Durable Object (failed batches kept in its storage) or the Node process.

**Database** (`research` schema, migration `20261105000020_research.sql`): `research.events` partitioned by
`day` (one partition per UTC day, made 9 days ahead by the daily job; a default partition catches anything
else), primary key `(day, id)` only (repeats dropped), payload as `json`. `research.subjects` holds the research
ids. `research.archive_log` records every archived slice. Phones have no access: no grants on the schema,
row-level security on every table with no policies; every function needs the recorder signature.

**Archive** (Cloudflare cron `47 22 * * *` UTC, R2 bucket `train-poker-research`, binding `RESEARCH_ARCHIVE`):
days older than `RESEARCH_KEEP_DAYS` (default 7) move to

```
research/v1/day=YYYY-MM-DD/type=<type>/part-<first id>-<last id>.ndjson.gz   rows of that day and type (one JSON row per line)
research/v1/day=YYYY-MM-DD/manifest-<first id>-<last id>.json               the slice: rows, sha256 of its ids, each file's rows, bytes, sha256
research/v1/subjects/subjects-YYYY-MM-DD.json.gz                            the research ids, daily
```

A slice is ≤ 5000 rows; one run handles ≤ `RESEARCH_ARCHIVE_MAX_ROWS` (40 000) rows, the rest waits a day. Each
file is read back and checked (SHA-256 and line count) before the manifest is written and read back, and only
then does the database delete the slice, and only if the same rows are still there (count and SHA-256 over
their ids). Re-running after any failure writes identical files and deletes once. A slice whose delete was
refused leaves files whose rows a later slice archives again: the export drops repeated ids. Archived rows are
the database rows with their raw ids (the bucket is private); research ids are applied at export.

**Size estimate** (measured): an 8-player, 90-hand night recorded by the server is 6 511 events, 13.2 MB of
JSON, 6.8 MB in Postgres (payloads above 2 KB are compressed), 0.8 MB gzipped in the archive. Decision
snapshots are 70 % of it (≈ 4.6 KB each with 8 players). The app adds, per player-night (≈ 3 h, 90 hands, a
phone with motion sensors): ≈ 40 rows per hand (turns, sends, acks, ≈ 25 table updates, motion windows of
≈ 3–4 KB, taps), plus holds, clock samples and timings: ≈ 1.8–2.4 MB in Postgres. **Total ≈ 3 MB per
player-night (≈ 24 MB for an 8-player night).** The free 500 MB database (minus the accounts data) holds ≈ 18–19
such nights without archiving; with the 7-day archive it holds at most one week (≈ 3–4 nights at three a week ≈
75–100 MB). The archive grows ≈ 2–3 MB per 8-player night (gzipped).

---

## 8. Research ids, export, names

Every account, guest and device seen gets a random research id (`research.subjects`, made at first sight,
never changed). Exports use only research ids:

```sh
RECORDER_TOKEN=... node tools/research/export.mjs --from 2026-11-01 --to 2026-11-30 --out research-export \
  [--archive-dir <local copy of the bucket> | --r2]   # R2: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
  [--no-db] [--names]
```

It reads the archive (each file checked against its manifest) and the database for the range, keeps each event
id once, and writes `research-export/events/<type>.ndjson` (one row per line: `id, type, v, sv, src, ts, tc, tm,
session, seq, device, account, guest, table, game, hand, street, app, received, p`), `subjects.ndjson` (`rid,
kind, first_seen`) and `manifest.json` (counts per type, sources, duplicates dropped). Account, guest and device
ids are replaced by research ids everywhere (envelope, payload values and payload keys such as `holes`); fields
named like names are replaced by `[name]`, and every known name (account names and seat names) is scrubbed from
any text. Rows are not sorted: sort by `session, seq` (within a recorder) or by server time.

`--names` also writes `tools/research/private/name-map.json` (research id → account name and seat names). That
folder and `research-export/` are git-ignored; the map must never be committed or shared with the dataset.

---

## 9. Data quality

- Every event has the envelope version (`sv`), the app version and build (`app`), the payload version (`v`), and
  a per-session sequence number: `count(*) = max(seq)` per app session means nothing was lost (the last events
  of a page that was killed may be missing; they are saved and sent at the next start when possible).
- The app's queue holds up to 6000 events / 1.5 MB in memory and saves up to ~1.2 MB in this browser's storage
  when it cannot send; over the cap the oldest go first and are counted (`queue.dropped` in `perf.capture` and
  `session.end`).
- Repeats (a resend, a beacon followed by a normal upload, an archive slice re-done) are dropped by event id in
  the database and again in the export.
- The capture's own cost is measured (`perf.capture.cost`: total ms in capture handlers per minute). In tests,
  queueing one event costs ≈ 0.01 ms.
- Settings `tp-research-off = 1` in a browser's storage turns its capture off (tests use it to act as an older
  app); `tp-research-url` points the uploads elsewhere (tests). A build served from `localhost` never sends to
  the live endpoint (unless pointed somewhere with `tp-research-url` or `tp-server-override`).
- Older apps: they send no research ids in `hello` and record nothing; the server still records their game
  (device null on their events).
