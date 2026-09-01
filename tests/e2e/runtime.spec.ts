import { expect, test } from '@playwright/test';
import { PLAIN_BASE_URL } from '../../playwright.config';
import { consoleText, editorText, statusText, waitForPythonReady } from './helpers';

/** Slow the largest Pyodide asset so the loading window is observable. */
async function slowPyodide(page: import('@playwright/test').Page, delayMs: number): Promise<void> {
  await page.route('**/pyodide/python_stdlib.zip', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  });
}

test('VC-011 (FR-011): the editor accepts typing while the runtime is still loading', async ({
  page,
}) => {
  await slowPyodide(page, 6000);
  await page.goto('/');
  await page.waitForSelector('.cm-content');

  // 2.0 s after navigation start the shell must already be interactive.
  await page.waitForTimeout(2000);
  expect(await statusText(page)).toMatch(/^Loading Python… \d+%$/);
  await expect(page.getByRole('button', { name: 'Run' })).toBeDisabled();

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type('z');
  expect(await editorText(page)).toBe('z');

  // The runtime was genuinely still loading while that happened.
  expect(await statusText(page)).toMatch(/^Loading Python… \d+%$/);
});

test('VC-012 (FR-012): Run is disabled and shows a rising progress value during init', async ({
  page,
}) => {
  await slowPyodide(page, 4000);
  await page.addInitScript(() => {
    const samples: { percent: number; disabled: boolean }[] = [];
    (window as unknown as { __progress: typeof samples }).__progress = samples;
    setInterval(() => {
      const run = document.getElementById('btn-run') as HTMLButtonElement | null;
      const percent = Number(run?.dataset.progress);
      if (run && Number.isFinite(percent)) samples.push({ percent, disabled: run.disabled });
    }, 25);
  });

  await page.goto('/');
  await waitForPythonReady(page);

  const samples = await page.evaluate(
    () => (window as unknown as { __progress: { percent: number; disabled: boolean }[] }).__progress,
  );
  const percents = samples.map((s) => s.percent);

  expect(samples.length).toBeGreaterThan(1);
  expect(samples.every((s) => s.disabled)).toBe(true); // disabled throughout init
  expect(new Set(percents).size).toBeGreaterThan(1); // the value increased at least once
  expect(percents).toEqual([...percents].sort((a, b) => a - b)); // monotonic
});

test('VC-013 (FR-013): ready enables Run and prints exactly one version line', async ({ page }) => {
  await page.goto('/');
  await waitForPythonReady(page);

  await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled();

  const readyLines = (await consoleText(page))
    .split('\n')
    .filter((line) => /^Python 3\.\d+\.\d+ ready$/.test(line));
  expect(readyLines).toHaveLength(1);
});

test('VC-014 (FR-014, BR-009): 404ing the Pyodide assets fails visibly and keeps the editor usable', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.route('**/pyodide/**', (route) =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }),
  );

  await page.goto('/');
  await page.waitForSelector('.cm-content');

  await expect
    .poll(() => consoleText(page), { timeout: 30_000 })
    .toContain('Python runtime failed to load. Check your connection and reload the page.');

  // The underlying error is shown alongside the friendly message.
  const text = await consoleText(page);
  expect(text).toContain('pyodide.js');
  expect(text).not.toContain('ready');

  expect(await statusText(page)).toBe('Python unavailable');
  await expect(page.getByRole('button', { name: 'Run' })).toBeDisabled();

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type('x = 1');
  expect(await editorText(page)).toBe('x = 1');
  expect(pageErrors).toEqual([]);
});

test('VC-015 (FR-015, FR-065, BR-002, BR-009): a non-isolated origin disables Run and explains why', async ({
  page,
}) => {
  await page.goto(PLAIN_BASE_URL);
  await page.waitForSelector('.cm-content');

  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(false);

  const banner = page.locator('#coi-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveText(
    'This page must be served with cross-origin isolation enabled (see Deployment). Python cannot run here.',
  );

  expect(await statusText(page)).toBe('Python unavailable');
  await expect(page.getByRole('button', { name: 'Run' })).toBeDisabled();

  // The banner is not modal and does not overlay the editor.
  const overlaps = await page.evaluate(() => {
    const b = document.getElementById('coi-banner')!.getBoundingClientRect();
    const e = document.getElementById('editor')!.getBoundingClientRect();
    return !(b.bottom <= e.top || b.top >= e.bottom || b.right <= e.left || b.left >= e.right);
  });
  expect(overlaps).toBe(false);

  const topmostOverEditor = await page.evaluate(() => {
    const e = document.getElementById('editor')!.getBoundingClientRect();
    const el = document.elementFromPoint(e.left + e.width / 2, e.top + e.height / 2);
    return document.getElementById('editor')!.contains(el);
  });
  expect(topmostOverEditor).toBe(true);

  // Editing and copying keep working (Format lands in Iteration 6).
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type('print("hi")');
  expect(await editorText(page)).toBe('print("hi")');

  await page.getByRole('button', { name: 'Copy code' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
});
