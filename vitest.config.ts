import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'tools/*/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'tools/*/src/**/*.ts'],
      exclude: ['**/index.ts', '**/types.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
      // The rules engine must stay fully covered (Phase 1 gate); everything else at least 85% of lines.
      thresholds: {
        lines: 85,
        'packages/engine/src/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  },
});
