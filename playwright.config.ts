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
 * A private copy of the same build, over which VC-063 can publish a second
 * deployment without disturbing the build the rest of the suite runs against.
 */
const DEPLOY_PORT = 4175;
export const DEPLOY_BASE_URL = `http://localhost:${DEPLOY_PORT}`;

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
    /**
     * Service workers are opt-in per spec file. The offline specs enable them
     * with `test.use({ serviceWorkers: 'allow' })`; every other spec exercises
     * the page with no worker installed, which is also the state VC-015
     * describes ("with the service worker unregistered") and keeps a
     * cache-first worker from masking the deliberately-404ed assets of VC-014
     * and VC-049.
     */
    serviceWorkers: 'block',
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
    {
      command: `node scripts/serve-deploy.mjs ${DEPLOY_PORT}`,
      url: DEPLOY_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
