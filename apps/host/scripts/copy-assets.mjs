// Copies the bundled engine and the host page into the Android app's assets.
import { cpSync, mkdirSync } from 'node:fs';
const assets = new URL('../android/app/src/main/assets/', import.meta.url);
mkdirSync(new URL('web/', assets), { recursive: true });
cpSync(new URL('../dist/engine.js', import.meta.url), new URL('engine.js', assets));
cpSync(new URL('../web/', import.meta.url), new URL('web/', assets), { recursive: true });
console.log('assets copied');
