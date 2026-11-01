import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'tools/*/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/index.ts', '**/types.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
      // Phase 0 floor; raised to 100% branches for the engine at the Phase 1 gate.
      thresholds: { lines: 95, branches: 90, functions: 95, statements: 95 },
    },
  },
});
