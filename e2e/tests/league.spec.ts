// Phase 4 screens with live data (LIVE_SUPABASE=1): three real accounts play a short crew game on the
// Cloudflare table server; then the browser, signed in as one of them, goes through My games, the game,
// a hand replay, the crew league in all three views, and voids the game as the crew owner.
import { test, expect } from '@playwright/test';
import WS from 'ws';
import { Account, type KeyStore } from '@tp/account';
import { TableClient, type SocketLike } from '@tp/table';
import { MODELS, newPhone, autoAnswer } from '../harness';

test.skip(!process.env.LIVE_SUPABASE, 'needs LIVE_SUPABASE=1 (talks to the real accounts project)');
const TABLES = process.env.TABLE_URL ?? 'wss://train-poker-tables.apins-subdomain.workers.dev';
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
const until = async (f: () => boolean | Promise<boolean>, ms: number) => { const end = Date.now() + ms; while (!(await f()) && Date.now() < end) await new Promise((r) => setTimeout(r, 300)); return f(); };

test('My games, results, replay, league views, and an admin voids a game', async ({ browser, baseURL }) => {
  test.setTimeout(400_000);
  const stores = [0, 1, 2].map(() => new Map<string, string>());
  const ks = (m: Map<string, string>): KeyStore => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) });
  const names = ['Devika', 'Imran', 'Kavya'];
  const accts = stores.map((m) => new Account({ storage: ks(m) }));
  try {
    await Promise.all(accts.map((a, i) => a.start(names[i]!)));
    const crew = await accts[0]!.createCrew('Replay crew');
    const inv = await accts[0]!.createInvite(crew.id);
    await accts[1]!.joinCrew(inv); await accts[2]!.joinCrew(inv);

    // a short crew game at a live table
    const table = 'UI' + Math.floor(Math.random() * 1e6);
    const clients = accts.map((a, i) => {
      let busy = '';
      const c: TableClient = new TableClient({
        url: `${TABLES}/table/${table}`, table, player: a.profile!.id, getTicket: () => a.ticket(table), open: (u) => new WS(u) as unknown as SocketLike,
        ...(i === 0 ? { settings: { crew: crew.id, startStack: 1000, sb: 10, bb: 20 } } : {}),
        onView: (v) => {
          const h = v.hand, me = a.profile!.id;
          if (!h || h.toAct !== me || !v.legal) return;
          const k = `${v.handNo}:${h.street}:${h.currentBet}:${h.ps[me]!.total}`;
          if (busy === k) return;
          busy = k;
          c.act({ type: v.legal.canCheck ? 'check' : 'call' }); // everyone sees the river: showdowns to replay
        },
      });
      return c;
    });
    expect(await until(() => clients.every((c) => c.status === 'live' && c.view?.players.length === 3), 20_000)).toBe(true);
    const host = clients.find((c) => c.you === c.host)!;
    host.send({ t: 'host', cmd: 'deal' });
    expect(await until(() => (host.view?.handNo ?? 0) >= 3 && host.view?.phase !== 'hand', 120_000)).toBe(true);
    host.send({ t: 'host', cmd: 'end' });
    expect(await until(() => host.view?.phase === 'ended', 20_000)).toBe(true);
    for (const c of clients) c.close();
    expect(await until(async () => (await accts[0]!.myGames(5)).some((g) => g.status === 'ended'), 60_000)).toBe(true);

    // the browser, signed in as Devika (the same login a phone keeps in its storage)
    const ph = await newPhone(browser, 'Devika', MODELS.pixel7, baseURL!, proxy ? { proxy } : {});
    await autoAnswer(ph.page);
    await ph.ctx.addInitScript(([login, name]) => { localStorage.setItem('tp-login', login!); localStorage.setItem('tp-name', name!); }, [stores[0]!.get('tp-login')!, 'Devika']);
    const page = ph.page;
    await page.goto('/');
    await page.getByTestId('open-profile').click();
    await expect(page.getByTestId('name')).toHaveValue('Devika');

    // My games -> the game -> results
    await page.getByTestId('my-games').click();
    await expect(page.getByTestId('games')).toContainText('Replay crew');
    await page.getByTestId('games').getByRole('button').first().click();
    await expect(page.getByTestId('results').locator('li')).toHaveCount(3);
    for (const n of names) await expect(page.getByTestId('results')).toContainText(n);

    // replay hand #1 step by step to the end
    await page.getByTestId('hands').getByRole('button', { name: /Replay hand 1,/ }).click();
    await expect(page.getByTestId('replay-say')).toHaveText('The cards are dealt');
    for (let i = 0; i < 40 && await page.getByTestId('replay-next').isEnabled(); i++) await page.getByTestId('replay-next').click();
    await expect(page.locator('.replay-result')).toContainText('wins');
    // at the showdown the players who reached it are shown; Devika always sees her own cards
    await expect(page.locator('.replay-stage .mini-cards').first().locator('[role=img]').first()).not.toHaveAttribute('aria-label', 'Face-down card');
    // the shuffle seed never reached the phones during play; after the game a player checks the deal
    await page.getByTestId('check-deal').click();
    await expect(page.getByTestId('proof-result')).toHaveText('Fair deal: the deck matches the fingerprint shown before the cards were dealt.');

    // the crew league, three views
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByTestId('crews').getByText('Replay crew').click();
    await page.getByTestId('open-league').click();
    await expect(page.getByTestId('league').locator('li')).toHaveCount(3);
    await page.getByTestId('view-avg').click();
    await expect(page.getByTestId('league')).toContainText('needs 5 games');
    await page.getByTestId('view-points').click();
    await expect(page.getByTestId('league')).toContainText('10 pts');

    // the owner voids the game: it leaves the league, and the reason is shown
    await page.locator('.game-row').first().click();
    await page.getByTestId('void').click();
    await expect(page.locator('.void-note')).toContainText('Test game, not a real night');
    await expect(page.getByTestId('changes')).toContainText('voided the game');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByText('No league games this season yet.')).toBeVisible();
    expect(ph.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    await ph.ctx.close();
    await accts[0]!.deleteCrew(crew.id);
  } finally {
    for (const a of accts) if (a.profile) await a.deleteAccount().catch(() => {});
  }
});
