// A made-up player's Profile page, shaped exactly like public.profile_page's answer. Used by the tests,
// by the screenshots (#/profile/demo), and as the sample a guest sees behind the sign-in prompt. Nothing
// here is anyone's real game: the numbers come from a fixed seed, so every run draws the same page.
import type { HandTile, OwnedAchievement, ProfileDay, ProfileNight, ProfilePage } from '@tp/account';

const DAY = 86_400_000;
/** A small repeatable random source (the same numbers every time). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const iso = (ms: number): string => new Date(ms).toISOString();
const gid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NAMES = ['Kabir', 'Tara', 'Ishaan', 'Zoya', 'Rohan'];

function night(i: number, endedAt: number, r: () => number): ProfileNight {
  const start = 5000, n = 22 + Math.floor(r() * 26), players = 4 + (i % 3);
  const walk = (bias: number, bust: boolean): { hands: number[]; stacks: number[]; rebuys: { before: number; chips: number }[] } => {
    const hands: number[] = [], stacks: number[] = [], rebuys: { before: number; chips: number }[] = [];
    let s = start;
    for (let h = 1; h <= n; h++) {
      if (s === 0) { rebuys.push({ before: h, chips: start }); s = start; }
      const swing = r() < 0.12 ? (r() - 0.45 + bias) * 5200 : (r() - 0.5 + bias) * 900;
      s = Math.max(0, Math.round((s + swing) / 50) * 50);
      if (bust && h === Math.floor(n * 0.4)) s = 0;
      hands.push(h); stacks.push(s);
    }
    return { hands, stacks, rebuys };
  };
  const mine = walk([0.06, -0.03, 0.1, -0.08, 0.04, 0.12, -0.02, 0.05][i % 8]!, i === 1 || i === 3);
  let best = { hand: 1, chips: 0 }, worst = { hand: 1, chips: 0 };
  mine.hands.forEach((h, k) => {
    const before = k === 0 ? start : mine.rebuys.some((x) => x.before === h) ? start : mine.stacks[k - 1]!;
    const d = mine.stacks[k]! - before;
    if (d > best.chips) best = { hand: h, chips: d };
    if (d < worst.chips) worst = { hand: h, chips: d };
  });
  const buyins = start + mine.rebuys.reduce((s, x) => s + x.chips, 0);
  const net = mine.stacks[mine.stacks.length - 1]! - buyins;
  const place = net > 3000 ? 1 : net > 0 ? 2 : net > -3000 ? Math.min(players, 3) : players;
  const rb = mine.rebuys.length;
  const score = Math.round((players - place + Math.max(-5, Math.min(5, (net / start) * 5)) - rb) * 10) / 10;
  return {
    game: gid(100 + i), crew: gid(1), table: ['KQ7P', 'A4BQ', 'LGZ7', 'E5UR', 'GECH', 'B3CR', 'C2Q5', 'JCZE'][i % 8]!, at: iso(endedAt), started_at: iso(endedAt - (70 + n * 2) * 60_000),
    start_stack: start, big_blind: 100, players, place, score, league: true, net, bb: Math.round(net) / 100, buyins,
    ...mine, best: best.chips > 0 ? best : null, worst: worst.chips < 0 ? worst : null,
    achievements: i === 0 ? [{ id: 'check_raise', tier: 0, hand: best.hand }] : i === 2 ? [{ id: 'set_mining', tier: 0, hand: Math.min(n, 9) }] : [],
    lines: NAMES.slice(0, players - 1).map((name) => { const w = walk((r() - 0.5) * 0.1, false); return { name, hands: w.hands, stacks: w.stacks }; }),
  };
}

/** The sample page as of `now` (default: a fixed evening, so pictures and tests never change). */
export function demoProfile(now = Date.UTC(2026, 10, 11, 14, 30)): ProfilePage {
  const r = rng(404);
  // 26 nights over the last eleven months, mostly Saturdays, the last eight with their chip graphs
  const ends: number[] = [];
  for (let w = 0; w < 46; w++) {
    if (w > 5 && r() < 0.5) continue;
    const sat = now - ((new Date(now).getUTCDay() + 1) % 7) * DAY - w * 7 * DAY;
    ends.push(Math.floor(sat / DAY) * DAY + (16 + Math.floor(r() * 3)) * 3_600_000 + (r() < 0.25 ? -2 * DAY : 0));
  }
  ends.sort((a, b) => b - a);
  const nights = ends.slice(0, 8).map((t, i) => night(i, t, r));
  const dayKey = (ms: number): string => new Date(ms + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const heatmap: ProfileDay[] = ends.map((t, i) => {
    const n = nights[i];
    const players = n?.players ?? 4 + (i % 3);
    const score = n ? Number(n.score) : Math.round((r() * 13 - 5.5) * 10) / 10;
    const place = n?.place ?? (score > 5 ? 1 : score > 1.5 ? 2 : score > -1 ? 3 : players);
    const bb = n ? Number(n.bb) : Math.round(score * 14);
    return { day: dayKey(t), games: 1, score, bb, won: place === 1, achievements: i % 5 === 0 ? 1 : 0, list: [{ game: n?.game ?? gid(200 + i), at: iso(t), place, players, score, bb, league: true }] };
  }).reverse();
  const tile = (i: number, hand: number, chips: number, cards: string[], board: string[], best: number): HandTile =>
    ({ game: nights[i]!.game, hand, at: nights[i]!.at, chips, bb: chips / 100, pot: Math.abs(chips) * 2, best_hand: best, showdown: true, cards, board });
  const got = (id: string, daysAgo: number, more: Partial<OwnedAchievement> = {}): OwnedAchievement =>
    ({ id, tier: 0, at: iso(now - daysAgo * DAY), game: gid(100), hand: 12, reveal: 'now', shown: true, new: daysAgo < 5, detail: {}, ...more });
  const wins = heatmap.filter((d) => d.won).length;
  const avg = Math.round((nights.reduce((s, n) => s + Number(n.score), 0) / nights.length) * 100) / 100;
  return {
    v: 1, own: true,
    account: { id: gid(7), name: 'Meera', avatar: null, since: iso(now - 330 * DAY) },
    crews: [{ id: gid(1), name: 'Friday Night Table', badge: 'shield', color: '#c0392b' }, { id: gid(2), name: 'Hostel 4B', badge: 'hex', color: '#2f6fd6' }],
    crew: { id: gid(1), name: 'Friday Night Table', badge: 'shield', color: '#c0392b', members: 7, serial: 4 },
    season: { id: gid(50), number: 2, title: null, name: 'Oct–Dec 2026', ends_at: iso(now + 50 * DAY), scoring: 'points', min_games: 4, rank: 2, ranked: true, avg, points: Math.round(avg * 8 * 10) / 10, bb: 212, games: 8, wins: nights.filter((n) => n.place === 1).length, top3: nights.filter((n) => n.place <= 3).length, trend: 'up', of: 6, streak: nights[0]!.place === 1 ? 1 : 0 },
    career: { hands: 862, nights: heatmap.length, wins, top3: 15, showdowns: 141, showdowns_won: 78, bb: 436.5, hours: 61.5, bluffs: 7, achievements: 14 },
    milestones: { values: { hands: 862, nights: heatmap.length, wins, showdowns: 78, bluffs: 7, bb: 436, weeks: 6, achievements: 14 }, seen: { hands: 815, nights: heatmap.length - 1, wins: wins - 1, showdowns: 71, bluffs: 6, bb: 380, weeks: 6, achievements: 12 } },
    nights, heatmap,
    moments: {
      biggest_won: tile(0, nights[0]!.best?.hand ?? 3, 9450, ['Ah', 'Kh'], ['Qh', '7h', '2c', '9s', '3h'], 5),
      biggest_lost: tile(1, nights[1]!.worst?.hand ?? 5, -6200, ['Ks', 'Kd'], ['Ac', '8d', '8s', '4h', 'Jc'], 2),
      hand_of_season: tile(2, 9, 7300, ['9c', '9d'], ['9h', 'Kc', '4s', '4d', '2h'], 6),
      winning_hands: [{ hand: 2, n: 24 }, { hand: 1, n: 21 }, { hand: 3, n: 11 }, { hand: 4, n: 9 }, { hand: 5, n: 8 }, { hand: 6, n: 4 }, { hand: 7, n: 1 }],
      comebacks: [{ game: nights[3]!.game, at: nights[3]!.at, low: 450, start_stack: 5000 }],
    },
    streaks: { wins: { current: nights[0]!.place === 1 ? 1 : 0, longest: 3, longest_at: iso(now - 80 * DAY) }, top3: { current: 2, longest: 6, longest_at: iso(now - 40 * DAY) }, weeks: { current: 6, longest: 6 } },
    history: {
      rank_after: [null, null, null, 4, 3, 3, 1, 2].map((rank, i) => ({ game: nights[7 - i]!.game, at: nights[7 - i]!.at, rank, played: true })),
      seasons: [
        { id: gid(50), number: 2, title: null, name: 'Oct–Dec 2026', closed: false, current: true, rank: 2, avg, points: 30, bb: 212, games: 8, wins: 2, best_hand: 7 },
        { id: gid(49), number: 1, title: 'Monsoon league', name: 'Jul–Sep 2026', closed: true, current: false, rank: 3, avg: 1.84, points: 22.1, bb: 96, games: 12, wins: 3, best_hand: 6 },
      ],
    },
    achievements: [
      got('check_raise', 3, { game: nights[0]!.game }), got('great_fold', 3, { reveal: 'night' }), got('regular', 24, { tier: 2 }), got('regular', 210, { tier: 1 }),
      got('stone_cold_bluff', 60, { tier: 1 }), got('set_mining', 17), got('quads', 44), got('double_up', 300), got('hero_call', 120), got('podium', 41, { game: null, hand: null, detail: { season: 'Monsoon league' } }),
      got('nemesis', 52, { game: null, hand: null, detail: { name: 'Kabir' } }), got('iron_focus', 290, { hand: null }), got('night_owl', 150), got('survivor', 95), got('the_trap', 30, { shown: false }), got('gone_fishing', 200),
    ],
    crew_has: { check_raise: 5, great_fold: 3, regular: 6, stone_cold_bluff: 2, set_mining: 6, quads: 2, double_up: 7, hero_call: 4, podium: 3, nemesis: 4, iron_focus: 7, night_owl: 3, survivor: 5, the_trap: 2, gone_fishing: 1, runner_runner: 6, board_plays: 4, phoenix: 1, flawless: 2 },
    card: null,
  };
}
