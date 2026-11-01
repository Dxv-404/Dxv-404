// Bundles the offline table server (TableRoom and everything it uses) into one plain script for QuickJS.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2020',
    minify: true,
    lib: { entry: 'src/host-runtime.ts', name: 'TPHost', formats: ['iife'], fileName: () => 'host-runtime.js' },
  },
});
