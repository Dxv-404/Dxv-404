// Copies into the Android app's assets: the table server script, the engine self-check, and the whole web
// app (guests' phones load the game from the host phone: the hotspot has no internet).
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
const assets = new URL('../android/app/src/main/assets/', import.meta.url);
const web = new URL('../../web/dist/', import.meta.url);
if (!existsSync(web)) throw new Error('Build the web app first (pnpm --filter @tp/web build)');
rmSync(new URL('web/', assets), { recursive: true, force: true });
mkdirSync(new URL('web/', assets), { recursive: true });
cpSync(new URL('../dist/engine.js', import.meta.url), new URL('engine.js', assets));
cpSync(new URL('../dist/host-runtime.js', import.meta.url), new URL('host-runtime.js', assets));
cpSync(web, new URL('web/', assets), { recursive: true, filter: (src) => !src.endsWith('.map') });
console.log('assets copied');
