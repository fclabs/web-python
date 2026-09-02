/**
 * spec-04 — the horizontal / vertical pane layout.
 *
 * Iteration 2's criteria: the two renderings and the resolution rule. The
 * toolbar control that drives them arrives in iteration 3, so these tests
 * reach the layout the way the shipped code does — through the stored
 * preference and the viewport width — never by writing `data-layout` by hand
 * except where a criterion explicitly renders a given attribute value.
 *
 * VC-408 (FR-407) — the vertical layout is the baseline build, +/-1 px.
 * VC-409 (FR-408, BR-407) — editor column inline-start of the other three.
 * VC-410 (FR-409) — 58 % split, 320 px floors, no h-scroll, 40 % cap.
 * VC-411 (FR-410, BR-402) — identical document order; no `childList` churn.
 * VC-412 (FR-411, FR-412, BR-405) — the 900 px crossing re-resolves.
 * VC-413 (FR-413, BR-404, BR-405) — the narrow override never overwrites.
 * VC-416 (FR-416) — resolved in the first painted frame.
 * VC-417 (FR-417) — malformed stored values are absent, and left in place.
 * VC-418 (FR-417) — a throwing store still boots and still runs Python.
 * VC-435 (FR-409) — short viewports keep the console's 80 px floor.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openPlayground, runProgram, waitForLinter, waitForPythonReady } from './helpers';

const LAYOUT_KEY = 'pyplay.layout.v1';

/** FR-411 / BR-404's breakpoint, and `LAYOUT_MIN_WIDTH` in `src/layout.ts`. */
const LAYOUT_MIN_WIDTH = 900;

const WIDE = { width: 1280, height: 800 };
const NARROW = { width: 375, height: 667 };

type Layout = 'vertical' | 'horizontal';
type Box = { top: number; right: number; bottom: number; left: number };

interface BaselineGeometry {
  commit: string;
  viewports: Record<
    string,
    { boxes: Record<string, Box>; diagnosticsMaxHeight: string; appContentWidth: number }
  >;
}

/**
 * VC-408's reference measurements, recorded from a build of commit `384cb70`
 * by `scripts/record-baseline-geometry.mjs` — see that file's header for the
 * exact procedure. Regenerate it only when the spec pins a new baseline.
 */
const BASELINE = JSON.parse(
  readFileSync(fileURLToPath(new URL('./baseline-geometry.json', import.meta.url)), 'utf8'),
) as BaselineGeometry;

/** Seed the preference before any script of the page runs (FR-416, FR-417). */
async function seedPreference(page: Page, value: string | null): Promise<void> {
  await page.addInitScript((seed) => {
    try {
      if (seed === null) window.localStorage.removeItem('pyplay.layout.v1');
      else window.localStorage.setItem('pyplay.layout.v1', seed);
    } catch {
      /* Storage denial is VC-418's subject, not this helper's. */
    }
  }, value);
}

/** The value under `pyplay.layout.v1`, byte for byte, or null. */
async function storedLayout(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), LAYOUT_KEY);
}

/** `#app`'s current `data-layout`. */
async function renderedLayout(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.getElementById('app')?.dataset.layout);
}

/** Wait for `data-layout` to reach `layout`. Correctness only — see below. */
async function expectLayoutWithin(page: Page, layout: Layout, timeout = 5_000): Promise<void> {
  await page.waitForFunction(
    (want) => document.getElementById('app')?.dataset.layout === want,
    layout,
    { timeout },
  );
}

/**
 * Record, inside the page, how long each `data-layout` change took to land
 * after the viewport crossing that caused it.
 *
 * FR-412's 100 ms is a property of the page: the resolver runs synchronously
 * in the `matchMedia` `change` handler, with no debounce. Polling for it from
 * the test process measures something else — Playwright's CDP round trip and
 * whatever else the machine is running — which under `fullyParallel` is
 * enough to blow a 100 ms budget the page itself met in under a millisecond.
 * So the clock lives in the page: `resize` and the `matchMedia` `change` are
 * dispatched from the same layout update, making the `resize` timestamp the
 * moment of the crossing, and the `MutationObserver` timestamp the moment the
 * attribute changed.
 */
async function recordCrossingLatency(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = { lastResize: performance.now(), latencies: [] as number[] };
    (window as unknown as { __layoutLatency: typeof state }).__layoutLatency = state;
    window.addEventListener('resize', () => {
      state.lastResize = performance.now();
    });
    new MutationObserver(() => {
      state.latencies.push(performance.now() - state.lastResize);
    }).observe(document.getElementById('app')!, {
      attributes: true,
      attributeFilter: ['data-layout'],
    });
  });
}

/** The recorded crossing latencies, in milliseconds (see above). */
async function crossingLatencies(page: Page): Promise<number[]> {
  return page.evaluate(
    () => (window as unknown as { __layoutLatency: { latencies: number[] } }).__layoutLatency.latencies,
  );
}

/** The four panels' boxes plus the diagnostics cap and app content width. */
async function measurePanels(page: Page): Promise<{
  boxes: Record<string, Box>;
  diagnosticsMaxHeight: string;
  appContentWidth: number;
}> {
  return page.evaluate(() => {
    const round = (n: number): number => Math.round(n * 100) / 100;
    const boxes: Record<string, Box> = {};
    for (const name of ['console', 'editor', 'stdin', 'diagnostics']) {
      const el = document.querySelector(`.panel--${name}`);
      if (!el) throw new Error(`missing .panel--${name}`);
      const box = el.getBoundingClientRect();
      boxes[name] = {
        top: round(box.top),
        right: round(box.right),
        bottom: round(box.bottom),
        left: round(box.left),
      };
    }
    const app = document.getElementById('app') as HTMLElement;
    const style = getComputedStyle(app);
    return {
      boxes,
      diagnosticsMaxHeight: getComputedStyle(
        document.querySelector('.panel--diagnostics') as Element,
      ).maxHeight,
      // The grid's `58%` resolves against the content box, so that — not
      // `clientWidth` — is the "app content width" VC-409 and VC-410 mean.
      appContentWidth: round(
        app.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      ),
    };
  });
}

/* -------------------------------------------------------------------------
   VC-408 (FR-407): the vertical layout is the shipped one, to the pixel.
   ------------------------------------------------------------------------- */

for (const viewport of [WIDE, NARROW]) {
  const key = `${viewport.width}x${viewport.height}`;

  test(`VC-408 (FR-407): the vertical layout matches the ${BASELINE.commit} build at ${key}`, async ({
    page,
  }) => {
    test.skip(BASELINE.viewports[key] === undefined, `no baseline recorded for ${key}`);
    const reference = BASELINE.viewports[key]!;

    await page.setViewportSize(viewport);
    // The preference is how the shipped resolver is asked for vertical at a
    // width where an unset preference would resolve to horizontal (FR-411).
    await seedPreference(page, 'vertical');
    await openPlayground(page);
    await waitForPythonReady(page);
    await waitForLinter(page);
    expect(await renderedLayout(page)).toBe('vertical');

    const actual = await measurePanels(page);

    for (const [panel, expected] of Object.entries(reference.boxes)) {
      for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
        expect(
          actual.boxes[panel]![edge],
          `${panel}.${edge} at ${key} vs ${BASELINE.commit}`,
        ).toBeCloseTo(expected[edge], 0);
      }
    }

    // The diagnostics cap is still `25vh` — the same resolved value the
    // baseline reported at this height, and 25 % of that height.
    expect(actual.diagnosticsMaxHeight).toBe(reference.diagnosticsMaxHeight);
    expect(parseFloat(actual.diagnosticsMaxHeight)).toBeCloseTo(viewport.height * 0.25, 1);
  });
}

/* -------------------------------------------------------------------------
   VC-409 (FR-408, BR-407) and VC-410 (FR-409): the horizontal geometry.
   ------------------------------------------------------------------------- */

test.describe('the horizontal layout', () => {
  test.use({ viewport: WIDE });

  test('VC-409 (FR-408, BR-407): the editor column sits inline-start of the other three', async ({
    page,
  }) => {
    await seedPreference(page, 'horizontal');
    await openPlayground(page);
    await waitForPythonReady(page);
    await waitForLinter(page);
    expect(await renderedLayout(page)).toBe('horizontal');

    const { boxes, appContentWidth } = await measurePanels(page);
    const { editor, console: consolePanel, stdin, diagnostics } = boxes as Record<string, Box>;
    const right = [consolePanel!, stdin!, diagnostics!];

    // The editor's box is entirely to the inline-start side of all three.
    for (const box of right) {
      expect(editor!.right, 'the editor ends before the right column starts').toBeLessThanOrEqual(
        box.left,
      );
    }

    // Those three share an inline-start edge, in console/stdin/diagnostics
    // block order.
    expect(stdin!.left).toBeCloseTo(consolePanel!.left, 0);
    expect(diagnostics!.left).toBeCloseTo(consolePanel!.left, 0);
    expect(consolePanel!.bottom).toBeLessThanOrEqual(stdin!.top);
    expect(stdin!.bottom).toBeLessThanOrEqual(diagnostics!.top);

    // The editor spans the whole split: its block size equals the three
    // panels' span, gaps included.
    expect(editor!.top).toBeCloseTo(consolePanel!.top, 0);
    expect(editor!.bottom).toBeCloseTo(diagnostics!.bottom, 0);
    expect(editor!.bottom - editor!.top).toBeCloseTo(diagnostics!.bottom - consolePanel!.top, 0);

    // The four header rows each span the full app content width. Two of them
    // are not rendered at all on a healthy load: FR-015 keeps `#coi-banner`
    // `hidden`, and `.notices:empty` is `display: none`. A box-less element
    // cannot be measured, and FR-408 only constrains these rows when they are
    // rendered — so each is given the state that renders it, measured, and
    // restored. Populating the strip through `Notices` rather than by hand
    // would fire the real code path but also leave a notice on screen for the
    // rest of the test; the placeholder text is never asserted on.
    const rows = await page.evaluate(() => {
      const app = document.getElementById('app') as HTMLElement;
      const style = getComputedStyle(app);
      const contentLeft = app.getBoundingClientRect().left + parseFloat(style.paddingLeft);
      const contentRight = app.getBoundingClientRect().right - parseFloat(style.paddingRight);

      const banner = document.getElementById('coi-banner') as HTMLElement;
      const notices = document.getElementById('notices') as HTMLElement;
      const wasHidden = banner.hidden;
      banner.hidden = false;
      notices.append(document.createElement('p'));

      const measured = ['.toolbar', '#coi-banner', '.status-bar', '#notices'].map((selector) => {
        const box = (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
        return { selector, left: box.left, right: box.right, contentLeft, contentRight };
      });

      banner.hidden = wasHidden;
      notices.replaceChildren();
      return measured;
    });
    for (const row of rows) {
      expect(row.left, `${row.selector} starts at the content edge`).toBeCloseTo(row.contentLeft, 0);
      expect(row.right, `${row.selector} ends at the content edge`).toBeCloseTo(row.contentRight, 0);
    }

    // BR-407: with the console holding no tab stop, the split's reading order
    // is left column then right column — asserted in full by VC-431.
    expect(appContentWidth).toBeGreaterThan(0);
  });

  for (const width of [1280, 1024, LAYOUT_MIN_WIDTH]) {
    test(`VC-410 (FR-409): the split is 58 % with both columns >= 320 px at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await seedPreference(page, 'horizontal');
      await openPlayground(page);
      await waitForPythonReady(page);
      await waitForLinter(page);
      expect(await renderedLayout(page)).toBe('horizontal');

      const { boxes, appContentWidth } = await measurePanels(page);
      const editor = boxes['editor']!;
      const consolePanel = boxes['console']!;
      const diagnostics = boxes['diagnostics']!;

      const editorColumn = editor.right - editor.left;
      const rightColumn = consolePanel.right - consolePanel.left;

      // Exactly `LAYOUT_EDITOR_COLUMN`, and so inside FR-409's 50–65 % band.
      expect(editorColumn).toBeCloseTo(appContentWidth * 0.58, 0);
      expect(editorColumn / appContentWidth).toBeGreaterThanOrEqual(0.5);
      expect(editorColumn / appContentWidth).toBeLessThanOrEqual(0.65);

      expect(editorColumn, 'the editor column clears 320 px').toBeGreaterThanOrEqual(320);
      expect(rightColumn, 'the right column clears 320 px').toBeGreaterThanOrEqual(320);

      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        'the page never scrolls sideways',
      ).toBeLessThanOrEqual(width);

      // The diagnostics panel is capped at 40 % of the right column, and the
      // console keeps a positive share of it.
      const rightColumnHeight = diagnostics.bottom - consolePanel.top;
      expect(diagnostics.bottom - diagnostics.top).toBeLessThanOrEqual(rightColumnHeight * 0.4);
      expect(consolePanel.bottom - consolePanel.top).toBeGreaterThan(0);
    });
  }

  test('VC-411 (FR-410, BR-402): both layouts render the same document order', async ({ page }) => {
    await seedPreference(page, 'vertical');
    await openPlayground(page);
    await waitForPythonReady(page);

    const readOrder = (): Promise<string[]> =>
      page.evaluate(() =>
        Array.from(document.getElementById('app')!.children)
          .filter((el) => el.classList.contains('panel'))
          .map((el) => el.getAttribute('aria-label') ?? el.className),
      );

    const vertical = await readOrder();
    expect(vertical).toEqual(['Special characters', 'Console', 'Editor', 'Standard input', 'Diagnostics']);

    // Watch for re-parenting across the switch (BR-402), then switch by the
    // only means that exists in this iteration.
    await page.evaluate(() => {
      const records: string[] = [];
      (window as unknown as { __panelMutations: string[] }).__panelMutations = records;
      new MutationObserver((entries) => {
        for (const entry of entries) {
          const touched = [...entry.addedNodes, ...entry.removedNodes].some(
            (node) => node instanceof Element && node.classList.contains('panel'),
          );
          if (entry.type === 'childList' && touched) records.push(entry.type);
        }
      }).observe(document.getElementById('app')!, { childList: true, subtree: true });
    });

    await page.evaluate(() => {
      document.getElementById('app')!.dataset.layout = 'horizontal';
    });
    await expect
      .poll(() => renderedLayout(page))
      .toBe('horizontal');

    expect(await readOrder(), 'the horizontal layout reads the same order').toEqual(vertical);
    expect(
      await page.evaluate(
        () => (window as unknown as { __panelMutations: string[] }).__panelMutations,
      ),
      'no panel was moved, re-parented or re-created',
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------
   VC-435 (FR-409): short viewports.
   ------------------------------------------------------------------------- */

for (const viewport of [
  { width: 1280, height: 500 },
  { width: 900, height: 420 },
]) {
  test(`VC-435 (FR-409): the console keeps its 80 px floor at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await seedPreference(page, 'horizontal');
    await openPlayground(page);
    await waitForPythonReady(page);
    await waitForLinter(page);
    // Give the diagnostics panel something to scroll to.
    await runProgram(page, 'import os\nx=1\n');
    await expect(page.locator('#diagnostics-list .diagnostic-entry').first()).toBeVisible();

    expect(await renderedLayout(page)).toBe('horizontal');

    const { boxes } = await measurePanels(page);
    expect(
      boxes['console']!.bottom - boxes['console']!.top,
      'the console never compresses below 80 px',
    ).toBeGreaterThanOrEqual(80);

    // Every stdin control and at least one diagnostics entry is reachable
    // without scrolling the page: the right column's own panels scroll.
    const reachable = await page.evaluate(() => {
      const within = (el: Element): boolean => {
        const box = el.getBoundingClientRect();
        return box.top >= -1 && box.bottom <= window.innerHeight + 1 && box.width > 0;
      };
      const entry = document.querySelector('#diagnostics-list .diagnostic-entry');
      return {
        stdinField: within(document.getElementById('stdin-input')!),
        eof: within(document.getElementById('btn-eof')!),
        entry: !!entry && entry.getBoundingClientRect().width > 0,
        pageScrollsVertically:
          document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
      };
    });
    expect(reachable.stdinField, 'the stdin field is on screen').toBe(true);
    expect(reachable.eof, 'Send EOF is on screen').toBe(true);
    expect(reachable.entry, 'a diagnostics entry is rendered').toBe(true);
    expect(reachable.pageScrollsVertically, 'the page itself does not scroll').toBe(false);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      'the page never scrolls sideways',
    ).toBeLessThanOrEqual(viewport.width);
  });
}

/* -------------------------------------------------------------------------
   VC-402 / VC-412 / VC-413: resolution, the crossing and the override.
   ------------------------------------------------------------------------- */

test('VC-402 (FR-402, FR-411): an unset preference resolves from the width and stays unset', async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await seedPreference(page, null);
  await openPlayground(page);
  expect(await renderedLayout(page)).toBe('horizontal');
  expect(await storedLayout(page), 'resolving writes nothing').toBeNull();

  await page.setViewportSize({ width: 800, height: 800 });
  await page.reload();
  await page.waitForSelector('.cm-content');
  expect(await renderedLayout(page)).toBe('vertical');
  expect(await storedLayout(page), 'resolving writes nothing').toBeNull();
});

test('VC-412 (FR-411, FR-412, BR-405): crossing 900 px re-resolves within 100 ms', async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await seedPreference(page, null);
  await openPlayground(page);
  expect(await renderedLayout(page)).toBe('horizontal');

  await recordCrossingLatency(page);

  await page.setViewportSize({ width: 899, height: 800 });
  await expectLayoutWithin(page, 'vertical');

  await page.setViewportSize({ width: LAYOUT_MIN_WIDTH, height: 800 });
  await expectLayoutWithin(page, 'horizontal');

  // Both crossings re-resolved within FR-412's 100 ms of the event that fired
  // them, and there were exactly two of them — no debounce, no extra pass.
  const latencies = await crossingLatencies(page);
  expect(latencies, 'one re-resolution per crossing').toHaveLength(2);
  for (const latency of latencies) {
    expect(latency, 'the crossing re-resolves within 100 ms').toBeLessThanOrEqual(100);
  }

  expect(await storedLayout(page), 'a resize never writes a preference').toBeNull();
});

test('VC-413 (FR-413, BR-404, BR-405): the narrow override never overwrites the preference', async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await seedPreference(page, 'horizontal');
  await openPlayground(page);
  expect(await renderedLayout(page)).toBe('horizontal');

  await page.setViewportSize(NARROW);
  await expectLayoutWithin(page, 'vertical');
  expect(await storedLayout(page), 'the stored choice is untouched').toBe('horizontal');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    NARROW.width,
  );

  // Widening restores it with no interaction at all.
  await page.setViewportSize(WIDE);
  await expectLayoutWithin(page, 'horizontal');

  await page.setViewportSize(NARROW);
  await page.reload();
  await page.waitForSelector('.cm-content');
  expect(await renderedLayout(page)).toBe('vertical');
  expect(await storedLayout(page)).toBe('horizontal');
});

/* -------------------------------------------------------------------------
   VC-416 (FR-416): resolved in the first painted frame.
   ------------------------------------------------------------------------- */

for (const preference of ['horizontal', 'vertical'] as const) {
  test(`VC-416 (FR-416): the first painted frame already reads ${preference}`, async ({ page }) => {
    await page.setViewportSize(WIDE);
    await seedPreference(page, preference);
    // Installed from a document-start script, so the observer is watching
    // before `boot()` has run.
    await page.addInitScript(() => {
      const state = { firstFrame: null as string | null, changes: [] as string[] };
      (window as unknown as { __layoutFrames: typeof state }).__layoutFrames = state;
      const start = (): void => {
        const app = document.getElementById('app');
        if (!app) return;
        new MutationObserver((entries) => {
          for (const entry of entries) {
            if (entry.attributeName === 'data-layout') {
              state.changes.push(app.dataset.layout ?? '');
            }
          }
        }).observe(app, { attributes: true, attributeFilter: ['data-layout'] });
        requestAnimationFrame(() => {
          state.firstFrame = app.dataset.layout ?? null;
        });
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
      } else {
        start();
      }
    });

    await openPlayground(page);
    await waitForPythonReady(page);

    const frames = await page.evaluate(
      () =>
        (
          window as unknown as {
            __layoutFrames: { firstFrame: string | null; changes: string[] };
          }
        ).__layoutFrames,
    );

    expect(frames.firstFrame, 'the value is already resolved in frame one').toBe(preference);
    // The attribute is written once, to the value it keeps: no frame ever
    // showed the other layout, and nothing changed it afterwards.
    expect(frames.changes.filter((value) => value !== preference)).toEqual([]);
    expect(await renderedLayout(page)).toBe(preference);
  });
}

/* -------------------------------------------------------------------------
   VC-417 / VC-418 (FR-417): malformed and hostile storage.
   ------------------------------------------------------------------------- */

const MALFORMED = [
  ['an empty string', ''],
  ['a leading space', ' vertical'],
  ['the wrong case', 'Horizontal'],
  ['a JSON string', '"horizontal"'],
  ['a JSON document', '{"layout":"horizontal"}'],
  ['an unknown layout', 'diagonal'],
  ['a 1 MB string', 'x'.repeat(1024 * 1024)],
] as const;

for (const [label, value] of MALFORMED) {
  test(`VC-417 (FR-417): ${label} is treated as absent and left in place`, async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(String(error)));

    await page.setViewportSize(WIDE);
    await seedPreference(page, value);
    await openPlayground(page);
    await waitForPythonReady(page);

    expect(await renderedLayout(page), 'falls back to the unset default').toBe('horizontal');
    expect(await storedLayout(page), 'the malformed bytes are not rewritten').toBe(value);
    expect(
      await page.locator('#notices [data-notice]').count(),
      'a malformed preference is not the visitor’s problem',
    ).toBe(0);
    expect(problems, 'no console error and no unhandled rejection').toEqual([]);
  });
}

test('VC-417 (FR-417): a malformed preference still narrows below 900 px', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await seedPreference(page, 'diagonal');
  await openPlayground(page);
  expect(await renderedLayout(page)).toBe('vertical');
});

test('VC-418 (FR-417): a throwing localStorage still boots and still runs Python', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(String(error)));

  await page.setViewportSize(WIDE);
  await page.addInitScript(() => {
    const deny = (): never => {
      throw new DOMException('denied', 'SecurityError');
    };
    // Both accessors throw, which is what a locked-down profile does.
    Object.defineProperty(window.localStorage, 'getItem', { value: deny, configurable: true });
    Object.defineProperty(window.localStorage, 'setItem', { value: deny, configurable: true });
  });

  await openPlayground(page);
  await waitForPythonReady(page);

  expect(await renderedLayout(page)).toBe('horizontal');

  await runProgram(page, 'print("ok")\n');
  await expect(page.locator('#console')).toContainText('ok');
  expect(problems, 'no uncaught exception').toEqual([]);
});
