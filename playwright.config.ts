import { existsSync } from 'node:fs';
import { chromium, defineConfig, devices, firefox, webkit } from '@playwright/test';

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
 * NFR-011 pins eight browser versions: Chrome 141/140, Edge 141/140, Firefox
 * 145/144 and Safari 26.1/26.0. Playwright cannot install arbitrary historical
 * builds, so each pinned name is declared as its own project and mapped onto
 * the closest engine this machine can actually launch. A project whose engine
 * is genuinely unavailable is *omitted* rather than stubbed, so a matrix run
 * can never report a pass it did not earn — see `docs/architecture.md`
 * ("Browser matrix") for the honest coverage table.
 */
interface PinnedBrowser {
  /** The project name the plan's verification command uses. */
  name: string;
  use: NonNullable<Parameters<typeof defineConfig>[0]['use']>;
  /** Present only when this engine can actually be launched here. */
  available: boolean;
}

/** Locally installed branded browsers, which Playwright launches by channel. */
const CHANNEL_PATHS: Record<string, string[]> = {
  chrome: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ],
  msedge: [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/microsoft-edge',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
};

const hasChannel = (channel: string): boolean =>
  (CHANNEL_PATHS[channel] ?? []).some((path) => existsSync(path));

/** Bundled engines are present once `npx playwright install` has been run. */
const hasEngine = (engine: 'chromium' | 'firefox' | 'webkit'): boolean => {
  try {
    return existsSync({ chromium, firefox, webkit }[engine].executablePath());
  } catch {
    return false;
  }
};

const MATRIX: PinnedBrowser[] = [
  // Chrome 141 is mapped onto the machine's installed Google Chrome; Chrome
  // 140 onto Playwright's bundled Chromium. Both are Blink, neither is 141/140.
  {
    name: 'chrome-141',
    use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    available: hasChannel('chrome'),
  },
  {
    name: 'chrome-140',
    use: { ...devices['Desktop Chrome'] },
    available: hasEngine('chromium'),
  },
  {
    name: 'edge-141',
    use: { ...devices['Desktop Edge'], channel: 'msedge' },
    available: hasChannel('msedge'),
  },
  {
    name: 'edge-140',
    use: { ...devices['Desktop Edge'], channel: 'msedge' },
    available: hasChannel('msedge'),
  },
  {
    name: 'firefox-145',
    use: { ...devices['Desktop Firefox'] },
    available: hasEngine('firefox'),
  },
  {
    name: 'firefox-144',
    use: { ...devices['Desktop Firefox'] },
    available: hasEngine('firefox'),
  },
  {
    name: 'safari-26.1',
    use: { ...devices['Desktop Safari'] },
    available: hasEngine('webkit'),
  },
  {
    name: 'safari-26.0',
    use: { ...devices['Desktop Safari'] },
    available: hasEngine('webkit'),
  },
];

const unavailable = MATRIX.filter((browser) => !browser.available).map((b) => b.name);
// Only the runner process reports it; the workers would repeat it once each.
if (unavailable.length > 0 && process.env.TEST_WORKER_INDEX === undefined) {
  console.warn(
    `[NFR-011] no engine available for: ${unavailable.join(', ')} — those projects are not defined, ` +
      'so a matrix run cannot report a pass for them.',
  );
}

/**
 * The browser VCs run against the built static site served by `vite preview`,
 * which sends the COOP/COEP headers the deployment requires (BR-002).
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
      // The matrix projects own VC-055; the default project owns everything
      // else, so a plain `npx playwright test` runs each spec exactly once.
      testIgnore: /matrix\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
    ...MATRIX.filter((browser) => browser.available).map(({ name, use }) => ({
      name,
      testMatch: /matrix\.spec\.ts$/,
      use,
    })),
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
