// The daily archive: research events older than N days (default 14) move from the database to the R2
// bucket as gzipped NDJSON, partitioned by date and type, and are deleted from the database only after the
// upload is read back and checked. It must never lose data:
//
//   1. take a slice of a day: up to `pageRows` rows received before a cutoff (10 minutes ago), in id order;
//   2. write one file per event type: research/v1/day=YYYY-MM-DD/type=<type>/part-<first id>-<last id>.ndjson.gz;
//   3. read each file back: its SHA-256 and its line count must match what was written;
//   4. write the slice's manifest (rows, the SHA-256 of the slice's ids, each file's rows, bytes, SHA-256)
//      and read it back too;
//   5. only then ask the database to delete the slice; the database deletes only if the same rows are still
//      there (same count, same SHA-256 over their ids), else nothing.
//
// Idempotent: run again after a crash anywhere in between and the same slice gives the same keys and the
// same bytes (files are overwritten with identical content), and the delete happens once. A slice whose
// delete was refused leaves its files behind: rows are never lost, at worst a later slice archives some of
// them again, and the export drops repeated event ids.

export interface ArchiveRow { id: string; type: string; [k: string]: unknown }

export interface ArchiveDb {
  upkeep(): Promise<unknown>;
  days(keepDays: number): Promise<{ day: string; rows: number }[]>;
  page(day: string, cutoff: string, limit: number): Promise<ArchiveRow[]>;
  commit(c: { day: string; cutoff: string; first: string; last: string; rows: number; ids_sha256: string; key: string }): Promise<{ ok: boolean; deleted?: number }>;
  subjects?(): Promise<unknown[]>;
}

export interface ArchiveBucket {
  put(key: string, data: Uint8Array, meta: Record<string, string>): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export interface ArchiveDeps {
  db: ArchiveDb;
  bucket: ArchiveBucket;
  gzip(data: Uint8Array): Promise<Uint8Array>;
  gunzip(data: Uint8Array): Promise<Uint8Array>;
  sha256(data: Uint8Array): Promise<string>;
  now(): number;
  log(m: string): void;
}

export interface ArchiveOptions {
  keepDays: number;
  /** Rows per slice (one slice: one page, its files, its manifest, one delete). */
  pageRows: number;
  /** Most rows one run handles (the worker's time and memory); the rest waits for the next run. */
  maxRows: number;
  prefix: string;
}
export const ARCHIVE_DEFAULTS: ArchiveOptions = { keepDays: 7, pageRows: 5000, maxRows: 40_000, prefix: 'research/v1' };

export interface ArchiveReport { slices: number; rows: number; deleted: number; files: number; bytes: number; refused: number; errors: string[] }

// (built without DOM types: TextEncoder and TextDecoder exist on every runtime this runs on)
const G = globalThis as unknown as { TextEncoder: new () => { encode(s: string): Uint8Array }; TextDecoder: new () => { decode(b: Uint8Array): string } };
// (made when first used: the offline host phone's QuickJS bundles this module and has no TextEncoder)
const enc = { encode: (x: string): Uint8Array => new G.TextEncoder().encode(x) };
const dec = { decode: (b: Uint8Array): string => new G.TextDecoder().decode(b) };
const safeType = (t: string): string => t.replace(/[^a-z0-9_.-]/gi, '_');

/** One slice: files, verification, manifest, delete. Returns false if anything did not check out. */
async function archiveSlice(d: ArchiveDeps, o: ArchiveOptions, day: string, cutoff: string, rows: ArchiveRow[], r: ArchiveReport): Promise<boolean> {
  const ids = rows.map((x) => x.id).sort();
  const first = ids[0]!, last = ids[ids.length - 1]!;
  const idsSha = await d.sha256(enc.encode(ids.join(',')));
  const byType = new Map<string, ArchiveRow[]>();
  for (const row of rows) { const t = safeType(row.type); if (!byType.has(t)) byType.set(t, []); byType.get(t)!.push(row); }
  const files: { key: string; type: string; rows: number; bytes: number; sha256: string; ndjson_sha256: string }[] = [];
  for (const [type, list] of [...byType.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const text = enc.encode(list.map((x) => JSON.stringify(x)).join('\n') + '\n');
    const gz = await d.gzip(text);
    const sha = await d.sha256(gz);
    const key = `${o.prefix}/day=${day}/type=${type}/part-${first}-${last}.ndjson.gz`;
    await d.bucket.put(key, gz, { sha256: sha, rows: String(list.length) });
    // read it back: the same bytes, and the same lines once unzipped
    const back = await d.bucket.get(key);
    if (!back || (await d.sha256(back)) !== sha) { r.errors.push(`${key}: read back does not match`); return false; }
    const lines = dec.decode(await d.gunzip(back)).split('\n').filter((x) => x.length).length;
    if (lines !== list.length) { r.errors.push(`${key}: ${lines} lines, expected ${list.length}`); return false; }
    files.push({ key, type, rows: list.length, bytes: gz.byteLength, sha256: sha, ndjson_sha256: await d.sha256(text) });
    r.files++; r.bytes += gz.byteLength;
  }
  const manifest = { v: 1, day, cutoff, first, last, rows: rows.length, ids_sha256: idsSha, files, made_at: new Date(d.now()).toISOString() };
  const mkey = `${o.prefix}/day=${day}/manifest-${first}-${last}.json`;
  const mbytes = enc.encode(JSON.stringify(manifest));
  await d.bucket.put(mkey, mbytes, { sha256: await d.sha256(mbytes) });
  const mback = await d.bucket.get(mkey);
  if (!mback || (await d.sha256(mback)) !== (await d.sha256(mbytes))) { r.errors.push(`${mkey}: read back does not match`); return false; }
  const c = await d.db.commit({ day, cutoff, first, last, rows: rows.length, ids_sha256: idsSha, key: mkey });
  if (!c.ok) { r.refused++; r.errors.push(`${day} ${first}..${last}: the database did not match, nothing deleted`); return false; }
  r.slices++; r.rows += rows.length; r.deleted += c.deleted ?? 0;
  return true;
}

/** One run of the job (the worker's daily cron). Never deletes anything it has not verified in the bucket. */
export async function runArchive(d: ArchiveDeps, opt: Partial<ArchiveOptions> = {}): Promise<ArchiveReport> {
  const o = { ...ARCHIVE_DEFAULTS, ...opt };
  const r: ArchiveReport = { slices: 0, rows: 0, deleted: 0, files: 0, bytes: 0, refused: 0, errors: [] };
  try { await d.db.upkeep(); } catch (e) { r.errors.push(`upkeep: ${String(e)}`); }
  // the research ids, every day (small): kept in the archive too, so they outlive the database
  if (d.db.subjects) {
    try {
      const subj = enc.encode(JSON.stringify(await d.db.subjects()));
      const day = new Date(d.now()).toISOString().slice(0, 10);
      const gz = await d.gzip(subj);
      await d.bucket.put(`${o.prefix}/subjects/subjects-${day}.json.gz`, gz, { sha256: await d.sha256(gz) });
    } catch (e) { r.errors.push(`subjects: ${String(e)}`); }
  }
  let days: { day: string; rows: number }[];
  try { days = await d.db.days(o.keepDays); } catch (e) { r.errors.push(`days: ${String(e)}`); return r; }
  const cutoff = new Date(d.now() - 10 * 60_000).toISOString();
  let budget = o.maxRows;
  for (const { day } of days.sort((a, b) => (a.day < b.day ? -1 : 1))) {
    while (budget > 0) {
      let rows: ArchiveRow[];
      try { rows = await d.db.page(day, cutoff, Math.min(o.pageRows, budget)); } catch (e) { r.errors.push(`page ${day}: ${String(e)}`); return r; }
      if (!rows.length) break;
      let ok = false;
      try { ok = await archiveSlice(d, o, day, cutoff, rows, r); } catch (e) { r.errors.push(`slice ${day}: ${String(e)}`); }
      if (!ok) return r; // stop: nothing more is deleted this run; the next run starts over
      budget -= rows.length;
    }
    if (budget <= 0) break;
  }
  d.log(`research archive: ${JSON.stringify({ ...r, errors: r.errors.slice(0, 5) })}`);
  return r;
}

/** The database side of the job, through the signed functions (see the research migration). */
export function archiveDb(call: (fn: string, body: Record<string, unknown>) => Promise<unknown>): ArchiveDb {
  return {
    upkeep: () => call('research_upkeep', {}),
    days: async (keep) => (await call('research_archive_days', { keep_days: keep })) as { day: string; rows: number }[],
    page: async (day, cutoff, limit) => (await call('research_archive_page', { day, cutoff, limit })) as ArchiveRow[],
    commit: async (c) => (await call('research_archive_commit', c)) as { ok: boolean; deleted?: number },
    subjects: async () => (await call('research_subjects', {})) as unknown[],
  };
}
