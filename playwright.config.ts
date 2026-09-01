import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
export const BASE_URL = `http://localhost:${PORT}`;

/**
 * The browser VCs run against the built static site served by `vite preview`,
 * which sends the COOP/COEP headers the deployment requires (BR-002).
 * Iteration 8 adds the full pinned browser matrix; chromium only for now.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
