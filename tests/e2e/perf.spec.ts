/**
 * Iteration 8 — the performance pass (VC-053).
 *
 * NFR-001 shell interactive, NFR-002 cold runtime ready, NFR-003 warm runtime
 * ready, NFR-004 compressed transfer budget, NFR-005 Run-to-first-output,
 * NFR-007 lint round trip, NFR-008 format round trip.
 *
 * The spec's reference profile is a 2020-or-later laptop on a 10 Mbit/40 ms
 * link. This suite runs on the developer's own machine against `vite preview`
 * on loopback, which is at least as fast as that link, so every threshold here
 * is a *necessary* condition: a failure is a real regression, a pass is a pass
 * on a link no slower than loopback. NFR-004 removes the network from the
 * equation entirely by measuring the bytes themselves.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import {
  editorText,
  openPlayground,
  setProgram,
  waitForLinter,
  waitForPythonReady,
} from './helpers';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(repoRoot, 'dist');

/** NFR-004: 15 MB, measured over compressed transfer sizes. */
const TRANSFER_BUDGET_BYTES = 15 * 1024 * 1024;

/** A 500-line Python file, deliberately unformatted so Format has work to do. */
const FIVE_HUNDRED_LINES = (() => {
  const lines: string[] = [];
  for (let i = 0; i < 499; i++) lines.push(`v${i}   =   ${i}  +  1`);
  lines.push('print(undefined_name)');
  return `${lines.join('\n')}\n`;
})();

test('VC-053 (NFR-001 – NFR-005, NFR-007, NFR-008): the reference-profile thresholds', async ({
  page,
}) => {
  test.setTimeout(180_000);

  // Record when the shell became interactive (FR-011), from the page's own
  // clock, whose origin is navigation start.
  await page.addInitScript(() => {
    const box = window as unknown as { __shellReadyAt?: number };
    // Polled rather than rAF-driven: an init script runs before the document
    // starts rendering, and a `requestAnimationFrame` scheduled there is never
    // called back in Chromium.
    const timer = setInterval(() => {
      if (!document.documentElement?.dataset.shellReady) return;
      box.__shellReadyAt ??= performance.now();
      clearInterval(timer);
    }, 4);
  });

  // --- NFR-001 / NFR-002: cold load, empty cache -------------------------
  await openPlayground(page);
  const shellReadyMs = await page.waitForFunction(
    () => (window as unknown as { __shellReadyAt?: number }).__shellReadyAt,
    undefined,
    { timeout: 30_000 },
  );
  const shellMs = (await shellReadyMs.jsonValue()) as number;

  await waitForPythonReady(page);
  const coldReadyMs = await page.evaluate(() => performance.now());

  expect(shellMs, 'NFR-001 shell interactive').toBeLessThanOrEqual(2_000);
  expect(coldReadyMs, 'NFR-002 cold runtime ready').toBeLessThanOrEqual(10_000);

  // --- NFR-003: repeat visit, warm HTTP cache ----------------------------
  await page.reload();
  await waitForPythonReady(page);
  const warmReadyMs = await page.evaluate(() => performance.now());
  expect(warmReadyMs, 'NFR-003 warm runtime ready').toBeLessThanOrEqual(2_500);

  // --- NFR-005: Run to the first byte of output being painted ------------
  await page.getByRole('button', { name: 'Clear console' }).click();
  await setProgram(page, 'print("x")\n');
  const firstOutputMs = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const consoleEl = document.getElementById('console')!;
        const observer = new MutationObserver(() => {
          const painted = consoleEl.querySelector('.console-stdout');
          if (!painted?.textContent?.includes('x')) return;
          observer.disconnect();
          // "painted", not merely "in the DOM".
          requestAnimationFrame(() => resolve(performance.now() - start));
        });
        observer.observe(consoleEl, { childList: true, subtree: true, characterData: true });
        setTimeout(() => reject(new Error('no output within 10 s')), 10_000);
        const start = performance.now();
        (document.getElementById('btn-run') as HTMLButtonElement).click();
      }),
  );
  expect(firstOutputMs, 'NFR-005 Run to first painted output').toBeLessThanOrEqual(250);

  // --- NFR-007: lint round trip on a 500-line file -----------------------
  await waitForLinter(page);
  const lintMs = await page.evaluate(
    (code) =>
      new Promise<number>((resolve, reject) => {
        const list = document.getElementById('diagnostics-list')!;
        const count = document.getElementById('diagnostics-count')!;
        const observer = new MutationObserver(() => {
          if (count.textContent !== '1') return;
          observer.disconnect();
          requestAnimationFrame(() =>
            // FR-035's 400 ms idle window is the trigger, not the work.
            resolve(performance.now() - start - 400),
          );
        });
        observer.observe(list, { childList: true, subtree: true });
        observer.observe(count, { childList: true, subtree: true, characterData: true });
        setTimeout(() => reject(new Error('no diagnostics within 15 s')), 15_000);

        const content = document.querySelector('.cm-content') as HTMLElement & {
          cmView?: { view: { state: { doc: { length: number } }; dispatch(spec: unknown): void } };
          cmTile?: { view: { state: { doc: { length: number } }; dispatch(spec: unknown): void } };
        };
        const view = content.cmTile?.view ?? content.cmView?.view;
        if (!view) throw new Error('CodeMirror view not found');
        const start = performance.now();
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
      }),
    FIVE_HUNDRED_LINES,
  );
  expect(lintMs, 'NFR-007 lint round trip (500 lines)').toBeLessThanOrEqual(300);

  // --- NFR-008: format round trip on the same file -----------------------
  const formatMs = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const content = document.querySelector('.cm-content')!;
        const observer = new MutationObserver(() => {
          if (!content.textContent?.includes('v0 = 0 + 1')) return;
          observer.disconnect();
          requestAnimationFrame(() => resolve(performance.now() - start));
        });
        observer.observe(content, { childList: true, subtree: true, characterData: true });
        setTimeout(() => reject(new Error('no reformat within 15 s')), 15_000);
        const start = performance.now();
        (document.getElementById('btn-format') as HTMLButtonElement).click();
      }),
  );
  expect(formatMs, 'NFR-008 format round trip (500 lines)').toBeLessThanOrEqual(300);
  expect(await editorText(page)).toContain('v0 = 0 + 1');

  // --- NFR-004: the compressed transfer budget ---------------------------
  // Measured over the build itself rather than over the wire, so the number is
  // the deployment's, not the dev server's: every URL the Run loop needs
  // (Deployment → "Offline precache manifest"), gzip-compressed as A-03
  // requires the host to serve it.
  const manifest = JSON.parse(readFileSync(join(dist, 'precache-manifest.json'), 'utf8')) as {
    build: string;
    urls: string[];
  };
  let compressed = 0;
  const breakdown: string[] = [];
  for (const url of [...manifest.urls, '/index.html']) {
    const file = join(dist, url === '/' ? 'index.html' : url.replace(/^\//, ''));
    if (url === '/') continue; // the shell is counted once, as /index.html
    statSync(file); // fails loudly if a manifest URL is not in the build
    const size = gzipSync(readFileSync(file), { level: 9 }).length;
    compressed += size;
    breakdown.push(`${url}: ${(size / 1024).toFixed(0)} KiB`);
  }
  expect(
    compressed,
    `NFR-004 compressed transfer (${(compressed / 1024 / 1024).toFixed(2)} MiB)\n  ${breakdown.join('\n  ')}`,
  ).toBeLessThanOrEqual(TRANSFER_BUDGET_BYTES);

  console.log(
    [
      `VC-053 measurements:`,
      `  NFR-001 shell interactive       ${shellMs.toFixed(0)} ms   (<= 2000)`,
      `  NFR-002 cold runtime ready      ${coldReadyMs.toFixed(0)} ms   (<= 10000)`,
      `  NFR-003 warm runtime ready      ${warmReadyMs.toFixed(0)} ms   (<= 2500)`,
      `  NFR-004 compressed transfer     ${(compressed / 1024 / 1024).toFixed(2)} MiB (<= 15.00)`,
      `  NFR-005 Run to first output     ${firstOutputMs.toFixed(0)} ms   (<= 250)`,
      `  NFR-007 lint 500 lines          ${lintMs.toFixed(0)} ms   (<= 300)`,
      `  NFR-008 format 500 lines        ${formatMs.toFixed(0)} ms   (<= 300)`,
    ].join('\n'),
  );
});
