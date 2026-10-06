# Train Poker — Requirements

No-Limit Texas Hold'em for a group of friends, one phone per player, played on a train with no internet and no WiFi.

## 1. Connectivity (the hard constraint)

- **No internet at the table.** The app is opened once while online (to install it); after that it runs fully offline.
- **One phone per player.** Every player sees only their own hole cards on their own phone.
- **How phones talk without WiFi:** one phone turns on its mobile hotspot (works with mobile data off — the hotspot is just a local network). Everyone joins that hotspot. Phones then connect directly to each other over it (WebRTC peer-to-peer, no server).
- **How phones find each other:** by scanning QR codes, camera to screen.
  - Host shows a join QR → guest scans it → guest shows a reply QR → host scans it → connected. Two scans per player, about 10 seconds.
- **Host is authoritative.** The host phone runs the game (shuffle, rules, pots). Other phones send actions and receive only what they are allowed to see.
- **Reconnects.** If a phone locks, crashes or reloads: the game keeps going, the player is marked "away", and the host can re-pair them with the same two scans. They get their seat, chips and cards back.
- **Host survives a reload.** Full game state is saved on the host phone after every action and restored on reopen.
- **Screen stays awake** during play (Wake Lock).
- **No login, no accounts, no ads, no tracking.**

## 2. Session flow

1. **Create table (host):** enter the player list (names; host included), starting stack, small/big blind, optional blind increase schedule, optional turn timer, rebuys on/off.
2. **Lobby:** each name gets a seat. Host pairs each phone to a name via QR. Host can reorder seats, rename, remove. Game starts when at least 2 players are connected.
3. **Play hands** continuously — a hand ending never ends the game. Button moves every hand.
4. **Between hands:** players can sit out / come back, rebuy (if allowed), late players can be added, busted players can rebuy or leave.
5. **End game (host):** final standings with each player's net result (+/− vs. total buy-ins), then back to step 1 with the previous list prefilled for the next game.

## 3. Rules (No-Limit Texas Hold'em, done properly)

- 2–9 players. Cryptographically random shuffle (`crypto.getRandomValues`, Fisher–Yates).
- Blinds posted automatically. **Heads-up rule:** button posts the small blind and acts first preflop, last after the flop.
- Dead/missing seats handled; a short-stacked blind posts all-in for what they have.
- Streets: preflop → flop (3) → turn → river, with a burn card before each (shown in the animation).
- Actions: fold, check, call, bet, raise, all-in.
- **Minimum bet** = big blind; **minimum raise** = size of the last full raise.
- **Incomplete all-in raise does not reopen betting** for players who already acted (they may only call or fold).
- **Side pots:** built from each player's total contribution, including folded players' dead money; each pot awarded only among eligible players.
- **Showdown:** best 5 of 7 cards; full kicker comparison; wheel straight (A-2-3-4-5); steel wheel; split pots; **odd chip** goes to the first winner left of the button.
- Showdown order: last aggressor on the river shows first, otherwise first player left of the button. Losing hands at showdown are revealed (friendly-game default).
- **Everyone folds:** winner takes the pot without showing, and can optionally tap "Show".
- **All-in runout:** when betting is closed with players all-in, all hands are turned face up and the remaining board is dealt slowly for drama.
- Uncalled bet returned to the bettor.
- Blind levels go up every N hands if the schedule is on.

## 4. Phone UX

- Portrait, one-thumb layout. Your seat is always at the bottom; others are arranged around an oval table from your perspective.
- **Hole cards are hidden until you press and hold** (like squeezing real cards), so neighbours on the train can't see. Optional "keep revealed" toggle.
- **Live hand hint** while peeking: "You have: Two Pair, Kings and Sevens".
- **Action bar** only appears on your turn: Fold / Check-or-Call (shows amount) / Bet-or-Raise.
- **Raise sheet:** slider + quick buttons (Min, ½ pot, ¾ pot, Pot, All-in), +/− nudges by one big blind. All-in asks for confirmation.
- **Pre-actions** while waiting: "Check/Fold", "Check", "Call any".
- Turn indicator: glowing seat ring + countdown ring if timer on, plus vibration when it's your turn.
- Always visible: pot, every stack, current bets, dealer button, blinds, who's away.
- Action log drawer (last ~30 actions) and last-hand recap.
- **Host undo:** host can undo the last action (if no new card was dealt since) — fixes train-bump misclicks.
- **Info icon always on top** → hand rankings sheet: all 10 hands strongest to weakest, each with an example of real cards and a one-line explanation, plus a short "how betting works" section.
- Sound (WebAudio-synthesised chips and cards, no files) and haptics, each toggleable.

## 5. Look and feel

- Night-train card room: deep bottle-green felt with fine texture, walnut-leather rail, brass details, ivory cards.
- **Dealer NPC** at the head of the table: a real dealer photo (free licence, Wikimedia Commons, credited) in a brass frame, who "speaks" in short lines ("Flop.", "Action on Rohan", "Riya wins 1,240 with a flush") and from whose position cards are dealt.
- Four-colour deck by default (spades black, hearts red, diamonds blue, clubs green) for quick reading on a small screen; classic two-colour available.
- Motion that follows real objects: cards fly from the dealer with spin and land with a slight settle, 3D flip on reveal, chips slide from player to pot, pot slides to winner(s) and splits for side pots, winning five cards lift and glow.
- Respect reduced-motion settings. Smooth at 60 fps on mid-range Android (transform/opacity animations only).

## 6. Delivery

- A Progressive Web App on an HTTPS link. Open once online, "Add to Home screen", then it works fully offline (service worker caches everything, fonts and images included).
- Works on Android Chrome and iPhone Safari.

## 7. Known limits (stated honestly)

- Every phone must be on the same hotspot. The hotspot phone itself can also play.
- iPhone hotspots only accept other devices when the hotspot screen is open; Android hotspots are the easier choice for the host network.
- Host phone holds the deck in memory — fine for friends, not a casino.
