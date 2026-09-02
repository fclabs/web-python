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
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test, type Request } from '@playwright/test';
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

/* -------------------------------------------------------------------------
   spec-03 — VC-323 (NFR-304, NFR-305) and VC-326 (BR-304, NFR-305)
   ------------------------------------------------------------------------- */

/** The build this feature is measured against (NFR-305, VC-326). */
interface BaselineBuild {
  commit: string;
  files: string[];
  manifestUrls: string[];
  manifestUrlCount: number;
  cacheNameScheme: string;
  vendored: Record<string, string>;
  gzippedApp: number;
  gzippedVendored: number;
  gzippedBy: string;
}

const baseline = JSON.parse(
  readFileSync(join(repoRoot, 'tests', 'e2e', 'baseline-build.json'), 'utf8'),
) as BaselineBuild;

/** NFR-305: at most 4 KB gzipped on top of the baseline's app payload. */
const SIZE_BUDGET_BYTES = 4 * 1024;

/**
 * NFR-305 is measured over the app's own output only — `index.html`, the JS and
 * CSS chunks, the worker chunk, `sw.js`, `precache-manifest.json` — and not
 * over the vendored Pyodide and Ruff blobs.
 *
 * Those blobs are 9 MB of the 9.2 MB cold load, so including them would drown
 * a 4 KB budget in compressor noise: `gzipSync` is only as reproducible as the
 * zlib Node was linked against, and Node 26 ships stock zlib 1.2.12 on macOS
 * but zlib-ng on linux-x64, which compress the vendored bytes 152 KB apart.
 * Nothing about the app changed between those two numbers — so the vendored
 * bytes are held to byte-identity by digest in VC-326 below, which is a
 * stricter check than any size delta, and left out of this one.
 */
const isVendored = (url: string): boolean =>
  url.startsWith('/pyodide/') || url.startsWith('/ruff/');

/**
 * VC-326 allows exactly two filenames to change — Vite content-hashes the main
 * JS chunk and the main CSS file, so asserting byte-identity of the manifest
 * would be unsatisfiable by construction.
 */
const unhash = (url: string): string =>
  url.replace(/^\/assets\/index-[A-Za-z0-9_-]+\.(js|css)$/, '/assets/index-HASH.$1');

function distFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(dist, dir))) {
    const rel = `${dir}/${entry}`.replace(/^\//, '');
    if (statSync(join(dist, rel)).isDirectory()) out.push(...distFiles(rel, prefix));
    else out.push(`/${rel}`);
  }
  return out.sort();
}

test('VC-323 (NFR-304, NFR-305): the pane is painted and copies within 100 ms, and costs <= 4 KB', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  // NFR-304 asks what the pane *introduces*. Measuring while Pyodide and Ruff
  // are still loading would attribute their long tasks to it, so the page is
  // brought fully to rest first.
  await waitForPythonReady(page);
  await waitForLinter(page);

  // --- NFR-304: two latencies, measured to the frame that paints ---------
  /** Requests attributable to a pane interaction (NFR-305: there are none). */
  const requests: string[] = [];
  const record = (request: Request): void => void requests.push(request.url());
  page.on('request', record);

  // Long tasks from here on — that is, the ones the two interactions below
  // are responsible for (NFR-009, NFR-304).
  await page.evaluate(() => {
    const box = window as unknown as { __longTasks: number[] };
    box.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) box.__longTasks.push(entry.duration);
    }).observe({ entryTypes: ['longtask'] });
  });
  // Anything still queued from the load belongs to the load, not to the pane.
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    (window as unknown as { __longTasks: number[] }).__longTasks.length = 0;
  });

  const openMs = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const pane = document.getElementById('symbol-pane')!;
        const observer = new MutationObserver(() => {
          if (pane.hidden) return;
          observer.disconnect();
          requestAnimationFrame(() => resolve(performance.now() - start));
        });
        observer.observe(pane, { attributes: true, attributeFilter: ['hidden'] });
        setTimeout(() => reject(new Error('the pane never opened')), 5_000);
        const start = performance.now();
        (document.getElementById('btn-symbols') as HTMLButtonElement).click();
      }),
  );

  const copyMs = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const status = document.getElementById('symbol-status')!;
        const observer = new MutationObserver(() => {
          if (status.textContent !== 'Copied #') return;
          observer.disconnect();
          requestAnimationFrame(() => resolve(performance.now() - start));
        });
        observer.observe(status, { childList: true, subtree: true, characterData: true });
        setTimeout(() => reject(new Error('no copy feedback within 5 s')), 5_000);
        const start = performance.now();
        document
          .querySelector<HTMLButtonElement>('#symbol-pane .symbol[data-value="#"]')!
          .click();
      }),
  );

  await page.waitForTimeout(500);
  page.off('request', record);
  const longTasks = await page.evaluate(
    () => (window as unknown as { __longTasks: number[] }).__longTasks,
  );

  expect(openMs, 'NFR-304 Symbols to the pane being painted').toBeLessThanOrEqual(100);
  expect(copyMs, 'NFR-304 activation to `Copied #` being painted').toBeLessThanOrEqual(100);
  expect(Math.max(0, ...longTasks), 'NFR-304 longest main-thread task').toBeLessThanOrEqual(100);
  expect(requests, 'NFR-305 requests attributable to the pane').toEqual([]);

  // --- NFR-305: the compressed size delta against the pinned baseline ----
  const manifest = JSON.parse(readFileSync(join(dist, 'precache-manifest.json'), 'utf8')) as {
    urls: string[];
  };
  let gzippedApp = 0;
  for (const url of [...manifest.urls, '/index.html']) {
    if (url === '/') continue; // the shell is counted once, as /index.html
    if (isVendored(url)) continue; // pinned by digest in VC-326 instead
    gzippedApp += gzipSync(readFileSync(join(dist, url.replace(/^\//, ''))), { level: 9 }).length;
  }

  const delta = gzippedApp - baseline.gzippedApp;
  expect(
    delta,
    `NFR-305 app size delta vs ${baseline.commit}: ${delta} B gzipped ` +
      `(budget ${SIZE_BUDGET_BYTES} B; baseline gzipped by ${baseline.gzippedBy}, ` +
      `here by ${process.platform}-${process.arch} zlib ${process.versions.zlib})`,
  ).toBeLessThanOrEqual(SIZE_BUDGET_BYTES);

  console.log(
    [
      'VC-323 measurements:',
      `  NFR-304 Symbols -> pane painted   ${openMs.toFixed(0)} ms   (<= 100)`,
      `  NFR-304 click -> "Copied #"       ${copyMs.toFixed(0)} ms   (<= 100)`,
      `  NFR-304 longest task              ${Math.max(0, ...longTasks).toFixed(0)} ms   (<= 100)`,
      `  NFR-305 app size delta vs ${baseline.commit} ${(delta / 1024).toFixed(2)} KiB (<= 4.00)`,
    ].join('\n'),
  );
});

test('VC-326 (BR-304, NFR-305): the build shape is the baseline’s, bar two content hashes', async () => {
  // The emitted file *set* is unchanged: no added asset, no removed asset.
  expect(distFiles('').map(unhash).sort()).toEqual([...baseline.files].sort());

  // Every Pyodide and Ruff asset is byte-identical.
  for (const [path, expected] of Object.entries(baseline.vendored)) {
    const actual = createHash('sha256')
      .update(readFileSync(join(dist, path.slice(1))))
      .digest('hex');
    expect(actual, `${path} is byte-identical to ${baseline.commit}`).toBe(expected);
  }

  // The precache manifest differs only in those two hashed names, with the
  // same URL count.
  const manifest = JSON.parse(readFileSync(join(dist, 'precache-manifest.json'), 'utf8')) as {
    build: string;
    urls: string[];
  };
  // Compared as a set: the manifest is ordered by the real hashed filenames,
  // so `index-<hash>.css` and `index-<hash>.js` swap places from build to
  // build. That is the content hash VC-326 already exempts, not a change of
  // contents — the count is asserted separately.
  expect(manifest.urls.map(unhash).sort()).toEqual([...baseline.manifestUrls].sort());
  expect(manifest.urls).toHaveLength(baseline.manifestUrlCount);

  // ...and so does the generated worker, which also keeps the cache-name
  // scheme spec-01 pinned.
  const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
  const embedded = JSON.parse(sw.match(/const MANIFEST = (\[.*?\]);/s)![1]!) as string[];
  expect(embedded.map(unhash).sort()).toEqual([...baseline.manifestUrls].sort());
  expect(embedded).toHaveLength(baseline.manifestUrlCount);
  expect(sw).toContain('const CACHE = `pyplay-assets-v${BUILD}`;');
  expect(baseline.cacheNameScheme).toBe('pyplay-assets-v${BUILD}');
  expect(sw).toContain(`const BUILD = "${manifest.build}";`);
});
