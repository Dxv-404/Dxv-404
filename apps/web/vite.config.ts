import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: { target: 'es2020', sourcemap: true, assetsInlineLimit: 0 },
  server: { host: true, port: 5173 },
  preview: { host: true },
});
