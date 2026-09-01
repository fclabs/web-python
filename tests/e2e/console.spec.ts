import { expect, test, type Page } from '@playwright/test';
import {
  consoleText,
  editorText,
  runProgram,
  setProgram,
  waitForPythonReady,
} from './helpers';

const TERMINATION = /Program (finished in \d+\.\d{2} s|exited with an error\.)/g;

/** FR-027 */
const EARLIER_TRUNCATED = '… earlier output truncated …';
const MAX_RETAINED_LINES = 5000;
/** FR-056 */
const MAX_WRITE_CHARS = 100_000;

/** Load the playground and wait until Python is ready to run (FR-013). */
async function openReady(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.cm-content');
  await waitForPythonReady(page);
}

/** Wait until `expected` runs have reported termination. */
async function waitForTermination(page: Page, expected = 1, timeout = 60_000): Promise<void> {
  await expect
    .poll(async () => (await consoleText(page)).match(TERMINATION)?.length ?? 0, { timeout })
    .toBe(expected);
}

/** The console's scroll geometry, as the visitor experiences it. */
async function scrollState(
  page: Page,
): Promise<{ top: number; height: number; client: number; fromBottom: number }> {
  return page.evaluate(() => {
    const el = document.getElementById('console') as HTMLElement;
    return {
      top: el.scrollTop,
      height: el.scrollHeight,
      client: el.clientHeight,
      fromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
    };
  });
}

test('VC-027 (FR-026): Clear console empties the console and leaves the editor alone', async ({
  page,
}) => {
  await openReady(page);

  await runProgram(page, 'print("some output")\n');
  await waitForTermination(page);
  expect(await consoleText(page)).toContain('some output');

  // The editor holds a program that must survive the clear untouched.
  await setProgram(page, 'y = 1');
  expect(await editorText(page)).toBe('y = 1');

  await page.getByRole('button', { name: 'Clear console' }).click();

  expect(await consoleText(page)).toBe('');
  expect(await page.evaluate(() => document.getElementById('console')?.children.length)).toBe(0);
  expect(await editorText(page)).toBe('y = 1');

  // ...and the cleared console still works for the next run.
  await page.getByRole('button', { name: 'Run' }).click();
  await waitForTermination(page);
  expect(await consoleText(page)).toMatch(/Program finished in \d+\.\d{2} s/);
});

test('VC-028 (FR-027): a 20 000-line run is capped at the most recent 5 000 lines', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openReady(page);

  await runProgram(page, 'for i in range(20000): print(i)\n');
  await waitForTermination(page, 1);

  const shown = await page.evaluate(() => {
    const text = document.getElementById('console')?.textContent ?? '';
    const body = text.endsWith('\n') ? text.slice(0, -1) : text;
    return body.split('\n');
  });

  // FR-027: the marker heads the retained region.
  expect(shown[0]).toBe(EARLIER_TRUNCATED);
  // The retained region itself is capped, the marker aside.
  expect(shown.length - 1).toBeLessThanOrEqual(MAX_RETAINED_LINES);
  expect(shown.length - 1).toBeGreaterThan(MAX_RETAINED_LINES - 20);

  // The *most recent* lines are what survived: the run's last number is there,
  // its termination notice is there, and its early output is gone.
  expect(shown).toContain('19999');
  expect(shown[shown.length - 1]).toMatch(/Program finished in \d+\.\d{2} s/);
  expect(shown).not.toContain('0');
  expect(shown).not.toContain('1');

  // Only one marker, at the top — not one per drop.
  expect(shown.filter((line) => line === EARLIER_TRUNCATED)).toHaveLength(1);
});

test('VC-066 (FR-056): one 5 000 000-character write is capped at 100 000 characters', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openReady(page);

  // Baseline before the run, measured the same way as after it.
  const before = await measureMemory(page);

  await runProgram(page, 'print("x" * 5_000_000)\n');
  await waitForTermination(page, 1);

  const line = await page.evaluate(() => {
    const text = document.getElementById('console')?.textContent ?? '';
    return text.split('\n').find((candidate) => candidate.startsWith('x')) ?? '';
  });

  // FR-056: the first 100 000 characters, then the marker naming the loss.
  expect(line).toBe(`${'x'.repeat(MAX_WRITE_CHARS)}… line truncated (4900000 characters dropped) …`);

  // The run completed normally despite the write.
  expect(await consoleText(page)).toMatch(/Program finished in \d+\.\d{2} s/);
  expect(await consoleText(page)).not.toContain('Program exited with an error.');

  const after = await measureMemory(page);
  if (before === null || after === null) {
    // Neither measurement API is usable here; the memory half of VC-066 has to
    // be taken on the character cap above rather than asserted.
    test.info().annotations.push({
      type: 'unmeasured',
      description: 'no memory measurement API available in this browser',
    });
    return;
  }
  expect(after - before).toBeLessThan(50 * 1024 * 1024);
});

/**
 * Tab memory in bytes: `performance.measureUserAgentSpecificMemory()` when the
 * browser offers it (it needs cross-origin isolation, which this page has),
 * else Chromium's `performance.memory`, else null.
 */
async function measureMemory(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const perf = performance as Performance & {
      measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
      memory?: { usedJSHeapSize: number };
    };
    if (typeof perf.measureUserAgentSpecificMemory === 'function') {
      try {
        return (await perf.measureUserAgentSpecificMemory()).bytes;
      } catch {
        /* fall through to the heap-size fallback */
      }
    }
    return perf.memory?.usedJSHeapSize ?? null;
  });
}

test('VC-029 (FR-028): the console follows output only while it is at the bottom', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openReady(page);

  // A steady printer, slow enough to interact with mid-run and short enough
  // that the retention cap of FR-027 never enters into it.
  await runProgram(page, 'import time\nfor i in range(3000):\n    print(i)\n    time.sleep(0.002)\n');

  // While pinned, the console tracks the bottom as output arrives.
  const client = (await scrollState(page)).client;
  await expect
    .poll(async () => (await scrollState(page)).height, { timeout: 15_000 })
    .toBeGreaterThan(client * 3);
  expect((await scrollState(page)).fromBottom).toBeLessThanOrEqual(2);

  // The visitor scrolls up: the viewport must now stay exactly where it is.
  const parked = await page.evaluate(() => {
    const el = document.getElementById('console') as HTMLElement;
    el.scrollTop = Math.floor(el.scrollHeight / 3);
    return el.scrollTop;
  });
  const before = await scrollState(page);

  await page.waitForTimeout(1500);
  const during = await scrollState(page);

  // New output arrived...
  expect(during.height).toBeGreaterThan(before.height);
  // ...and did not move the viewport (FR-028).
  expect(during.top).toBe(parked);
  expect(during.fromBottom).toBeGreaterThan(before.fromBottom);

  // Back to the bottom: the console re-pins and follows again.
  await page.evaluate(() => {
    const el = document.getElementById('console') as HTMLElement;
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(1500);
  const repinned = await scrollState(page);
  expect(repinned.height).toBeGreaterThan(during.height);
  expect(repinned.fromBottom).toBeLessThanOrEqual(2);
  expect(repinned.top).toBeGreaterThan(during.top);

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled({ timeout: 5_000 });
});

test('VC-054 (NFR-009): continuous output never blocks the main thread, and Stop still lands in 500 ms', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openReady(page);

  // Long tasks are the browser's own measure of a blocked main thread.
  const observing = await page.evaluate(() => {
    const store = window as unknown as { __longTasks?: number[] };
    store.__longTasks = [];
    if (typeof PerformanceObserver !== 'function') return false;
    if (!(PerformanceObserver.supportedEntryTypes ?? []).includes('longtask')) return false;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) store.__longTasks?.push(entry.duration);
    }).observe({ entryTypes: ['longtask'] });
    return true;
  });
  expect(observing, 'longtask observation is required to verify NFR-009').toBe(true);

  await runProgram(page, 'while True: print("x")\n');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();

  // Five seconds of output as fast as CPython can produce it.
  await page.waitForTimeout(5000);

  // The page is still responsive to a real interaction throughout.
  const copy = page.locator('#btn-copy');
  await copy.click();
  await expect(copy).toHaveText('Copied');

  const startedAt = Date.now();
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.waitForFunction(
    () => (document.getElementById('console')?.textContent ?? '').includes('Program stopped.'),
    undefined,
    { timeout: 5_000 },
  );
  // NFR-006 still holds under the load.
  expect(Date.now() - startedAt).toBeLessThan(500);

  const tasks = await page.evaluate(
    () => (window as unknown as { __longTasks?: number[] }).__longTasks ?? [],
  );
  const worst = tasks.reduce((max, duration) => Math.max(max, duration), 0);
  // NFR-009: no main-thread task longer than 100 ms.
  expect(worst, `long tasks: ${JSON.stringify(tasks)}`).toBeLessThan(100);
});
