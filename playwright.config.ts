import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
export const BASE_URL = `http://localhost:${PORT}`;

/**
 * A second origin serving the same build without COOP/COEP, so VC-015 can
 * exercise FR-015's non-isolated state.
 */
const PLAIN_PORT = 4174;
export const PLAIN_BASE_URL = `http://localhost:${PLAIN_PORT}`;

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
  timeout: 60_000,
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
  webServer: [
    {
      command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: `node scripts/serve-plain.mjs ${PLAIN_PORT}`,
      url: PLAIN_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
