// The research export's building blocks (tools/research/export.mjs runs them; test/export.test.ts tests them).
// Plain JavaScript for Node 22, no build step and no dependencies. Data dictionary: docs/research-data.md.
import { createHash, createHmac } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const LIVE_URL = 'https://yghyartpurzwogtldzii.supabase.co';
export const LIVE_KEY = 'sb_publishable_kkp6rh7CrHks9RS5eDyOrw_J2CXKFdt';

// ---------------------------------------------------------------- the database (signed calls, like a table server)
/** "v1.<ms>.<HMAC-SHA256('<ms>.<body>') keyed with sha256(token)>" (see packages/table/src/record.ts). */
export function sign(token, body, now = Date.now()) {
  const key = createHash('sha256').update(token).digest('hex');
  const t = String(Math.floor(now));
  return `v1.${t}.${createHmac('sha256', key).update(`${t}.${body}`).digest('hex')}`;
}

export function dbCaller({ url = LIVE_URL, key = LIVE_KEY, token, fetchFn = fetch }) {
  if (!token) throw new Error('RECORDER_TOKEN is needed (the table servers\' recorder key) to read the research tables');
  return async (fn, body) => {
    const b = JSON.stringify(body);
    const r = await fetchFn(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ p_body: b, p_sig: sign(token, b) }) });
    if (!r.ok) throw new Error(`${fn}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };
}

/** Every row in [from, to] still in the database, page by page. */
export async function* dbRows(call, from, to, pageSize = 2000) {
  let after = null;
  for (;;) {
    const page = await call('research_export_page', { from, to, limit: pageSize, ...(after ? { after_day: after.day, after_id: after.id } : {}) });
    for (const r of page) yield r;
    if (page.length < pageSize) return;
    const last = page[page.length - 1];
    after = { day: last.day, id: last.id };
  }
}

// ---------------------------------------------------------------- the archive (R2, or a local copy of it)
/** Days from..to (YYYY-MM-DD, inclusive). */
export function daysBetween(from, to) {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) out.push(d.toISOString().slice(0, 10));
  return out;
}

/** Rows of one archived file, after checking it against its manifest entry (sha256 of the gzip, line count). */
export function readArchiveFile(gz, entry) {
  if (entry) {
    const sha = createHash('sha256').update(gz).digest('hex');
    if (sha !== entry.sha256) throw new Error(`${entry.key}: checksum does not match its manifest`);
  }
  const lines = gunzipSync(gz).toString('utf8').split('\n').filter((l) => l.length);
  if (entry && lines.length !== entry.rows) throw new Error(`${entry.key}: ${lines.length} rows, the manifest says ${entry.rows}`);
  return lines.map((l) => JSON.parse(l));
}

/** Minimal S3 (R2) client: list a prefix and get objects, signed with AWS Signature V4. */
export function r2Client({ accountId, accessKeyId, secretAccessKey, bucket, fetchFn = fetch, now = () => new Date() }) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const hmac = (k, s) => createHmac('sha256', k).update(s).digest();
  const hash = (s) => createHash('sha256').update(s).digest('hex');
  const signed = (path, query) => {
    const d = now();
    const amz = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const day = amz.slice(0, 8);
    const q = Object.keys(query).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join('&');
    const canonPath = path.split('/').map((p) => encodeURIComponent(p)).join('/');
    const headers = { host, 'x-amz-content-sha256': hash(''), 'x-amz-date': amz };
    const names = Object.keys(headers).sort();
    const canon = ['GET', canonPath, q, names.map((n) => `${n}:${headers[n]}\n`).join(''), names.join(';'), hash('')].join('\n');
    const scope = `${day}/auto/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amz, scope, hash(canon)].join('\n');
    const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), 'auto'), 's3'), 'aws4_request');
    const sig = createHmac('sha256', kSigning).update(toSign).digest('hex');
    return { url: `https://${host}${canonPath}${q ? `?${q}` : ''}`, headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}` } };
  };
  return {
    async list(prefix) {
      const keys = [];
      let token = null;
      do {
        const q = { 'list-type': '2', prefix, ...(token ? { 'continuation-token': token } : {}) };
        const s = signed(`/${bucket}`, q);
        const r = await fetchFn(s.url, { headers: s.headers });
        if (!r.ok) throw new Error(`R2 list ${prefix}: ${r.status} ${(await r.text()).slice(0, 200)}`);
        const xml = await r.text();
        for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1].replace(/&amp;/g, '&'));
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? (/<NextContinuationToken>([^<]+)</.exec(xml)?.[1] ?? null) : null;
      } while (token);
      return keys;
    },
    async get(key) {
      const s = signed(`/${bucket}/${key}`, {});
      const r = await fetchFn(s.url, { headers: s.headers });
      if (!r.ok) throw new Error(`R2 get ${key}: ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    },
  };
}

/** A local copy of the bucket (rclone / wrangler download) as the same list/get interface. */
export function dirClient(root, fs) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  return {
    async list(prefix) { try { return walk(root).map((p) => p.slice(root.length + 1)).filter((k) => k.startsWith(prefix)); } catch { return []; } },
    async get(key) { return fs.readFileSync(`${root}/${key}`); },
  };
}

/** Every archived row of these days (each file checked against its manifest). */
export async function* archiveRows(client, days, prefix = 'research/v1', log = () => {}) {
  for (const day of days) {
    const keys = await client.list(`${prefix}/day=${day}/`);
    const entries = new Map();
    for (const k of keys.filter((x) => /\/manifest-[^/]+\.json$/.test(x))) {
      const m = JSON.parse((await client.get(k)).toString('utf8'));
      for (const f of m.files) entries.set(f.key, f);
    }
    for (const k of keys.filter((x) => x.endsWith('.ndjson.gz'))) {
      const entry = entries.get(k);
      if (!entry) log(`warning: ${k} has no manifest (an archive run that stopped before its manifest): read without checks`);
      for (const r of readArchiveFile(await client.get(k), entry)) yield r;
    }
  }
}

// ---------------------------------------------------------------- research ids instead of identities
const NAME_KEYS = new Set(['name', 'names', 'p_name', 'account_name', 'table_names', 'actor_name', 'target_name', 'deviceName', 'device_name']);

/**
 * Replaces identities with research ids: the envelope's device / account / guest, and anywhere inside a
 * payload a value or a key that is a known account id, guest id or device id. Names are removed (keys named
 * like names) and scrubbed out of any text (each known name, 3+ letters, becomes "[name]").
 */
export function anonymizer(subjects, names = []) {
  const rid = new Map();
  // an account's seat id is the account id, and a server may also have seen it as a guest seat: the same raw id
  // must always become the account's research id, so the name map and every payload agree
  const rank = (k) => (k.startsWith('a:') ? 0 : k.startsWith('g:') ? 1 : 2);
  for (const s of [...subjects].sort((x, y) => rank(y.key) - rank(x.key))) rid.set(s.key.slice(2), s.rid);
  const nameRe = names.filter((n) => typeof n === 'string' && n.trim().length >= 3).sort((a, b) => b.length - a.length)
    .map((n) => n.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const scrubRe = nameRe.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${nameRe.join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
  const str = (s) => (rid.has(s) ? rid.get(s) : scrubRe ? s.replace(scrubRe, '[name]') : s);
  const walk = (v, depth = 0) => {
    if (depth > 40) return v;
    if (typeof v === 'string') return str(v);
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, x] of Object.entries(v)) {
        if (NAME_KEYS.has(k)) { out[k] = x === null ? null : '[name]'; continue; }
        if (k === 'authUser') { out[k] = typeof x === 'string' ? (rid.get(x) ?? '[id]') : x; continue; }
        out[rid.has(k) ? rid.get(k) : k] = walk(x, depth + 1);
      }
      return out;
    }
    return v;
  };
  return {
    row(r) {
      return {
        id: r.id, type: r.type, v: r.v, sv: r.sv, src: r.src, ts: r.ts, tc: r.tc, tm: r.tm, session: r.session, seq: r.seq,
        device: r.device ? (rid.get(r.device) ?? '[id]') : null, account: r.account ? (rid.get(r.account) ?? '[id]') : null, guest: r.guest ? (rid.get(r.guest) ?? '[id]') : null,
        table: r.table_code ?? null, game: r.game_id ?? null, hand: r.hand_no ?? null, street: r.street ?? null, app: r.app ?? null, received: r.received_at ?? null,
        p: walk(typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload),
      };
    },
    rid: (raw) => rid.get(raw) ?? null,
  };
}

/** Rows from both sources, each event once (the archive and the database can overlap). */
export function deduper() {
  const seen = new Set();
  let dups = 0;
  return { first(id) { if (seen.has(id)) { dups++; return false; } seen.add(id); return true; }, get dups() { return dups; }, get count() { return seen.size; } };
}
