import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// the build's commit (research events carry the app version and build: docs/research-data.md)
const build = (() => { try { return execSync('git rev-parse --short=10 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; } })();

export default defineConfig({
  base: '/',
  define: { __TP_BUILD__: JSON.stringify(build) },
  build: { target: 'es2020', sourcemap: true, assetsInlineLimit: 0 },
  server: { host: true, port: 5173 },
  preview: { host: true },
});
