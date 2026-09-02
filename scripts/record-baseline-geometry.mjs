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

/**
 * Which environment produced these numbers. The stacked column's height and
 * the toolbar's are text metrics: the same build measures 82 px of header on
 * a GitHub `ubuntu-latest` runner, 84 px in the Playwright Linux image and
 * 82 px on darwin — differences of the installed fonts, not of the product.
 * A record is therefore only comparable to a run of the same environment, and
 * `tests/e2e/layout.spec.ts` refuses to compare across a mismatch rather than
 * reporting a font as a layout regression. See CONTRIBUTING.md
 * ("Re-recording the pinned baselines").
 */
const recordedOn = `${process.platform}-${process.arch} chromium ${browser.version()}`;

for (const viewport of GEOMETRY_VIEWPORTS) {
  const page = await browser.newPage({ viewport });
  /*
   * VC-408 measures the *stacked* layout — `data-layout="horizontal"`, which
   * names the orientation of the divider (see `src/layout.ts`) and is the
   * rendering spec-01 shipped. At 1280 px an unset preference resolves to the
   * two-column `vertical` layout instead (FR-411), so the preference is
   * seeded: that asks the *shipped* code path for the stacked rendering. On
   * the baseline build the key does not exist yet and is simply ignored, so
   * the same recorder produces comparable numbers from both builds.
   */
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('pyplay.layout.v2', 'horizontal');
    } catch {
      /* VC-418: an unwritable store is not this recorder's concern. */
    }
  });
  await page.goto(baseUrl);
  await page.waitForFunction(
    () => document.getElementById('app')?.dataset.layout !== 'vertical',
  );
  await page.waitForSelector('.cm-content');
  viewports[`${viewport.width}x${viewport.height}`] = await page.evaluate(measure);
  await page.close();
}

await browser.close();
writeFileSync(out, `${JSON.stringify({ commit, recordedOn, viewports }, null, 2)}\n`);
console.log(`recorded ${commit} geometry into ${out} (${recordedOn})`);

/**
 * Serialised in the page. Kept in this file so the recorder and the assertion
 * in `tests/e2e/layout.spec.ts` cannot drift; the spec imports it from here.
 */
function measure() {
  const round = (n) => Math.round(n * 100) / 100;
  const panels = ['console', 'editor', 'stdin', 'diagnostics'];
  const boxes = {};
  const flex = {};
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
    /*
     * FR-407 names "the flex ratios, minimum heights and `max-height: 25vh`
     * diagnostics cap of the pre-change build" as the thing to preserve. Those
     * are the declarations, and unlike the resulting pixels they do not move
     * when the toolbar above the column grows — so they are what VC-408 can
     * compare exactly at every viewport size.
     */
    const panelStyle = getComputedStyle(el);
    flex[name] = {
      grow: panelStyle.flexGrow,
      shrink: panelStyle.flexShrink,
      basis: panelStyle.flexBasis,
      minHeight: panelStyle.minHeight,
      maxHeight: panelStyle.maxHeight,
    };
  }
  const diagnostics = document.querySelector('.panel--diagnostics');
  const app = document.getElementById('app');
  const style = getComputedStyle(app);
  const appBox = app.getBoundingClientRect();
  return {
    boxes,
    flex,
    // VC-408's second half: the cap is still `25vh`, not a resolved pixel
    // value that happens to match at these two heights.
    diagnosticsMaxHeight: getComputedStyle(diagnostics).maxHeight,
    appContentWidth: round(
      app.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    ),
    /*
     * The block the panels are stacked below. FR-401 adds a toolbar control,
     * which makes this row taller — and at 375 px wide it makes it wrap — so
     * every panel below it starts lower and the column has less height to
     * share out. That is an effect of FR-401, not a change to the vertical
     * layout FR-407 protects, so VC-408 compares the panels against the space
     * this block leaves rather than against absolute page coordinates.
     */
    stack: {
      /* Where the panel column starts and ends. */
      top: round(boxes.console.top),
      bottom: round(boxes.diagnostics.bottom),
      /* The height the four panels and their gaps share out. */
      height: round(boxes.diagnostics.bottom - boxes.console.top),
      /* The app's content box, so the header block's height is derivable. */
      contentTop: round(appBox.top + parseFloat(style.paddingTop)),
      contentBottom: round(appBox.bottom - parseFloat(style.paddingBottom)),
      gap: round(parseFloat(style.rowGap)),
      toolbarHeight: round(document.querySelector('.toolbar').getBoundingClientRect().height),
    },
  };
}
