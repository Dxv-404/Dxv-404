#!/usr/bin/env node
// Research export (owner-run): every research event in a date range, from the database and the R2 archive,
// each event once, with research ids instead of identities and names scrubbed, as NDJSON per event type.
// The data dictionary is docs/research-data.md.
//
//   RECORDER_TOKEN=... node tools/research/export.mjs --from 2026-11-01 --to 2026-11-30 --out research-export
//     [--archive-dir <a local copy of the bucket>]  or  [--r2]  (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)
//     [--no-db]       archive only
//     [--names]       also write the private name map (research id -> names) to tools/research/private/name-map.json
//                     (git-ignored; never commit it, never share it with the dataset)
//   SUPABASE_URL / SUPABASE_KEY default to the live project's URL and public key.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { LIVE_KEY, LIVE_URL, anonymizer, archiveRows, daysBetween, dbCaller, dbRows, deduper, dirClient, r2Client } from './src/lib.mjs';

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const from = opt('from'), to = opt('to') ?? from;
const out = opt('out', 'research-export');
if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) { console.error('usage: export.mjs --from YYYY-MM-DD [--to YYYY-MM-DD] [--out dir] [--archive-dir dir | --r2] [--no-db] [--names]'); process.exit(2); }
const log = (m) => console.error(m);

const here = path.dirname(fileURLToPath(import.meta.url));
const call = flag('no-db') ? null : dbCaller({ url: process.env.SUPABASE_URL ?? LIVE_URL, key: process.env.SUPABASE_KEY ?? LIVE_KEY, token: process.env.RECORDER_TOKEN });
const archive = opt('archive-dir') ? dirClient(path.resolve(opt('archive-dir')), fs)
  : flag('r2') ? r2Client({ accountId: process.env.R2_ACCOUNT_ID, accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, bucket: process.env.R2_BUCKET ?? 'train-poker-research' })
  : null;

fs.mkdirSync(path.join(out, 'events'), { recursive: true });
const tmp = path.join(out, '.raw.ndjson');
const raw = fs.createWriteStream(tmp);
const seen = deduper();
const names = new Set();
const fromDb = { rows: 0 }, fromArchive = { rows: 0 };
const keep = (r) => {
  if (!seen.first(r.id)) return;
  // names the seats were given at tables, to scrub them out of any text (and for the private map)
  if (r.type === 'seat.join' && r.payload?.name) names.add(String(r.payload.name));
  if (r.type === 'game.end' && Array.isArray(r.payload?.players)) for (const p of r.payload.players) if (p?.name) names.add(String(p.name));
  raw.write(`${JSON.stringify(r)}\n`);
};

// 1. gather: the archive first (older days), then whatever the database still holds
const days = daysBetween(from, to);
if (archive) for await (const r of archiveRows(archive, days, 'research/v1', log)) { fromArchive.rows++; keep(r); }
if (call) for await (const r of dbRows(call, from, to)) { fromDb.rows++; keep(r); }
await new Promise((r) => raw.end(r));

// 2. research ids, names, and the anonymised dataset (one NDJSON file per event type)
let subjects = [];
let nameMap = [];
if (call) {
  subjects = await call('research_subjects', {});
  nameMap = await call('research_name_map', {});
} else if (archive) {
  const keys = (await archive.list('research/v1/subjects/')).sort();
  if (keys.length) subjects = JSON.parse((await import('node:zlib')).gunzipSync(await archive.get(keys[keys.length - 1])).toString('utf8'));
}
for (const n of nameMap) { if (n.account_name) names.add(n.account_name); for (const t of n.table_names ?? []) names.add(t); }
const anon = anonymizer(subjects, [...names]);
const files = new Map();
const counts = {};
for await (const line of readline.createInterface({ input: fs.createReadStream(tmp) })) {
  if (!line) continue;
  const row = anon.row(JSON.parse(line));
  const t = row.type.replace(/[^a-z0-9_.]/gi, '_');
  if (!files.has(t)) files.set(t, fs.createWriteStream(path.join(out, 'events', `${t}.ndjson`)));
  files.get(t).write(`${JSON.stringify(row)}\n`);
  counts[t] = (counts[t] ?? 0) + 1;
}
await Promise.all([...files.values()].map((f) => new Promise((r) => f.end(r))));
fs.rmSync(tmp);
fs.writeFileSync(path.join(out, 'subjects.ndjson'), subjects.map((s) => JSON.stringify({ rid: s.rid, kind: s.kind, first_seen: s.first_seen })).join('\n') + (subjects.length ? '\n' : ''));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
  exported_at: new Date().toISOString(), from, to, schema: 'docs/research-data.md', envelope_version: 1,
  sources: { database: call ? fromDb.rows : null, archive: archive ? fromArchive.rows : null }, events: seen.count, duplicates_dropped: seen.dups, by_type: counts,
}, null, 2));
log(`research export: ${seen.count} events (${seen.dups} duplicates dropped) in ${files.size} files under ${out}`);

if (flag('names')) {
  const dir = path.join(here, 'private');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'name-map.json');
  fs.writeFileSync(file, JSON.stringify(nameMap.map((n) => ({ rid: n.rid, kind: n.kind, account_name: n.account_name, table_names: n.table_names })), null, 2), { mode: 0o600 });
  log(`private name map: ${file} (git-ignored: keep it to yourself)`);
}
