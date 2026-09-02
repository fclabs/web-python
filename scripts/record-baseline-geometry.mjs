/**
 * Record the rendered geometry of the vertical layout, so a later build can be
 * diffed against it (spec-04 FR-407, VC-408).
 *
 * VC-408 compares the four panels' bounding boxes against "the baseline build
 * of commit 384cb70" at 1280x800 and 375x667. Those measurements have to come
 * from a checkout of that commit, because the point of the criterion is that
 * this spec's CSS did not move anything:
 *
 *   git worktree add ../baseline-384cb70 384cb70
 *   cd ../baseline-384cb70 && npm ci && npm run build
 *   npx vite preview --port 4273 --strictPort &
 *   node scripts/record-baseline-geometry.mjs \
 *     http://localhost:4273 tests/e2e/baseline-geometry.json 384cb70
 *
 * `vite preview` is what must serve it: the COOP/COEP headers of BR-002 keep
 * `#coi-banner` hidden, and a visible banner would add a full-width row and
 * shift every panel below it.
 *
 * The recorded box is rounded to 2 decimals — the criterion's tolerance is
 * +/-1 px per edge, so sub-pixel noise between engines is well inside it.
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [baseUrl, out, commit] = process.argv.slice(2);
if (!baseUrl || !out || !commit) {
  console.error('usage: record-baseline-geometry.mjs <base-url> <out.json> <commit>');
  process.exit(1);
}

/** The viewport sizes VC-408 names. */
export const GEOMETRY_VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 375, height: 667 },
];

const browser = await chromium.launch();
const viewports = {};

for (const viewport of GEOMETRY_VIEWPORTS) {
  const page = await browser.newPage({ viewport });
  // VC-408 measures `data-layout="vertical"` specifically, and at 1280 px an
  // unset preference resolves to horizontal (FR-411). Seeding the preference
  // is how the *shipped* code path is asked for the vertical rendering; on the
  // baseline build the key does not exist yet and is simply ignored, so the
  // same recorder produces comparable numbers from both builds.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('pyplay.layout.v1', 'vertical');
    } catch {
      /* VC-418: an unwritable store is not this recorder's concern. */
    }
  });
  await page.goto(baseUrl);
  await page.waitForFunction(
    () => document.getElementById('app')?.dataset.layout !== 'horizontal',
  );
  await page.waitForSelector('.cm-content');
  viewports[`${viewport.width}x${viewport.height}`] = await page.evaluate(measure);
  await page.close();
}

await browser.close();
writeFileSync(out, `${JSON.stringify({ commit, viewports }, null, 2)}\n`);
console.log(`recorded ${commit} geometry into ${out}`);

/**
 * Serialised in the page. Kept in this file so the recorder and the assertion
 * in `tests/e2e/layout.spec.ts` cannot drift; the spec imports it from here.
 */
function measure() {
  const round = (n) => Math.round(n * 100) / 100;
  const panels = ['console', 'editor', 'stdin', 'diagnostics'];
  const boxes = {};
  for (const name of panels) {
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
  const diagnostics = document.querySelector('.panel--diagnostics');
  return {
    boxes,
    // VC-408's second half: the cap is still `25vh`, not a resolved pixel
    // value that happens to match at these two heights.
    diagnosticsMaxHeight: getComputedStyle(diagnostics).maxHeight,
    appContentWidth: round(document.getElementById('app').clientWidth),
  };
}
