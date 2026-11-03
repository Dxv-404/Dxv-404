// The scene lab (/#/drama-lab): preview any character x moment x position x outcome x theme x screen, with
// play, replay and step-through. Everything is in the address, so a review link opens the same scene:
//   /#/drama-lab?char=ink-brawler&m=allin&pos=dominant&v=raise&out=won&theme=ink&screen=390x664&motion=full&n=6
import { IN_HAND, POSITIONS, RESULTS, SCENE_MS, type Moment, type MomentKind, type Outcome, type Position } from '@tp/table';
import { characterIds, loadCharacter, loadSet } from './registry';
import { SCENE_CSS, playScene, type CastEntry, type MotionMode, type ScenePlaying } from './player';
import { THEME_LOOK, framingFor, initialsOf, sceneBox } from './director';

const NAMES = ['Dev', 'Riya', 'Arjun', 'Meera', 'Kabir', 'Zoya', 'Ishan', 'Tara', 'Neel'];
export const SCREENS = ['390x664', '375x553', '844x390', '820x1180', '1440x900', '360x740', '412x915'];
const THEMES = Object.keys(THEME_LOOK);
const BG: Record<string, string> = { classic: '#1b120d', noir: '#0b0b0c', ivory: '#f3eee4', velvet: '#1a080d', cyber: '#120a18', ink: '#f5f2ea', pixel: '#1a1220', train: '#12263a', edo: '#efe3c8' };

export interface LabState { char: string; m: MomentKind; pos: Position; v: 'call' | 'raise'; out: Outcome; theme: string; screen: string; motion: MotionMode; n: number; lite: boolean; crown: boolean; pile: 0 | 1 | 2; others: 'initials' | 'same' }
const DEFAULT: LabState = { char: 'ink-brawler', m: 'allin', pos: 'contender', v: 'call', out: 'won', theme: 'ink', screen: '390x664', motion: 'full', n: 6, lite: false, crown: false, pile: 1, others: 'initials' };

function readState(): LabState {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const s = { ...DEFAULT };
  for (const [k, v] of q) {
    if (k === 'n' || k === 'pile') (s as Record<string, unknown>)[k] = Number(v);
    else if (k === 'lite' || k === 'crown') (s as Record<string, unknown>)[k] = v === '1';
    else if (k in s) (s as Record<string, unknown>)[k] = v;
  }
  return s;
}
function writeState(s: LabState): void {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  history.replaceState(null, '', `#/drama-lab?${q.toString()}`);
}

/** The moment a lab state stands for (the character is the star unless it lost a result). */
export function labMoment(s: LabState, ids: string[]): { m: Moment; starIdx: number } {
  const inHand = (IN_HAND as readonly string[]).includes(s.m);
  const charLoses = !inHand && s.m !== 'rebuy' && (s.out === 'out' || s.out === 'lost');
  const starIdx = charLoses ? 1 : 0;
  const other = charLoses ? 0 : 1;
  const variant = s.m === 'allinAnswered' || s.m === 'bigBetAnswered' ? s.v : undefined;
  const m: Moment = {
    kind: s.m, handNo: 7, pid: ids[starIdx]!, role: inHand ? (s.m === 'allin' || s.m === 'bigBet' ? 'opener' : 'answerer') : 'opener', position: s.pos,
    ...(variant ? { variant } : {}), target: { pid: ids[other]!, position: 'contender' }, followUp: false, ms: SCENE_MS[s.m],
  };
  if (!inHand && s.m !== 'rebuy') {
    const lose: Outcome = s.out === 'won' ? 'out' : s.out === 'split' ? 'split' : s.out;
    m.cast = [
      { pid: ids[starIdx]!, position: s.pos, outcome: s.out === 'split' ? 'split' : 'won', amount: 4000, pile: s.pile },
      { pid: ids[other]!, position: 'desperate', outcome: lose, amount: s.out === 'split' ? 4000 : 0, pile: null },
      ...ids.slice(2, 3).map((pid) => ({ pid, position: 'contender' as Position, outcome: 'lost' as Outcome, amount: 0, pile: null })),
    ];
    if (s.m === 'split') m.cast[1]!.outcome = 'split';
    m.crown = s.crown;
    m.act1 = [{ pid: ids[starIdx]!, kind: 'allin' }];
  }
  return { m, starIdx };
}

export async function mountLab(root: HTMLElement): Promise<void> {
  const st = readState();
  root.className = 'dr-lab';
  root.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = `${SCENE_CSS}
  .dr-lab{position:fixed;inset:0;z-index:9999;background:#2a2a2e;color:#eee;font:13px/1.3 system-ui,sans-serif;display:flex;flex-direction:column;overflow:auto}
  .dr-lab .bar{display:flex;flex-wrap:wrap;gap:6px 10px;padding:8px 10px;background:#1c1c1f;align-items:center;position:sticky;top:0;z-index:5}
  .dr-lab label{display:flex;gap:4px;align-items:center}.dr-lab select,.dr-lab button{font:inherit;padding:3px 6px}
  .dr-lab .stagewrap{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:14px}
  .dr-lab .device{position:relative;overflow:hidden;flex:none;transform-origin:0 0;box-shadow:0 0 0 2px #000,0 10px 40px rgba(0,0,0,.5)}
  .dr-lab .felt{position:absolute;left:8%;right:8%;top:16%;bottom:30%;border-radius:45%;border:10px solid var(--rim)}
  .dr-lab .hero{position:absolute;left:0;right:0;bottom:0;height:var(--hh);background:rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;gap:8px;color:#fff;font-weight:700}
  .dr-lab .hero i{width:34px;height:48px;background:#fff;border:2px solid #111;border-radius:4px}
  .dr-lab .info{padding:4px 10px;color:#aaa}`;
  root.append(css);
  const bar = document.createElement('div'); bar.className = 'bar';
  const info = document.createElement('div'); info.className = 'info';
  const wrap = document.createElement('div'); wrap.className = 'stagewrap';
  root.append(bar, info, wrap);
  const chars = ['initials', ...characterIds()];
  const sel = (key: keyof LabState, opts: (string | number)[], label: string) => {
    const l = document.createElement('label'); l.textContent = label;
    const s = document.createElement('select'); s.dataset.k = key;
    for (const o of opts) { const op = document.createElement('option'); op.value = String(o); op.textContent = String(o); s.append(op); }
    s.value = String(st[key]);
    s.onchange = () => { const v = s.value; (st as unknown as Record<string, unknown>)[key] = key === 'n' || key === 'pile' ? Number(v) : key === 'lite' || key === 'crown' ? v === 'true' : v; writeState(st); void draw(true); };
    l.append(s); bar.append(l);
  };
  sel('char', chars, 'Character'); sel('m', [...IN_HAND, ...RESULTS], 'Moment'); sel('pos', [...POSITIONS], 'Position'); sel('v', ['call', 'raise'], 'Variant');
  sel('out', ['won', 'out', 'lost', 'split'], 'Outcome'); sel('theme', THEMES, 'Theme'); sel('screen', SCREENS, 'Screen'); sel('motion', ['full', 'calm', 'still'], 'Motion');
  sel('n', [2, 6, 9], 'Players'); sel('pile', [0, 1, 2], 'Pile'); sel('crown', ['false', 'true'], 'Crown'); sel('lite', ['false', 'true'], 'Slow phone'); sel('others', ['initials', 'same'], 'Others');
  const btn = (t: string, f: () => void, id: string) => { const b = document.createElement('button'); b.textContent = t; b.dataset.lab = id; b.onclick = f; bar.append(b); };
  let playing: ScenePlaying | null = null;
  let shot = -1;
  btn('Play', () => void draw(true), 'play');
  btn('Replay', () => void draw(true), 'replay');
  btn('◀ Shot', () => { void step(-1); }, 'prev');
  btn('Shot ▶', () => { void step(1); }, 'next');

  async function step(d: number): Promise<void> {
    if (!playing || !document.body.contains(playing.el)) await draw(false, true);
    if (!playing) return;
    shot = Math.max(0, Math.min(playing.shots - 1, shot + d));
    playing.seek(shot);
    info.textContent = `shot ${shot + 1} of ${playing.shots}`;
  }

  async function draw(auto: boolean, paused = false): Promise<void> {
    playing?.stop(); playing = null; shot = -1;
    const [W, H] = st.screen.split('x').map(Number) as [number, number];
    const look = THEME_LOOK[st.theme] ?? THEME_LOOK.classic!;
    wrap.innerHTML = '';
    const dev = document.createElement('div'); dev.className = 'device';
    Object.assign(dev.style, { width: `${W}px`, height: `${H}px`, background: BG[st.theme] ?? '#222' });
    const framing = framingFor(W, H);
    const hh = framing === 'land' ? 70 : framing === 'tablet' || framing === 'laptop' ? 120 : Math.round(H * 0.24);
    dev.style.setProperty('--rim', look.rim); dev.style.setProperty('--hh', `${hh}px`);
    dev.innerHTML = `<div class="felt" style="background:${look.felt}"></div><div class="hero"><i></i><i></i> Fold · Call · Raise</div>`;
    wrap.append(dev);
    const fit = Math.min(1, (window.innerWidth - 40) / W, (window.innerHeight - 140) / H);
    dev.style.transform = `scale(${fit})`; dev.style.marginBottom = `${-(1 - fit) * H}px`; dev.style.marginRight = `${-(1 - fit) * W}px`;
    const ids = NAMES.slice(0, st.n).map((_, i) => `p${i}`);
    const { m, starIdx } = labMoment(st, ids);
    const [set, me, sil] = await Promise.all([loadSet(st.theme), loadCharacter(st.char), loadCharacter(null)]);
    const charIdx = starIdx === 0 ? 0 : 1;
    const cast: CastEntry[] = ids.map((pid, i) => ({ pid, name: NAMES[i]!, initials: initialsOf(NAMES[i]!), char: i === charIdx || st.others === 'same' ? me : sil }));
    const box = sceneBox(framing, W, H, { keepClear: H - hh, arena: { top: H * 0.16, height: H * 0.54 } });
    playing = playScene({ host: dev, box, framing, moment: m, cast, table: { theme: st.theme, set, ...look }, motion: st.motion, lite: st.lite, paused });
    const p = playing;
    p.el.addEventListener('pointerdown', () => p.stop());
    info.textContent = `${me.name} · ${m.kind}${m.variant ? `.${m.variant}` : ''} · ${m.position} · ${framing} ${W}×${H} · ${p.ms} ms · ${p.shots} shots${set.id !== st.theme ? ' · neutral stage' : ''}`;
    (window as unknown as { __drLab?: unknown }).__drLab = { playing: p, state: st, moment: m };
    void auto;
  }
  await draw(true);
}
