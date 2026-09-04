import { expect, test, type Route } from '@playwright/test';
import { DEPLOY_BASE_URL } from '../../playwright.config';
import {
  cacheBuckets,
  consoleText,
  editorText,
  noticeTexts,
  precacheReport,
  programStdout,
  recordStatuses,
  runProgram,
  statusHistory,
  statusText,
  storedProgram,
  submitStdin,
  typeProgram,
  waitForLinter,
  waitForPythonReady,
  waitForStatus,
} from './helpers';

/**
 * Iteration 7 is the only part of the suite that runs with a service worker.
 * Everywhere else it is blocked (see `playwright.config.ts`), so a cache-first
 * worker can never mask the deliberately-broken assets of VC-014 and VC-049,
 * and VC-015 keeps observing the page with the worker unregistered.
 */
test.use({ serviceWorkers: 'allow' });

/** Requests the service worker itself made, as opposed to the page's. */
const fromServiceWorker = (route: Route): boolean => route.request().serviceWorker() !== null;

test('VC-072 (FR-051, FR-065): the precache bucket holds every manifest URL', async ({ page }) => {
  await page.goto('/');
  await waitForPythonReady(page);
  await waitForStatus(page, 'Offline ready');

  const report = await precacheReport(page);
  expect(report.missing).toEqual([]);
  // The manifest really is the whole Run loop, not a token subset.
  expect(report.urls).toContain('/');
  expect(report.urls).toContain('/sw.js');
  expect(report.urls).toContain('/pyodide/pyodide.asm.wasm');
  expect(report.urls).toContain('/pyodide/python_stdlib.zip');
  expect(report.urls).toContain('/ruff/ruff_wasm_bg.wasm');
  expect(report.urls.some((url) => /^\/assets\/index-.*\.js$/.test(url))).toBe(true);
  expect(report.urls.some((url) => /^\/assets\/index-.*\.css$/.test(url))).toBe(true);

  // Data & Interfaces: exactly one bucket, named for this build.
  expect(await cacheBuckets(page)).toEqual([`pyplay-assets-v${report.build}`]);
});

test('VC-080 (FR-065): the status bar walks Loading → Caching → Offline ready', async ({ page }) => {
  // Hold one manifest asset back inside the worker only, so the precache is
  // still genuinely in progress when the runtime reaches ready (FR-013).
  await page.context().route('**/ruff/ruff_wasm_bg.wasm', async (route) => {
    if (fromServiceWorker(route)) await new Promise((resolve) => setTimeout(resolve, 6000));
    await route.continue();
  });

  await recordStatuses(page);
  await page.goto('/');
  await waitForPythonReady(page);
  expect(await statusText(page)).toBe('Caching for offline…');
  await waitForStatus(page, 'Offline ready');

  const history = await statusHistory(page);
  const loading = history.findIndex((text) => /^Loading Python… \d+%$/.test(text));
  const caching = history.indexOf('Caching for offline…');
  const ready = history.indexOf('Offline ready');
  expect(loading).toBeGreaterThanOrEqual(0);
  expect(caching).toBeGreaterThan(loading);
  expect(ready).toBeGreaterThan(caching);

  // A non-interactive line between the toolbar and the console.
  const shape = await page.evaluate(() => {
    const bar = document.getElementById('status-bar') as HTMLElement;
    const toolbar = document.querySelector('.toolbar') as HTMLElement;
    const consoleEl = document.getElementById('console') as HTMLElement;
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    return {
      tag: bar.tagName,
      afterToolbar: (toolbar.compareDocumentPosition(bar) & FOLLOWING) !== 0,
      beforeConsole: (bar.compareDocumentPosition(consoleEl) & FOLLOWING) !== 0,
      focusable: bar.hasAttribute('tabindex') || bar.matches('a, button, input, select, textarea'),
    };
  });
  expect(shape).toEqual({ tag: 'P', afterToolbar: true, beforeConsole: true, focusable: false });
});

/**
 * VC-062 / VC-081 (FR-052, FR-065, BR-009). One manifest asset returns 500 to
 * the service worker — and only to the service worker, so the page's own use of
 * that asset is untouched and the online feature set can be checked intact.
 */
test('VC-062, VC-081 (FR-052, BR-009): a failed precache degrades only offline', async ({
  page,
}) => {
  await page.context().route('**/pyodide/python_stdlib.zip', async (route) => {
    if (fromServiceWorker(route)) {
      await route.fulfill({ status: 500, body: 'deliberate precache failure' });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await waitForPythonReady(page);
  await waitForStatus(page, 'Offline unavailable');

  // Nothing was left half-precached under this build's name.
  const build = await page.evaluate(async () => {
    const manifest = (await (await fetch('/precache-manifest.json')).json()) as { build: string };
    return manifest.build;
  });
  expect(await cacheBuckets(page)).not.toContain(`pyplay-assets-v${build}`);

  // Run still works.
  await waitForLinter(page);
  await runProgram(page, 'print("still runs")');
  await expect
    .poll(() => programStdout(page), { timeout: 30_000 })
    .toContain('still runs');

  // Format still works (FR-043).
  await runProgram(page, 'x=1');
  await page.getByRole('button', { name: 'Format' }).click();
  await expect
    .poll(() => page.evaluate(() => document.querySelector('.cm-content')?.textContent ?? ''))
    .toContain('x = 1');

  // Autosave still works (FR-002).
  await expect.poll(() => storedProgram(page), { timeout: 5000 }).toBe('x = 1\n');

  expect(await statusText(page)).toBe('Offline unavailable');
});

/**
 * VC-063 (FR-053). A second deployment is genuinely published over a private
 * copy of the build — the application bundle is re-fingerprinted and the
 * manifest and service worker are regenerated — and the page is reloaded once.
 * The one thing this does not cover is a redeploy of *changed application
 * behaviour*: the reload deliberately keeps serving the old cached bundle,
 * which is exactly the "session continues on the old version" the FR requires.
 */
test('VC-063 (FR-053): a waiting worker announces the update without interrupting', async ({
  page,
}) => {
  await page.goto(DEPLOY_BASE_URL);
  await waitForPythonReady(page);
  await waitForStatus(page, 'Offline ready');

  const published = await page.request.get(`${DEPLOY_BASE_URL}/__deploy`);
  expect(published.ok()).toBe(true);

  await page.reload();
  await waitForPythonReady(page);

  await expect
    .poll(() => noticeTexts(page), { timeout: 60_000 })
    .toContain('A new version is available — reload to update');

  // The session that saw the notice keeps running programs, uninterrupted.
  await runProgram(page, 'print("old version still runs")');
  await expect
    .poll(() => programStdout(page), { timeout: 30_000 })
    .toContain('old version still runs');

  // The waiting worker really is waiting, not controlling.
  expect(
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      return { waiting: registration?.waiting !== null, controlled: navigator.serviceWorker.controller !== null };
    }),
  ).toEqual({ waiting: true, controlled: true });
});

/**
 * VC-056 (NFR-012, FR-051, BR-001). The disconnect is simulated with
 * Playwright's offline mode; a physically unplugged network stays a manual
 * sign-off item.
 */
test('VC-056 (NFR-012): the full Run/input loop works offline after a first load', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await waitForPythonReady(page);
  await waitForStatus(page, 'Offline ready');

  await context.setOffline(true);
  await page.reload();

  await waitForPythonReady(page);
  await typeProgram(page, 'pri');
  await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible();
  await page.keyboard.press('Enter');
  expect(await editorText(page)).toBe('print');
  await runProgram(page, 'n = input("? ")\nprint(n)');
  await submitStdin(page, 'sin red');

  await expect.poll(() => programStdout(page), { timeout: 30_000 }).toContain('sin red');
  await expect.poll(() => consoleText(page)).toContain('Program finished in');
});
