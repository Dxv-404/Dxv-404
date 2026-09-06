<!--
  ─────────────────────────────────────────────────────────────────────
  github.com/Dxv-404  ·  profile README
  ─────────────────────────────────────────────────────────────────────
  Every image is a generated, standalone SVG. Don't hand-edit them.
  Panels (02-05, 14-15): change copy in the DATA block at the bottom of
  tools/build.py, then:

      cd tools && python3 build.py ../assets

  Project cards (06-13): a painting per repo in tools/cards/src, framed by
  tools/cards/card.py. Change a card's spec in that file's CARDS dict, then:

      python tools/cards/card.py <id>

  Cards fade in on load, staggered down the grid (reveal= in each spec).

  The ending (16_ending_*.svg) is the header's hill again, at dusk: the figure
  pinning the live apps to a board. Six slices of one scene, side by side, the
  four note slices linked. Built by tools/ending/ending.py from the header's
  layers and the painted kit in tools/ending/kit:

      python tools/ending/ending.py

  It does not follow the clock; only the hero does.

  The hero is ONE file, assets/01_hero.svg. Do NOT edit it by hand:
  .github/workflows/hero.yml regenerates it every three hours for the real
  time of day in IST and the week's commit count, and a manual edit is
  overwritten on the next run. Its layers and assembler live in tools/header/.

  Built to survive GitHub's image pipeline:
    · no webfonts   — display type is drawn as vector pixel runs
    · no JavaScript — motion is CSS animation inside each SVG
    · no <use> across files — each file is fully self-contained
    · prefers-reduced-motion respected; every asset has a still state
    · every panel carries <title>/<desc>, mirrored in the alt text below
  ─────────────────────────────────────────────────────────────────────
-->

<img src="assets/01_hero.svg" width="880" alt="S. Devkrishna — currently working on reinforcement learning, multi-agent systems and emergent behaviour. Animated pixel-art header: a figure sits on open ground below a cherry blossom tree, looking out over a distant city on the horizon. The canopy moves in the wind, petals drift across the frame, the scene relights itself for the time of day, and the number of lit windows in the city tracks recent commit activity.">

<img src="assets/02_rule_who.svg" width="880" alt="Section: who">

<img src="assets/03_identity.svg" width="880" alt="S. Devkrishna, he/him, @Dxv-404. BSc (Hons) Data Science at CHRIST University, Pune Lavasa, 2027. AI intern at TCS; Django developer at BEO Software; data science at NFI SmartFarm. Co-author of Jadoo: a wearable assistive system, CRC Press book chapter, 2024.">

<img src="assets/04_methods.svg" width="880" alt="Methods and where they are demonstrated. Emergent behaviour in G-ONE: evolved recurrent agents rewarded only to forage. Multi-agent RL in crossroads-rl: PPO agents with a six-action space and a one-bit signal. Evolutionary optimisation in stride: 17 configurations, 30 seeds, GA against DE and PSO. Citation retrieval in Arivu: Postgres, OpenAlex and Semantic Scholar. Calibrated classification in APIN: ensemble leaf-disease diagnosis with Grad-CAM, live.">

<img src="assets/05_rule_work.svg" width="880" alt="Section: work">

<p align="center"><a href="https://github.com/Dxv-404/G-ONE"><img src="assets/06_g_one.svg" width="281" alt="G-ONE: evolved agents in a night meadow, rewarded only to eat. Do they learn to survive anyway? Small recurrent networks evolve in a grid world; whether they also learn to avoid the predator is the experiment."></a><a href="https://github.com/Dxv-404/crossroads-rl"><img src="assets/07_crossroads_rl.svg" width="281" alt="crossroads-rl: four reinforcement-learning agents negotiate an unsignaled crossroads at dusk with a one-bit signal. Do they invent right of way? Three motions and one bit each; three reward regimes, three driving cultures."></a><a href="https://github.com/Dxv-404/stride"><img src="assets/08_stride.svg" width="281" alt="stride: a line of stick-figure walkers crosses a salt flat at dusk, the first fallen, the last walking on toward the horizon. Can evolution teach a six-jointed figure to walk? 100 walkers, 75 generations, 18 genes each; genetic algorithm against PSO, DE and CMA-ES."></a></p>
<p align="center"><a href="https://github.com/Dxv-404/Arivu"><img src="assets/09_arivu.svg" width="281" alt="Arivu: a vast lantern tree at dusk, its glowing roots spread across the ground, one root cut and gone dark. It traces where a paper's ideas came from, then removes ancestors one at a time to find the ones the field cannot stand without. Postgres, OpenAlex, Semantic Scholar."></a><a href="https://dxv-404-apin.hf.space"><img src="assets/10_apin.svg" width="281" alt="APIN: a figure kneels in a vegetable field at dusk, lighting one cabbage leaf with a phone. Leaf-disease diagnosis for tomato, okra and brassica from one photo, with calibrated confidence, a Grad-CAM heat map of where the model looked, and what to do about it. Live on Hugging Face Spaces."></a><a href="https://github.com/Dxv-404/Afwah"><img src="assets/11_afwah.svg" width="281" alt="Afwah: a lone telephone pole on a dusk hill, four wires running to four distant clusters of lights, birds spreading out along the wires from the pole, the nearest burning ember orange, one pale blue bird on a wire gone dark. A discrete-event Monte Carlo simulation of misinformation across four social networks, a thousand runs."></a></p>
<p align="center"><a href="https://github.com/Dxv-404/adr-system"><img src="assets/12_oracle.svg" width="281" alt="Oracle: a tall standing stone in a dusk meadow, its face carved with rows of glowing entries like a ledger, a figure adding a new page while a circle of eight holds lanterns, five lit and raised, three dark. A collaborative, versioned research decision record for a group: nothing is written until enough of the group approves."></a><a href="https://github.com/Dxv-404/ink-education"><img src="assets/13_ink.svg" width="281" alt="INK: a small night market on a campus lawn at dusk, four lantern-lit stalls trading notes and tutoring for glowing coins, and a board of pinned questions each with a coin beside it. A retro, gamified academic toolkit: doubts become bounties, notes are traded, tutoring is booked."></a></p>

<img src="assets/14_rule_index.svg" width="880" alt="Section: index">

<img src="assets/15_index.svg" width="880" alt="Repository index. Agents and emergent behaviour: G-ONE, crossroads-rl, Afwah, stride. Research tooling: Arivu, adr-system. Applied and shipped: APIN (live), ink-education, Sanchari, Yaatra. Earlier: leetcoder, cam-to-ascii.">

<p align="center"><img src="assets/16_ending_a.svg" width="32.624%" alt=""><a href="https://dxv-404-apin.hf.space"><img src="assets/16_ending_apin.svg" width="10.638%" alt="APIN: leaf doctor one photo. Pinned to the board; opens https://dxv-404-apin.hf.space"></a><a href="https://oracleonline.app"><img src="assets/16_ending_oracle.svg" width="11.111%" alt="ORACLE: a group's decisions. Pinned to the board; opens https://oracleonline.app"></a><a href="https://www.stridewalk.fun"><img src="assets/16_ending_stride.svg" width="10.165%" alt="STRIDE: evolved walkers. Pinned to the board; opens https://www.stridewalk.fun"></a><a href="https://github.com/Dxv-404/ink-education"><img src="assets/16_ending_ink.svg" width="10.875%" alt="INK: studying as a game. Pinned to the board; opens https://github.com/Dxv-404/ink-education"></a><img src="assets/16_ending_b.svg" width="24.586%" alt=""></p>
