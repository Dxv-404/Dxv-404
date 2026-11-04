// The research export: signing like a table server, research ids instead of identities, names scrubbed,
// archive files checked against their manifests, and a whole export run against a local database plus an
// archive made by the real archive job.
import { describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { tokenSigner } from '@tp/table';
import { EnvelopeMaker, runArchive, archiveDb } from '@tp/research';
// @ts-expect-error (plain JavaScript module, no types)
import { anonymizer, archiveRows, daysBetween, dbCaller, deduper, dirClient, r2Client, readArchiveFile, sign } from '../src/lib.mjs';

const ROOT = join(__dirname, '..', '..', '..');

describe('research export: pieces', () => {
  it('signs exactly like the table servers', async () => {
    const at = 1_800_000_000_123;
    expect(sign('tok', '{"a":1}', at)).toBe(await tokenSigner('tok', () => at)('{"a":1}'));
  });

  it('replaces identities with research ids and scrubs names', () => {
    const subjects = [{ key: 'a:11111111-1111-4111-8111-111111111111', rid: 'R-ACC' }, { key: 'g:gabc123', rid: 'R-GUEST' }, { key: 'd:dev-1', rid: 'R-DEV' }];
    const a = anonymizer(subjects, ['Riya', 'Dev']);
    const row = a.row({
      id: 'e1', type: 'hand.start', v: 1, sv: 1, src: 's', ts: 't', tc: 1, tm: 2, session: 's', seq: 1, device: 'dev-1', account: '11111111-1111-4111-8111-111111111111', guest: 'gabc123',
      table_code: 'ABCD', game_id: null, hand_no: 3, street: 'flop', app: 'x', received_at: 'r',
      payload: { holes: { gabc123: ['As', 'Kd'], '11111111-1111-4111-8111-111111111111': ['2c', '2d'] }, order: ['gabc123'], name: 'Riya', log: 'Riya raises; Devika calls; Dev folds', authUser: 'unknown-uuid' },
    });
    expect(row).toMatchObject({ device: 'R-DEV', account: 'R-ACC', guest: 'R-GUEST', table: 'ABCD', hand: 3 });
    expect(row.p.holes).toEqual({ 'R-GUEST': ['As', 'Kd'], 'R-ACC': ['2c', '2d'] });
    expect(row.p.order).toEqual(['R-GUEST']);
    expect(row.p.name).toBe('[name]');
    expect(row.p.log).toBe('[name] raises; Devika calls; [name] folds'); // whole names only
    expect(row.p.authUser).toBe('[id]');
    expect(JSON.stringify(row)).not.toMatch(/gabc123|11111111|dev-1|Riya/);
  });

  it('checks archive files against their manifest', () => {
    const lines = [{ id: 'a' }, { id: 'b' }].map((x) => JSON.stringify(x)).join('\n') + '\n';
    const gz = gzipSync(lines);
    const sha = createHash('sha256').update(gz).digest('hex');
    expect(readArchiveFile(gz, { key: 'k', sha256: sha, rows: 2 })).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(() => readArchiveFile(gz, { key: 'k', sha256: 'x', rows: 2 })).toThrow(/checksum/);
    expect(() => readArchiveFile(gz, { key: 'k', sha256: sha, rows: 3 })).toThrow(/manifest says 3/);
    expect(readArchiveFile(gz, null)).toHaveLength(2);
  });

  it('days, duplicates, and the database caller', async () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    const d = deduper();
    expect([d.first('a'), d.first('b'), d.first('a')]).toEqual([true, true, false]);
    expect([d.count, d.dups]).toEqual([2, 1]);
    expect(() => dbCaller({ token: '' })).toThrow(/RECORDER_TOKEN/);
    const seen: { url: string; body: string }[] = [];
    const call = dbCaller({ url: 'https://db', key: 'k', token: 't', fetchFn: async (url: string, init: { body: string }) => { seen.push({ url, body: init.body }); return { ok: true, json: async () => [1] }; } });
    expect(await call('research_subjects', {})).toEqual([1]);
    expect(seen[0]!.url).toBe('https://db/rest/v1/rpc/research_subjects');
    const bad = dbCaller({ token: 't', fetchFn: async () => ({ ok: false, status: 403, text: async () => 'no' }) });
    await expect(bad('x', {})).rejects.toThrow(/403/);
  });

  it('lists and reads R2 with signed requests (S3 API)', async () => {
    const reqs: { url: string; headers: Record<string, string> }[] = [];
    let page = 0;
    const c = r2Client({
      accountId: 'acc', accessKeyId: 'AKID', secretAccessKey: 'SECRET', bucket: 'b', now: () => new Date('2026-11-05T01:02:03Z'),
      fetchFn: async (url: string, init: { headers: Record<string, string> }) => {
        reqs.push({ url, headers: init.headers });
        if (url.includes('list-type')) return { ok: true, text: async () => (page++ === 0 ? '<Key>research/v1/x&amp;y</Key><IsTruncated>true</IsTruncated><NextContinuationToken>T1</NextContinuationToken>' : '<Key>research/v1/z</Key><IsTruncated>false</IsTruncated>') };
        return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
      },
    });
    expect(await c.list('research/v1/')).toEqual(['research/v1/x&y', 'research/v1/z']);
    expect(reqs[1]!.url).toContain('continuation-token=T1');
    expect(reqs[0]!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\/20261105\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect([...(await c.get('research/v1/z'))]).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------- a whole export
const pgUp = (() => { try { execFileSync('pg_isready', ['-h', process.env.PGHOST ?? '/tmp', '-p', process.env.PGPORT ?? '54329'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe.skipIf(!pgUp)('research export: a whole run (local database + an archive made by the archive job)', () => {
  it('exports the range once each, with research ids, from both sources; writes the private map only when asked', async () => {
    const { startFakeSupabase } = await import('../../../e2e/fake-supabase');
    const fake = await startFakeSupabase();
    try {
      await fake.sql(`insert into private.settings values ('recorder_token_hash', encode(extensions.digest('test-recorder-token', 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value`);
      const acct = await fake.sql(`select testing.one('00000000-0000-0000-0000-00000000f001', $$select (public.ensure_account('Devika')).id$$)`);
      const call = dbCaller({ url: fake.url, token: 'test-recorder-token' });
      // events: an old day (to be archived) and today
      const m = new EnvelopeMaker('s', { wall: Date.now, mono: () => 1 }, 'server:test');
      const old = Date.now() - 20 * 86_400_000;
      const events = [
        m.make('seat.join', { pid: 'gguest01', name: 'Riya' }, { g: 'gguest01', d: 'dev-a' }, { tb: 'ABCD' }, { tc: old, ts: old }),
        m.make('hand.start', { holes: { gguest01: ['As', 'Ad'], [acct]: ['Kc', 'Kd'] } }, {}, { tb: 'ABCD', h: 1 }, { tc: old + 1000, ts: old + 1000 }),
        m.make('seat.join', { pid: acct, name: 'Devika' }, { a: acct, d: 'dev-b' }, { tb: 'WXYZ' }),
        m.make('ui.tap', { k: 'x', label: 'Riya' }, { a: acct, d: 'dev-b' }),
      ];
      expect(await call('research_ingest', { events })).toMatchObject({ inserted: 4 });
      // (they arrived back then too)
      await fake.sql(`update research.events set received_at = now() - interval '20 days' where day < current_date - 10`);
      // the archive job moves the old day into a bucket (a local directory here)
      const dir = mkdtempSync(join(tmpdir(), 'tp-archive-'));
      const files = new Map<string, Uint8Array>();
      const sha = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
      const r = await runArchive({ db: archiveDb(call), bucket: { put: async (k, d) => { files.set(k, d); }, get: async (k) => files.get(k) ?? null }, gzip: async (d) => new Uint8Array(gzipSync(d)), gunzip: async (d) => new Uint8Array(gunzipSync(d)), sha256: sha, now: Date.now, log: () => {} });
      expect(r.rows).toBe(2);
      for (const [k, v] of files) { mkdirSync(dirname(join(dir, k)), { recursive: true }); writeFileSync(join(dir, k), v); }
      expect(Number(await fake.sql('select count(*) from research.events'))).toBe(2); // the old day left the database
      // dirClient + archiveRows read it back (checked against the manifest)
      const back = [];
      for await (const row of archiveRows(dirClient(dir, await import('node:fs')), daysBetween(new Date(old).toISOString().slice(0, 10), new Date(old).toISOString().slice(0, 10)))) back.push(row);
      expect(back).toHaveLength(2);
      // the export CLI over both sources
      const out = mkdtempSync(join(tmpdir(), 'tp-export-'));
      const from = new Date(old - 86_400_000).toISOString().slice(0, 10), to = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      // (asynchronously: the stand-in database answers from this very process)
      const run = await new Promise<{ status: number | null; stderr: string }>((res) => {
        const p = spawn(process.execPath, [join(ROOT, 'tools/research/export.mjs'), '--from', from, '--to', to, '--out', out, '--archive-dir', dir], { env: { ...process.env, SUPABASE_URL: fake.url, RECORDER_TOKEN: 'test-recorder-token' } });
        let err = ''; p.stderr.on('data', (c) => { err += c; }); p.on('close', (status) => res({ status, stderr: err }));
      });
      expect(run.status, run.stderr).toBe(0);
      const man = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')) as { events: number; sources: { database: number; archive: number }; by_type: Record<string, number> };
      expect(man).toMatchObject({ events: 4, sources: { database: 2, archive: 2 } });
      expect(readdirSync(join(out, 'events')).sort()).toEqual(['hand.start.ndjson', 'seat.join.ndjson', 'ui.tap.ndjson']);
      const all = readdirSync(join(out, 'events')).map((f) => readFileSync(join(out, 'events', f), 'utf8')).join('');
      expect(all).not.toMatch(new RegExp(`gguest01|${acct}|dev-a|dev-b|Riya|Devika`));
      const hs = JSON.parse(readFileSync(join(out, 'events', 'hand.start.ndjson'), 'utf8').trim()) as { p: { holes: Record<string, string[]> } };
      expect(Object.keys(hs.p.holes).every((k) => /^[0-9a-f-]{36}$/.test(k))).toBe(true);
      const subj = readFileSync(join(out, 'subjects.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
      expect(subj.every((s) => !('key' in s))).toBe(true);
      expect(existsSync(join(ROOT, 'tools/research/private/name-map.json'))).toBe(false);
    } finally { await fake.close(); }
  }, 120_000);
});
