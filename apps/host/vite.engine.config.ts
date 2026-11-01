// Bundles the shared rules engine into one plain script for QuickJS inside the host app.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    minify: true,
    lib: { entry: 'src/engine-check.ts', name: 'TPEngineCheck', formats: ['iife'], fileName: () => 'engine.js' },
  },
});
