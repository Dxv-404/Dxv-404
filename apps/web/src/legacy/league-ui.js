// History, game results, hand replays, the crew league (three views), player cards and trophies.
// Everything here is read from the cloud; results are only ever written by table servers.
import { h, toast, fmt, cardEl } from './ui.js';

const HAND_NAMES = ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush', 'Royal flush'];
const TROPHY = {
  season_winner: ['🏆', 'Season winner'], iron_chair: ['🪑', 'Iron chair (most games)'], royal_flush: ['👑', 'Royal flush'],
  straight_flush: ['🌈', 'Straight flush'], four_of_a_kind: ['🃏', 'Four of a kind'], comeback: ['🔥', 'Comeback'],
};
const day = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const bb = (x) => (x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Number(x)).toLocaleString('en-IN', { maximumFractionDigits: 1 })} bb`);
const signed = (n) => (n == null ? '–' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`);
const ordinal = (n) => (n == null ? '' : n + (['th', 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10] || 'th'));

export function leagueScreens({ screen, openSheet, account, back }) {
  const head = (title, onBack) => h('header', { class: 'page-head' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: onBack }, '‹'), h('h1', {}, title));
  const busy = (el) => el.replaceChildren(h('p', { class: 'hint', role: 'status' }, 'Loading…'));
  const failed = (el, err, retry) => el.replaceChildren(h('p', { class: 'hint', role: 'alert' }, navigator.onLine === false ? 'This needs the internet.' : `Something went wrong: ${err?.message || err}`), h('button', { class: 'btn ghost', onclick: retry }, 'Try again'));

  // ---------------- my games ----------------
  function history() {
    screen((el) => {
      el.className = 'screen history';
      const body = h('div', {});
      el.append(head('My games', back), body);
      (async function load() {
        busy(body);
        try {
          const a = await account();
          const games = await a.myGames(100);
          body.replaceChildren(games.length
            ? h('ul', { class: 'game-list', 'data-testid': 'games' }, ...games.map((g) => h('li', {}, h('button', { class: 'game-row', onclick: () => game(g.game_id, history) },
              h('div', { class: 'who' }, h('strong', {}, g.crew_name || `Table ${g.table_code}`), h('small', {}, `${day(g.ended_at)} · ${g.players} players · ${g.hands} hands${g.casual ? ' · casual' : ''}${g.status === 'void' ? ' · void' : g.status === 'live' ? ' · not finished' : ''}`)),
              h('div', { class: 'nums' }, h('span', { class: 'net ' + (g.net > 0 ? 'up' : g.net < 0 ? 'down' : '') }, bb(g.bb_won)), h('small', {}, g.place ? `${ordinal(g.place)} place` : ''))))))
            : h('p', { class: 'hint' }, 'No games yet. Games at online tables show up here once you’re signed in.'));
        } catch (err) { failed(body, err, load); }
      })();
    });
  }

  // ---------------- one game ----------------
  function game(id, onBack) {
    screen((el) => {
      el.className = 'screen game';
      const body = h('div', {});
      el.append(head('Game', onBack), body);
      (async function load() {
        busy(body);
        try {
          const a = await account();
          const got = await a.game(id);
          if (!got) return body.replaceChildren(h('p', { class: 'hint' }, 'This game is not available.'));
          const { game: g, players } = got;
          const crews = g.crew_id ? await a.crews() : [];
          const admin = crews.some((c) => c.id === g.crew_id && c.status === 'active' && c.role !== 'member');
          const [hands, changes] = await Promise.all([a.hands(id), a.resultChanges(id)]);
          body.replaceChildren(
            h('p', { class: 'lede' }, `${day(g.started_at)} · table ${g.table_code} · blinds ${fmt(g.big_blind / 2)}/${fmt(g.big_blind)} · ${g.hands} hands`),
            g.status === 'void' && h('p', { class: 'void-note', role: 'status' }, `Void: ${g.void_reason}. It doesn’t count in the league.`),
            g.status === 'live' && h('p', { class: 'hint', role: 'status' }, 'This game hasn’t finished yet.'),
            g.casual && h('p', { class: 'hint' }, 'Casual game: in your history, not in the league.'),
            h('ol', { class: 'stand-list', 'data-testid': 'results' }, ...players.map((p) => h('li', {},
              h('div', { class: 'who' }, h('strong', {}, p.name), h('small', {}, `${p.hands} hands · bought ${fmt(p.buyins)}${p.points != null ? ` · ${p.points} pts` : ''}`)),
              h('div', { class: 'nums' }, h('span', { class: 'net ' + (p.net > 0 ? 'up' : p.net < 0 ? 'down' : '') }, signed(p.net)), h('small', {}, bb(p.bb_won)))))),
            hands.length > 0 && h('section', { class: 'block' }, h('h3', {}, 'Hands'),
              h('div', { class: 'hand-grid', 'data-testid': 'hands' }, ...hands.map((x) => h('button', { class: 'chip-btn', 'aria-label': `Replay hand ${x.hand_no}, pot ${x.pot}`, onclick: () => replay(id, x.hand_no, () => game(id, onBack)) }, `#${x.hand_no}`)))),
            changes.length > 0 && h('section', { class: 'block', 'data-testid': 'changes' }, h('h3', {}, 'Changes by admins'),
              h('ul', { class: 'log-list' }, ...changes.map((c) => h('li', {}, h('span', {}, c.what === 'void' ? `${c.actor_name || 'An admin'} voided the game: ${c.reason}` : `${c.actor_name || 'An admin'} moved ${fmt(c.detail.chips)} chips from ${nameOf(players, c.detail.from)} to ${nameOf(players, c.detail.to)}: ${c.reason}`), h('small', {}, day(c.at)))))),
            admin && g.status === 'ended' && h('section', { class: 'block' }, h('h3', {}, 'Admin'),
              h('button', { class: 'btn ghost', 'data-testid': 'adjust', onclick: () => adjustSheet(a, g, players, load) }, 'Correct a result', h('small', {}, 'Move chips from one player to another; everyone sees why')),
              h('button', { class: 'btn danger', 'data-testid': 'void', onclick: async () => {
                const reason = prompt('Why is this game void? Everyone in the crew will see this.');
                if (!reason || reason.trim().length < 3) return;
                try { await a.voidGame(id, reason.trim()); toast('Game voided'); load(); } catch (err) { toast(err.message); }
              } }, 'Void this game')));
        } catch (err) { failed(body, err, load); }
      })();
    });
  }
  const nameOf = (players, key) => players.find((p) => p.player_key === key)?.name || 'a player';

  function adjustSheet(a, g, players, reload) {
    const opts = () => players.map((p) => h('option', { value: p.player_key }, `${p.name} (${fmt(p.final_chips)})`));
    const from = h('select', { 'aria-label': 'From' }, ...opts());
    const to = h('select', { 'aria-label': 'To' }, ...opts());
    to.selectedIndex = Math.min(1, players.length - 1);
    const chips = h('input', { type: 'number', inputmode: 'numeric', min: 1, 'aria-label': 'Chips' });
    const reason = h('input', { type: 'text', maxlength: 300, placeholder: 'Why (everyone sees this)', 'aria-label': 'Reason' });
    const s = openSheet(h('div', { class: 'menu' }, h('h2', {}, 'Correct a result'),
      h('label', { class: 'field' }, h('span', {}, 'Take chips from'), from), h('label', { class: 'field' }, h('span', {}, 'Give them to'), to),
      h('label', { class: 'field' }, h('span', {}, 'Chips'), chips), h('label', { class: 'field' }, h('span', {}, 'Reason'), reason),
      h('button', { class: 'btn primary', onclick: async () => {
        try { await a.adjustResult(g.id, from.value, to.value, Math.floor(Number(chips.value)), reason.value.trim()); s.close(); toast('Result corrected'); reload(); }
        catch (err) { toast(err.message); }
      } }, 'Save the correction')), { label: 'Correct a result' });
  }

  // ---------------- replay ----------------
  async function replay(gameId, handNo, onBack) {
    const [{ Engine }, a] = await Promise.all([import('@tp/engine'), account()]);
    screen((el) => {
      el.className = 'screen replay';
      const body = h('div', {});
      el.append(head(`Hand #${handNo}`, onBack), body);
      (async () => {
        busy(body);
        let rec;
        try { rec = await a.hand(gameId, handNo); } catch (err) { return failed(body, err, () => replay(gameId, handNo, onBack)); }
        if (!rec) return body.replaceChildren(h('p', { class: 'hint' }, 'This hand is not available.'));
        const me = a.profile?.id ?? null;
        // play the hand forward one input at a time; each step is what this player could see then
        const e = Engine.fromSnapshot(rec.before);
        const frames = [];
        const names = new Map(rec.before.players.map((p) => [p.id, p.name]));
        for (const input of rec.inputs) {
          e.apply(input);
          if (input.t === 'tick' || input.t === 'presence' || input.t === 'commitSeed') continue;
          frames.push({ view: e.viewFor(me), say: describe(input, names) });
        }
        // at the end, show what was revealed at the showdown (and nothing else)
        let i = 0;
        const stage = h('div', { class: 'replay-stage', 'aria-live': 'polite' });
        const draw = () => {
          const { view: v, say } = frames[i];
          const hd = v.hand;
          stage.replaceChildren(
            h('p', { class: 'replay-say', 'data-testid': 'replay-say' }, say),
            h('div', { class: 'replay-board' }, ...(hd ? hd.board : []).map((c) => cardEl(c, { size: 'sm' })), hd?.board2 ? h('span', { class: 'hint' }, ' · ') : null, ...(hd?.board2 ?? []).map((c) => cardEl(c, { size: 'sm' }))),
            h('p', { class: 'hint' }, `Pot ${fmt(hd?.pot ?? 0)}`),
            h('ul', { class: 'member-list' }, ...v.players.filter((p) => hd?.ps[p.id]).map((p) => {
              const hp = hd.ps[p.id];
              return h('li', { class: hp.folded ? 'folded' : '' },
                h('div', { class: 'who' }, h('strong', {}, p.name + (p.id === me ? ' (you)' : '')), h('small', {}, `${fmt(p.stack)}${hp.streetBet ? ` · bet ${fmt(hp.streetBet)}` : ''}${hp.folded ? ' · folded' : hp.allIn ? ' · all in' : ''}`)),
                h('div', { class: 'mini-cards' }, ...(hp.cards ? hp.cards.map((c) => cardEl(c, { size: 'xs' })) : [cardEl(null, { size: 'xs' }), cardEl(null, { size: 'xs' })])));
            })),
            i === frames.length - 1 && hd?.results && h('div', { class: 'replay-result' }, ...hd.results.pots.map((pot) => h('p', {}, `${pot.label}: ${pot.awards.map((w) => `${names.get(w.pid)} wins ${fmt(w.amount)}`).join(', ')}${pot.hand ? ` with ${pot.hand.name.toLowerCase()}` : ''}`))));
          prev.disabled = i === 0; next.disabled = i === frames.length - 1;
          counter.textContent = `${i + 1} / ${frames.length}`;
        };
        const prev = h('button', { class: 'btn ghost small', 'aria-label': 'Previous step', onclick: () => { i = Math.max(0, i - 1); draw(); } }, '◀');
        const next = h('button', { class: 'btn ghost small', 'aria-label': 'Next step', 'data-testid': 'replay-next', onclick: () => { i = Math.min(frames.length - 1, i + 1); draw(); } }, '▶');
        const end = h('button', { class: 'btn ghost small', onclick: () => { i = frames.length - 1; draw(); } }, 'End');
        const counter = h('span', { class: 'hint' });
        body.replaceChildren(stage, h('div', { class: 'replay-controls' }, prev, counter, next, end),
          h('p', { class: 'hint small' }, `Deck fingerprint ${rec.deckCommit.slice(0, 12)}… checked against the seed revealed after the hand.`));
        draw();
      })();
    });
  }

  function describe(input, names) {
    const n = (pid) => names.get(pid) || 'Someone';
    switch (input.t) {
      case 'start': return 'The cards are dealt';
      case 'act': {
        const t = input.action.type;
        return t === 'fold' ? `${n(input.pid)} folds` : t === 'check' ? `${n(input.pid)} checks` : t === 'call' ? `${n(input.pid)} calls`
          : t === 'allin' ? `${n(input.pid)} goes all in` : `${n(input.pid)} ${t === 'bet' ? 'bets' : 'raises to'} ${fmt(input.action.to)}`;
      }
      case 'vote': return `${n(input.pid)} ${input.yes ? 'wants' : 'doesn’t want'} to deal it twice`;
      case 'show': return `${n(input.pid)} shows`;
      case 'host': return `The host: ${input.cmd}`;
      default: return '';
    }
  }

  // ---------------- crew league ----------------
  function league(crew, onBack) {
    screen((el) => {
      el.className = 'screen league';
      const body = h('div', {});
      el.append(head(`${crew.name}: league`, onBack), body);
      let view = 'total';
      let season = null;
      (async function load() {
        busy(body);
        try {
          const a = await account();
          const seasons = await a.seasons(crew.id);
          if (!season && seasons.length) season = seasons.find((s) => new Date(s.starts_at) <= new Date() && new Date(s.ends_at) > new Date())?.id ?? seasons[0].id;
          const [rows, trophies, games] = await Promise.all([season ? a.league(crew.id, season) : [], a.trophies({ crewId: crew.id }), a.crewGames(crew.id, 20)]);
          const value = (r) => (view === 'total' ? r.total_bb : view === 'avg' ? r.avg_bb : r.points);
          const sorted = rows.slice().sort((x, y) => (value(y) ?? -Infinity) - (value(x) ?? -Infinity));
          const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Standings view' }, ...[['total', 'Total won'], ['avg', 'Average'], ['points', 'Points']].map(([k, t]) =>
            h('button', { role: 'radio', 'aria-checked': view === k ? 'true' : 'false', class: view === k ? 'on' : '', 'data-testid': `view-${k}`, onclick: () => { view = k; load(); } }, t)));
          const names = new Map(rows.map((r) => [r.account_id, r.name]));
          body.replaceChildren(
            seasons.length > 1 && h('label', { class: 'field' }, h('span', {}, 'Season'), h('select', { onchange: (e) => { season = e.target.value; load(); } }, ...seasons.map((s) => h('option', { value: s.id, selected: s.id === season ? true : null }, `${s.name}${s.closed_at ? ' (finished)' : ''}`)))),
            seg,
            h('p', { class: 'hint small' }, view === 'total' ? 'Big blinds won this season: rewards playing a lot and winning.' : view === 'avg' ? 'Big blinds won per game, from 5 games: rewards skill over turning up.' : '10 / 7 / 5 / 3 / 1 for 1st to 5th each game, 1 for playing.'),
            sorted.length
              ? h('ol', { class: 'stand-list league-list', 'data-testid': 'league' }, ...sorted.map((r, k) => h('li', {}, h('button', { class: 'league-row', onclick: () => playerCard(r, trophies) },
                h('span', { class: 'rank' }, value(r) == null ? '–' : String(k + 1)),
                h('div', { class: 'who' }, h('strong', {}, r.name), h('small', {}, `${r.games} game${r.games === 1 ? '' : 's'} · ${r.wins} win${r.wins === 1 ? '' : 's'}`)),
                h('div', { class: 'nums' }, h('span', { class: 'net ' + (view !== 'points' && value(r) > 0 ? 'up' : view !== 'points' && value(r) < 0 ? 'down' : '') },
                  view === 'points' ? `${r.points} pts` : value(r) == null ? 'needs 5 games' : bb(value(r))))))))
              : h('p', { class: 'hint' }, 'No league games this season yet.'),
            trophies.length > 0 && h('section', { class: 'block', 'data-testid': 'trophies' }, h('h3', {}, 'Hall of fame'),
              h('ul', { class: 'log-list' }, ...trophies.slice(0, 20).map((t) => h('li', {}, h('span', {}, `${TROPHY[t.kind]?.[0] ?? '🏅'} ${names.get(t.account_id) || 'A player'}: ${TROPHY[t.kind]?.[1] ?? t.kind}`), h('small', {}, day(t.at)))))),
            games.length > 0 && h('section', { class: 'block' }, h('h3', {}, 'Recent games'),
              h('ul', { class: 'game-list' }, ...games.map((g) => h('li', {}, h('button', { class: 'game-row', onclick: () => game(g.id, () => league(crew, onBack)) },
                h('div', { class: 'who' }, h('strong', {}, day(g.started_at)), h('small', {}, `${g.hands} hands${g.casual ? ' · casual' : ''}${g.status === 'void' ? ' · void' : g.status === 'live' ? ' · playing now' : ''}`))))))));
        } catch (err) { failed(body, err, load); }
      })();
    });
  }

  function playerCard(r, trophies) {
    const mine = trophies.filter((t) => t.account_id === r.account_id);
    const stat = (label, v) => h('div', { class: 'stat' }, h('strong', {}, v), h('small', {}, label));
    openSheet(h('div', { class: 'menu' }, h('h2', {}, r.name),
      h('div', { class: 'stat-grid' },
        stat('games', r.games), stat('hands', fmt(r.hands)), stat('won this season', bb(r.total_bb)), stat('per game', r.avg_bb == null ? '–' : bb(r.avg_bb)),
        stat('plays a hand', r.vpip_pct == null ? '–' : `${r.vpip_pct}%`), stat('raises before the flop', r.pfr_pct == null ? '–' : `${r.pfr_pct}%`),
        stat('showdowns won', r.showdowns_won), stat('biggest pot won', r.biggest_pot ? fmt(r.biggest_pot) : '–'), stat('best hand', r.best_hand == null ? '–' : HAND_NAMES[r.best_hand])),
      mine.length > 0 && h('p', {}, mine.map((t) => `${TROPHY[t.kind]?.[0] ?? '🏅'} ${TROPHY[t.kind]?.[1] ?? t.kind}`).join('  '))), { label: r.name });
  }

  return { history, game, league, replay };
}
