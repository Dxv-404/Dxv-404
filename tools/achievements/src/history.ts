// What every player of a crew has already earned, from the stored hands and games.
//
//   node dist/history.mjs <export.json> [--json | --body]
//
// <export.json> is the one value tools/achievements/export.sql returns (a read-only SELECT). Nothing is
// written anywhere: the result is printed (--json: as data; --body: as the one call body the profile
// migration's record_achievements takes, for the owner to sign and send after approving the database change).
import fs from 'node:fs';
import { printable, recordBody, runHistory, type CrewExport } from './lib';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: history.mjs <export.json> [--json | --body]'); process.exit(2); }
let data = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
// the SQL editor and the database tools wrap the value in rows: [{"export": {...}}]
while (Array.isArray(data) && data.length === 1) data = data[0];
if (data && typeof data === 'object' && 'export' in data) data = (data as { export: unknown }).export;
const report = runHistory(data as CrewExport);
const crewId = (data as CrewExport).crew?.id ?? 'crew';
console.log(args.includes('--body') ? JSON.stringify(recordBody(report, `history:${crewId}`)) : args.includes('--json') ? JSON.stringify(report, null, 1) : printable(report));
