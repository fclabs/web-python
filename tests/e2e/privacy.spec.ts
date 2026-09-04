/**
 * Iteration 8 — the privacy audit (BR-001, BR-005).
 *
 * VC-057 — every request is a same-origin static-asset fetch, and no request
 *          body carries any part of the editor contents.
 * VC-058 — origin storage holds only `pyplay.program.v1` and the current
 *          `pyplay-assets-v<build>` bucket.
 */
import { expect, test, type Request } from '@playwright/test';
import { BASE_URL } from '../../playwright.config';
import {
  cacheBuckets,
  consoleText,
  editorText,
  openPlayground,
  precacheReport,
  runProgram,
  setProgram,
  submitStdin,
  waitForLinter,
  waitForPythonReady,
  waitForStatus,
} from './helpers';

/**
 * A string that appears nowhere but the editor, so "no request body contains
 * any part of the editor contents" is checkable by search rather than by
 * inspection.
 */
const SENTINEL = 'sentinel_bd41c7f0e2';

const PROGRAM = [
  '# ' + SENTINEL,
  `${SENTINEL} = input("name? ")`,
  `print("hola", ${SENTINEL})`,
  '',
].join('\n');

interface Recorded {
  url: string;
  method: string;
  body: string | null;
  resourceType: string;
}

test('VC-057 (BR-001, BR-005): every request is a same-origin static asset, and no body carries the code', async ({
  page,
}) => {
  const origin = new URL(BASE_URL).origin;
  const recorded: Recorded[] = [];
  const record = (request: Request): void => {
    recorded.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
      resourceType: request.resourceType(),
    });
  };
  page.on('request', record);

  // A full session: load, edit, run with input, format, copy.
  await openPlayground(page);
  await waitForPythonReady(page);
  await waitForLinter(page);

  // spec-06 VC-621: asking for and accepting a completion is entirely local.
  const completionRequests: string[] = [];
  const recordCompletion = (request: Request): void => void completionRequests.push(request.url());
  page.on('request', recordCompletion);
  await setProgram(page, 'pri');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  page.off('request', recordCompletion);
  expect(completionRequests, 'requests triggered by completion').toEqual([]);

  await runProgram(page, PROGRAM);
  await submitStdin(page, 'Ana');
  await expect.poll(() => consoleText(page)).toContain('hola Ana');

  await setProgram(page, `x=1\ny   =    2   # ${SENTINEL}\n`);
  await page.getByRole('button', { name: 'Format' }).click();
  await expect.poll(() => editorText(page)).toContain('x = 1');

  await page.getByRole('button', { name: 'Copy code' }).click();
  await expect(page.locator('#btn-copy')).toHaveText('Copied');

  // Give any late request a chance to be recorded before the audit.
  await page.waitForTimeout(500);
  page.off('request', record);

  expect(recorded.length).toBeGreaterThan(5);

  // BR-001: the page itself talks to nothing but its own origin.
  const foreign = recorded.filter(
    (r) => !r.url.startsWith(`${origin}/`) && !/^(blob|data):/.test(r.url),
  );
  expect(foreign.map((r) => r.url), 'cross-origin requests').toEqual([]);

  // ...and every one of them is a plain static-asset read.
  const notReads = recorded.filter((r) => r.method !== 'GET' && r.method !== 'HEAD');
  expect(
    notReads.map((r) => `${r.method} ${r.url}`),
    'requests that were not reads',
  ).toEqual([]);

  // BR-005: nothing carried a body at all, so nothing carried the program.
  const withBodies = recorded.filter((r) => r.body !== null && r.body !== '');
  expect(withBodies.map((r) => `${r.method} ${r.url}`), 'requests with a body').toEqual([]);
  const leaked = recorded.filter(
    (r) => (r.body ?? '').includes(SENTINEL) || decodeURIComponent(r.url).includes(SENTINEL),
  );
  expect(leaked.map((r) => r.url), 'requests carrying editor contents').toEqual([]);

  // Every recorded URL resolves inside the deployed static build.
  const paths = new Set(recorded.filter((r) => r.url.startsWith(origin)).map((r) => new URL(r.url).pathname));
  for (const path of paths) {
    expect(
      /^\/(?:$|index\.html$|assets\/|pyodide\/|ruff\/|precache-manifest\.json$|sw\.js$|favicon\.ico$|src\/|node_modules\/|@|_headers$)/.test(
        path,
      ),
      `unexpected request path ${path}`,
    ).toBe(true);
  }
});

test.describe('storage surface', () => {
  // The precache bucket only exists when the service worker is allowed to
  // install, which is exactly the state BR-005's storage enumeration is about.
  test.use({ serviceWorkers: 'allow' });

  test('VC-058 (BR-005): origin storage holds only the program key and the current bucket', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForPythonReady(page);
    await waitForLinter(page);
    await waitForStatus(page, 'Offline ready');

    // A full session, so anything that would ever be written has been.
    await runProgram(page, PROGRAM);
    await submitStdin(page, 'Ana');
    await expect.poll(() => consoleText(page)).toContain('hola Ana');
    await page.getByRole('button', { name: 'Format' }).click();
    await page.getByRole('button', { name: 'Clear console' }).click();
    // Let the FR-002 autosave debounce elapse.
    await page.waitForTimeout(800);

    const storage = await page.evaluate(async () => ({
      local: Object.keys(window.localStorage).sort(),
      session: Object.keys(window.sessionStorage).sort(),
      cookies: document.cookie,
      databases: (await indexedDB.databases?.())?.map((db) => db.name ?? '') ?? [],
    }));

    // Data & Interfaces (amended by spec-05 and the workspace feature):
    // workspace key required; theme key optional; never any other
    // localStorage key.
    expect(storage.local).toContain('pyplay.workspace.v1');
    expect(
      storage.local.every((k) => k === 'pyplay.workspace.v1' || k === 'pyplay.theme.v1'),
    ).toBe(true);
    // No cookies, no IndexedDB, no session storage.
    expect(storage.session).toEqual([]);
    expect(storage.cookies).toBe('');
    expect(storage.databases).toEqual([]);

    // Cache Storage: exactly the current build's bucket, no stragglers.
    const report = await precacheReport(page);
    expect(await cacheBuckets(page)).toEqual([`pyplay-assets-v${report.build}`]);
  });
});
