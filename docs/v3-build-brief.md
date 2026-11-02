# v3 build brief (shared by every v3 work stream)

The owner approved the v3 design and wants it built **exactly as designed**, on every screen size and device, in all nine
themes, with careful engineering and rigorous tests. Your stream is one part of it; other streams run in parallel.

## Where the design is
- Generator source (exact markup, copy and CSS to port): `tools/design/gen/v3kit.py` (shared kit: tokens, panels, buttons,
  fields, code boxes, sheets, question box, toasts, emblems, QR, icons, animations) and the board modules
  `v3crews.py`, `v3crew.py`, `v3sizes.py`, `v3devices.py`, `v3raise.py`, `v3rebuys.py`, `v3results.py`, `v3motion.py`, `v3sys.py`.
- Rendered boards (open them in Playwright to compare): `/tmp/claude-0/-home-claude/3da41667-e307-5a5e-bb8c-464fc3aa5893/scratchpad/tp3/project/<theme>-<board>.dc.html`
  (themes: classic noir ivory velvet cyber ink pixel train edo; `Main.dc.html` = the map and the rules).
  To regenerate: `cd tools/design/gen && TP3_OUT=<dir> python3 v3run.py <theme>` (needs the assets copied, see scratchpad tp3/project).
- Motion: `v3motion.py` lists every new animation with duration; scale by the theme's `FEEL` (motion.py) speed and use its easing.

## The app
- Monorepo `/home/claude/dxv-404`, branch `v2`. Web app `apps/web` (Vite, TS + some legacy JS), table logic `packages/table`
  (Room used by the Cloudflare DO, the Oracle node server and the offline host app), engine `packages/engine`, protocol
  `packages/protocol`, accounts `packages/account` (Supabase), DB `supabase/` (migrations + pgTAP tests, `pnpm test:db`).
- Themed UI kit already in the app: `apps/web/src/css/ui.css` (screens, `.btn primary/secondary/ghost/danger`, fields,
  `.slots` code boxes, `.seg`, switches, sheets, `ask()` question box in `legacy/ui.js` — never use native confirm/prompt).
  Shell, menu, bottom bar, picker: `apps/web/src/ui/shell.ts`. Table: `apps/web/src/table/{screen,render,motion,tiers,presence}.ts`,
  `css/table-live.css`. Theme tokens come from `public/tp/t-<theme>.css` (`--bg --tx --mut --acc --acctx --line --chipbg --panel
  --panelsh --r-btn --r-panel --dsp --ui --num --b-call/--b-raise/--b-fold(+tx,+sh)`). Use tokens, never hard-coded colours.
- Screens must work at 320×568, 360×740, 375×667, 390×844, 412×915, 430×932, 667×375, 844×390, 768×1024, 820×1180,
  1180×820, 1280×720, 1440×900, 1920×1080. No text overlapping, nothing cut off, touch targets ≥ 44 px, text contrast ≥ 4.5:1.
- Respect motion settings: `settings.motion` full / calm / off and prefers-reduced-motion (see table/screen.ts and motion.ts).

## Rules for working
- Work in your own git worktree on a new branch made from `v2` (`git checkout -b <name> v2`). Commit there. Do not push,
  do not deploy, do not touch production data, do not apply migrations to the live Supabase project.
- The machine has 2 CPUs shared with other streams: run only your own tests, Playwright with `--workers=1` and a unique
  `PW_PORT` (e.g. 46xx), build with `pnpm --filter @tp/web build`. Never run the whole suite. Kill processes only by PID
  (never `pkill -f`).
- Keep `pnpm typecheck` and `pnpm lint` clean for what you touch. Write tests: unit tests (vitest) for logic, Playwright
  specs under `e2e/tests/` for UI (all nine themes where it matters, several sizes, edge cases, keyboard where relevant).
- Screenshot your screens next to the design boards and fix differences before reporting.
- Report: what you built, files, how you tested (numbers), any place you departed from the design and why, open issues.
