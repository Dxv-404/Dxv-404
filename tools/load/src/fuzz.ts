// Phase 8 stress: hostile phones. Garbage, huge frames, floods, wrong versions, other seats' moves,
// fake tickets, half-open sockets and hello storms, against a table where honest bots keep playing.
// The table must keep dealing, the honest bots must see no errors, and the server must stay up.
//   node dist/fuzz.mjs --url ws://127.0.0.1:8080 --seconds 120
import { TableClient, newSeatToken, type SocketLike } from '@tp/table';
import { decide, rng, STRATEGIES } from '@tp/bots';
import type { View } from '@tp/engine';

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1]! : d; };
const URL_ = arg('url', 'ws://127.0.0.1:8080');
const SECONDS = Number(arg('seconds', '120'));
const CODE = arg('code', 'FZ' + Math.floor(Math.random() * 90 + 10));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let honestErrors = 0, hands = 0, attacks = 0, closedByServer = 0;
const r = rng(7);

function honest(i: number): { c: TableClient; pid: string; view?: View } {
  const pid = `fz${CODE}${i}`;
  const me: { c: TableClient; pid: string; view?: View } = { c: null as unknown as TableClient, pid };
  let busy = '';
  me.c = new TableClient({
    url: `${URL_}/table/${CODE}`, table: CODE, player: pid, token: newSeatToken(), name: `Honest${i}`,
    ...(i === 0 ? { settings: { turnTime: 20, startStack: 1000, casual: true } } : {}),
    open: (u) => new WebSocket(u) as unknown as SocketLike,
    onError: (code, m) => { honestErrors++; console.log(`honest ${i} error ${code}: ${m}`); },
    onView: (v) => {
      me.view = v;
      if (i === 0) hands = Math.max(hands, v.handNo);
      if (v.phase !== 'hand' && v.players.find((p) => p.id === pid)?.stack === 0 && busy !== `rb${v.handNo}`) { busy = `rb${v.handNo}`; me.c.send({ t: 'rebuy' }); }
      const h = v.hand;
      if (h?.vote?.pids.includes(pid) && !h.vote.voted.includes(pid) && busy !== `v${v.handNo}`) { busy = `v${v.handNo}`; me.c.send({ t: 'vote', handNo: v.handNo, yes: true }); }
      if (!h || h.toAct !== pid || !v.legal) return;
      const key = `${v.handNo}:${h.street}:${h.currentBet}:${h.ps[pid]!.total}`;
      if (busy === key) return; busy = key;
      const a = decide(v, STRATEGIES[i % STRATEGIES.length]!, r);
      if (a) setTimeout(() => me.c.act(a), 100 + Math.floor(r() * 300));
    },
  });
  return me;
}

const garbage = (): string | Uint8Array => {
  const k = Math.floor(r() * 12);
  const victim = `fz${CODE}${Math.floor(r() * 4)}`;
  switch (k) {
    case 0: return '{"t":"hello"';                                                    // broken JSON
    case 1: return 'x'.repeat(300_000);                                               // a huge frame
    case 2: return JSON.stringify({ t: 'act', actionId: 'a', handNo: 1, action: { type: 'raise', to: -5 } });
    case 3: return JSON.stringify({ t: 'hello', v: 999, table: CODE, player: 'evil', lastSeq: 0 });
    case 4: return JSON.stringify({ t: 'hello', v: 1, table: CODE, player: victim, token: 'a'.repeat(32), lastSeq: 0, name: 'Impostor' }); // someone's seat
    case 5: return JSON.stringify({ t: 'hello', v: 1, table: CODE, player: '00000000-0000-4000-8000-000000000001', ticket: 'f'.repeat(40), lastSeq: 0 }); // fake ticket
    case 6: return JSON.stringify({ t: 'host', actionId: 'h', cmd: 'end' });          // host command before hello
    case 7: return JSON.stringify({ t: 'react', reaction: 'nope' });
    case 8: return new Uint8Array(Array.from({ length: 2000 }, () => Math.floor(r() * 256))); // binary
    case 9: return JSON.stringify({ t: 'hello', v: 1, table: CODE, player: 'w' + Math.floor(r() * 1e6), lastSeq: 0, spectate: true, name: '<img src=x onerror=alert(1)>' });
    case 10: return JSON.stringify({ t: 'seed', handNo: 1, seed: 'zz' });
    default: return JSON.stringify({ t: 'ping', c: 'x' });
  }
};

async function attacker(): Promise<void> {
  const ws = new WebSocket(`${URL_}/table/${CODE}`);
  ws.binaryType = 'arraybuffer';
  ws.onclose = () => { closedByServer++; };
  await new Promise((res) => { ws.onopen = res; ws.onerror = res; setTimeout(res, 3000); });
  if (ws.readyState !== 1) return;
  const mode = Math.floor(r() * 4);
  if (mode === 0) { for (let i = 0; i < 400 && ws.readyState === 1; i++) ws.send(JSON.stringify({ t: 'ping', c: i })); }      // flood
  else if (mode === 1) { for (let i = 0; i < 20 && ws.readyState === 1; i++) { ws.send(garbage() as string); attacks++; await sleep(20); } }
  else if (mode === 2) { await sleep(20_000); }                                                                                 // says nothing (half-open)
  else { ws.send(JSON.stringify({ t: 'hello', v: 1, table: CODE, player: 'w' + Math.floor(r() * 1e6), lastSeq: 0, spectate: true })); for (let i = 0; i < 50 && ws.readyState === 1; i++) ws.send(JSON.stringify({ t: 'react', reaction: '👍' })); }
  try { ws.close(); } catch { /* gone */ }
}

async function main(): Promise<void> {
  console.log(`fuzz: table ${CODE} on ${URL_} for ${SECONDS}s`);
  const players = [honest(0)];
  await sleep(1000);
  for (let i = 1; i < 4; i++) players.push(honest(i));
  await sleep(2000);
  players[0]!.c.send({ t: 'host', cmd: 'deal' });
  const end = Date.now() + SECONDS * 1000;
  const running: Promise<void>[] = [];
  while (Date.now() < end) {
    for (let k = 0; k < 4; k++) running.push(attacker());
    await sleep(500);
    if (running.length > 200) await Promise.all(running.splice(0, 100));
  }
  await Promise.allSettled(running);
  const before = hands;
  await sleep(15_000); // the table still deals after the attack
  const ok = honestErrors === 0 && hands > before && players.every((p) => p.view?.players.length === 4);
  console.log(JSON.stringify({ code: CODE, hands, handsAfterAttack: hands - before, honestErrors, attacks, socketsClosedByServer: closedByServer, seatsIntact: players.every((p) => p.view?.players.length === 4), names: players[0]!.view?.players.map((p) => p.name) }));
  for (const p of players) p.c.close();
  console.log(ok ? 'FUZZ PASSED' : 'FUZZ FAILED');
  setTimeout(() => process.exit(ok ? 0 : 1), 300);
}
void main();
