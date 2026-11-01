// Writes dist/sw.js: precaches every built file under a cache name derived from their contents,
// so a new build always replaces the old cache and an unchanged build keeps it.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(dist)
  .map((p) => relative(dist, p).split('\\').join('/'))
  .filter((f) => !f.endsWith('.map') && f !== 'sw.js')
  .sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 12);

const template = readFileSync(join(root, 'sw.template.js'), 'utf8');
const out = template
  .replace("'__CACHE__'", JSON.stringify(`train-poker-${version}`))
  .replace('__FILES__', JSON.stringify(['./', ...files], null, 2));
writeFileSync(join(dist, 'sw.js'), out);
console.log(`sw.js: ${files.length} files, cache train-poker-${version}`);
