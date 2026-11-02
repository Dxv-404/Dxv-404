import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: 'e2e/tests',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  retries: 0, // a flaky pass is a fail; the gate runs everything 3 times with --repeat-each=3
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'tp-18', value: '1' }] }] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: {
    command: `pnpm --filter @tp/web build && pnpm --filter @tp/web exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
