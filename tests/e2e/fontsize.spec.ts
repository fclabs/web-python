/**
 * Editor font size — toolbar control and drop-down (spec-13, Iteration 2).
 *
 * VC-1301 (FR-1301) — placement and attributes.
 * VC-1302 (FR-1302) — label and accessible name.
 * VC-1303 (FR-1303) — click / Enter / Space / ArrowDown open the menu.
 * VC-1304 (FR-1304) — checked and default state.
 * VC-1305 (FR-1305) — keyboard navigation.
 * VC-1306 (FR-1306) — close without choosing; Esc is consumed.
 * VC-1307 (FR-1307) — select by click and by keyboard.
 * VC-1309 (FR-1309) — scope of effect.
 * VC-1311 (FR-1311, BR-1303) — synchronous write, no write for an unchanged size.
 * VC-1312 (FR-1312) — stored size is in place when the editor is first inserted.
 * VC-1314 (FR-1314) — one notice per load on write failure.
 * VC-1315 (FR-1315) — never inert.
 * VC-1316 (FR-1316) — layout fit.
 * VC-1322 (NFR-1304) — hit target.
 * VC-1327 (BR-1307) — custom menu, no <select>.
 *
 * Iteration 3 — state preservation, side-effect proof, budgets, storage surface:
 * VC-1308 (FR-1308) — document, selection, undo and first visible line survive.
 * VC-1325 (FR-1317) — caret and gutter geometry follow the size.
 * VC-1310 (FR-1310, BR-1302) — no transaction, autosave, worker message or console output.
 * VC-1318 (BR-1306) — strings only in format.ts; no network; no worker message; never `disabled`.
 * VC-1326 (BR-1306, BR-1303) — the origin's storage surface.
 * VC-1319 (NFR-1301) — apply latency.
 * VC-1321 (NFR-1303) — contrast of the button and the open menu, both palettes
 *   (run by `npm run audit:contrast`).
 *
 * Iteration 4 — acceptance:
 * VC-1324 (whole spec) — keyboard choice, reload from first paint, second choice, program intact.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { failures, measureContrast, type Sample } from './contrast';
import {
  LAYOUT_KEY,
  PROGRAM_KEY,
  WORKSPACE_KEY,
  editorText,
  noticeTexts,
  runProgram,
  submitStdin,
  storedProgram,
  trackLongTasks,
  openPlayground,
  setProgram,
  waitForPythonReady,
  waitForStdinPrompt,
} from './helpers';

const KEY = 'pyplay.fontsize.v1';
const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36];

const button = (page: Page) => page.locator('#btn-fontsize');
const menu = (page: Page) => page.locator('#fontsize-menu');
const item = (page: Page, size: number) => page.locator(`#fontsize-menu [data-size="${size}"]`);
const activeId = (page: Page) => page.evaluate(() => document.activeElement?.id);
const activeSize = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.size ?? null);
const editorSize = (page: Page, selector = '.cm-content') =>
  page.evaluate((s) => getComputedStyle(document.querySelector(s)!).fontSize, selector);

async function openByClick(page: Page): Promise<void> {
  await button(page).click();
  await expect(menu(page)).toBeVisible();
}

test('VC-1301 (FR-1301): #btn-fontsize sits between #btn-symbols and #btn-theme; About stays last', async ({
  page,
}) => {
  await openPlayground(page);
  const result = await page.evaluate(() => {
    const kids = Array.from(document.querySelectorAll('.toolbar > button')).map((el) => el.id);
    const b = document.getElementById('btn-fontsize')!;
    return {
      kids,
      attrs: {
        tabindex: b.getAttribute('tabindex'),
        haspopup: b.getAttribute('aria-haspopup'),
        expanded: b.getAttribute('aria-expanded'),
        controls: b.getAttribute('aria-controls'),
      },
      target: !!document.getElementById(b.getAttribute('aria-controls')!),
      inToolbar: !!b.closest('header.toolbar'),
    };
  });
  const i = result.kids.indexOf('btn-fontsize');
  expect(result.kids[i - 1]).toBe('btn-symbols');
  expect(result.kids[i + 1]).toBe('btn-theme');
  expect(result.kids[result.kids.length - 1]).toBe('btn-about');
  expect(result.inToolbar).toBe(true);
  expect(result.attrs).toEqual({
    tabindex: '0',
    haspopup: 'menu',
    expanded: 'false',
    controls: 'fontsize-menu',
  });
  expect(result.target).toBe(true);

  // Tab order: Symbols -> Font size -> Theme.
  await page.locator('#btn-symbols').focus();
  await page.keyboard.press('Tab');
  expect(await activeId(page)).toBe('btn-fontsize');
  await page.keyboard.press('Tab');
  expect(await activeId(page)).toBe('btn-theme');
});

test('VC-1302 (FR-1302): label and accessible name follow the size', async ({ page }) => {
  await openPlayground(page);
  await expect(button(page)).toHaveText('Font size: 14');
  await expect(button(page)).toHaveAttribute('aria-label', 'Font size: 14 px');
  await openByClick(page);
  await item(page, 20).click();
  await expect(button(page)).toHaveText('Font size: 20');
  await expect(button(page)).toHaveAttribute('aria-label', 'Font size: 20 px');
  await expect(page.getByRole('button', { name: 'Font size: 20 px' })).toBeVisible();
});

test('VC-1303 (FR-1303): click, Enter, Space and ArrowDown open the menu on the current size', async ({
  page,
}) => {
  await openPlayground(page);
  for (const how of ['click', 'Enter', 'Space', 'ArrowDown']) {
    if (how === 'click') await button(page).click();
    else {
      await button(page).focus();
      await page.keyboard.press(how === 'Space' ? ' ' : how);
    }
    await expect(menu(page), how).toBeVisible();
    await expect(button(page), how).toHaveAttribute('aria-expanded', 'true');
    await expect(menu(page), how).toHaveAttribute('role', 'menu');
    const sizes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#fontsize-menu [role="menuitemradio"]')).map((el) =>
        Number((el as HTMLElement).dataset.size),
      ),
    );
    expect(sizes, how).toEqual(SIZES);
    expect(await activeSize(page), how).toBe('14');
    await page.keyboard.press('Escape');
    await expect(menu(page), how).toBeHidden();
  }
});

test('VC-1304 (FR-1304): checked state, check mark and the default label', async ({ page }) => {
  await openPlayground(page);
  await openByClick(page);
  await item(page, 18).click();
  await openByClick(page);
  for (const size of SIZES) {
    await expect(item(page, size)).toHaveAttribute('aria-checked', size === 18 ? 'true' : 'false');
    await expect(item(page, size)).toHaveAttribute('role', 'menuitemradio');
  }
  await expect(item(page, 14)).toHaveText('14 px (default)');
  await expect(item(page, 18)).toHaveText('18 px');
  const marks = await page.evaluate(() =>
    [12, 14, 16, 18, 20, 24, 28, 32, 36].map((n) => {
      const el = document.querySelector(`#fontsize-menu [data-size="${n}"]`)!;
      return getComputedStyle(el, '::before').content;
    }),
  );
  expect(marks[SIZES.indexOf(18)]).toContain('✓');
  expect(marks.filter((c) => c.includes('✓'))).toHaveLength(1);

  await page.keyboard.press('Escape');
  await openByClick(page);
  await item(page, 14).click();
  await openByClick(page);
  await expect(item(page, 14)).toHaveAttribute('aria-checked', 'true');
  await expect(item(page, 14)).toHaveText('14 px (default)');
});

test('VC-1305 (FR-1305): arrows stop at the ends, Home/End, Enter selects', async ({ page }) => {
  await openPlayground(page);
  await button(page).focus();
  await page.keyboard.press('Enter');
  expect(await activeSize(page)).toBe('14');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect(await activeSize(page)).toBe('18');
  await page.keyboard.press('Home');
  expect(await activeSize(page)).toBe('12');
  await page.keyboard.press('ArrowUp');
  expect(await activeSize(page)).toBe('12');
  await page.keyboard.press('End');
  expect(await activeSize(page)).toBe('36');
  await page.keyboard.press('ArrowDown');
  expect(await activeSize(page)).toBe('36');
  await page.keyboard.press('ArrowUp');
  expect(await activeSize(page)).toBe('32');
  await page.keyboard.press('Enter');
  await expect(menu(page)).toBeHidden();
  expect(await editorSize(page)).toBe('32px');
});

test('VC-1306 (FR-1306): Esc, outside click, Tab and re-click close without choosing', async ({
  page,
}) => {
  await openPlayground(page);

  await openByClick(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
  expect(await activeId(page)).toBe('btn-fontsize');
  expect(await editorSize(page)).toBe('14px');

  await openByClick(page);
  await page.locator('#console').click();
  await expect(menu(page)).toBeHidden();
  expect(await activeId(page)).toBe('btn-fontsize');
  expect(await editorSize(page)).toBe('14px');

  await openByClick(page);
  await page.keyboard.press('Tab');
  await expect(menu(page)).toBeHidden();
  await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
  expect(await activeId(page)).toBe('btn-theme');
  expect(await editorSize(page)).toBe('14px');

  await button(page).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await expect(menu(page)).toBeHidden();
  expect(await activeId(page)).toBe('btn-symbols');

  await openByClick(page);
  await button(page).click();
  await expect(menu(page)).toBeHidden();
  expect(await editorSize(page)).toBe('14px');
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();

  // Esc is consumed: an About dialog opened beforehand, and the Files and
  // Symbols panes, are untouched by the Esc that closes the menu.
  // The Files pane is open by default; open Symbols too.
  await page.locator('#btn-symbols').click();
  await expect(page.locator('#file-pane')).toBeVisible();
  await expect(page.locator('#symbol-pane')).toBeVisible();
  await page.locator('#btn-about').click();
  await expect(page.locator('#about-dialog')).toBeVisible();
  await button(page).evaluate((el: HTMLElement) => el.focus());
  // About swallows chrome clicks while modal (FR-819), so open by ArrowDown.
  await page.keyboard.press('ArrowDown');
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await expect(page.locator('#about-dialog')).toBeVisible();
  await expect(page.locator('#file-pane')).toBeVisible();
  await expect(page.locator('#symbol-pane')).toBeVisible();
  // With no menu open, the same Esc still closes About (its handler is intact).
  await page.keyboard.press('Escape');
  await expect(page.locator('#about-dialog')).toBeHidden();
});

test('VC-1307 (FR-1307): choosing 36 by click and by keyboard applies, closes and refocuses', async ({
  page,
}) => {
  await openPlayground(page);
  const url = page.url();

  await openByClick(page);
  await item(page, 36).click();
  await expect(menu(page)).toBeHidden();
  expect(await editorSize(page)).toBe('36px');
  expect(await editorSize(page, '.cm-gutters')).toBe('36px');
  expect(await activeId(page)).toBe('btn-fontsize');
  await expect(button(page)).toHaveText('Font size: 36');

  await openByClick(page);
  await item(page, 12).click();
  expect(await editorSize(page)).toBe('12px');

  await button(page).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.press(' ');
  await expect(menu(page)).toBeHidden();
  expect(await editorSize(page)).toBe('36px');
  expect(await activeId(page)).toBe('btn-fontsize');
  await expect(button(page)).toHaveText('Font size: 36');
  expect(page.url()).toBe(url);
});

test('VC-1309 (FR-1309): only the editor content and gutters change size', async ({ page }) => {
  await openPlayground(page);
  const outside = ['#console', '#file-pane', '#symbol-pane', '#diagnostics-list', '#stdin-input', '.toolbar', '#notices', '.editor-heading', '#btn-run'];
  const sample = () =>
    page.evaluate((sels) => sels.map((s) => getComputedStyle(document.querySelector(s)!).fontSize), outside);

  const popup = async (): Promise<string> => {
    await setProgram(page, '');
    await page.locator('.cm-content').click();
    await page.keyboard.type('pri');
    await page.waitForSelector('.cm-tooltip-autocomplete');
    const size = await editorSize(page, '.cm-tooltip-autocomplete');
    await page.keyboard.press('Escape');
    return size;
  };

  const base = await sample();
  const basePopup = await popup();
  await openByClick(page);
  await item(page, 36).click();
  expect(await editorSize(page)).toBe('36px');
  expect(await editorSize(page, '.cm-gutters')).toBe('36px');
  expect(await sample()).toEqual(base);
  expect(await popup()).toBe(basePopup);
});

test('VC-1311 (FR-1311, BR-1303): choosing writes the canonical string now; the same size writes nothing', async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const w = window as unknown as { __sets: string[] };
    w.__sets = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === key) w.__sets.push(v);
      return original.call(this, k, v);
    };
  }, KEY);
  await openPlayground(page);
  const sets = () => page.evaluate(() => (window as unknown as { __sets: string[] }).__sets);

  await openByClick(page);
  await item(page, 20).click();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('20');
  expect(await sets()).toEqual(['20']);

  await openByClick(page);
  await item(page, 20).click();
  expect(await sets()).toEqual(['20']);
  expect(await noticeTexts(page)).toEqual([]);
});

test('VC-1312 (FR-1312): a stored size is in place when the editor is first inserted', async ({
  page,
}) => {
  await page.addInitScript((key) => {
    try {
      localStorage.setItem(key, '36');
    } catch {
      /* ignore */
    }
    const probe: Record<string, string | null> = {};
    (window as unknown as { __probe: typeof probe }).__probe = probe;
    const read = (name: string): void => {
      const content = document.querySelector('.cm-content');
      if (!content || probe[name + 'Var'] !== undefined) return;
      probe[name + 'Var'] = getComputedStyle(document.documentElement)
        .getPropertyValue('--editor-font-size')
        .trim();
      probe[name + 'Size'] = getComputedStyle(content).fontSize;
    };
    new MutationObserver(() => read('inserted')).observe(document, {
      childList: true,
      subtree: true,
    });
    document.addEventListener('DOMContentLoaded', () => read('dcl'));
  }, KEY);
  await page.goto('/');
  await page.waitForSelector('.cm-content');
  const probe = await page.evaluate(
    () => (window as unknown as { __probe: Record<string, string> }).__probe,
  );
  expect(probe.insertedVar).toBe('36px');
  expect(probe.insertedSize).toBe('36px');
  await expect(button(page)).toHaveText('Font size: 36');
  expect(await editorSize(page)).toBe('36px');
});

test('VC-1314 (FR-1314): a failing write applies, notifies once per load', async ({ page }) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === key) throw new DOMException('quota', 'QuotaExceededError');
      return original.call(this, k, v);
    };
  }, KEY);
  await openPlayground(page);
  await openByClick(page);
  await item(page, 18).click();
  expect(await editorSize(page)).toBe('18px');
  expect(await noticeTexts(page)).toEqual(["Font size won't be remembered"]);
  await openByClick(page);
  await item(page, 20).click();
  expect(await editorSize(page)).toBe('20px');
  expect(await noticeTexts(page)).toEqual(["Font size won't be remembered"]);
});

test('VC-1315 (FR-1315): never inert while running, waiting on input, or with a binary file open', async ({
  page,
}) => {
  await openPlayground(page);
  await waitForPythonReady(page);

  const operable = async (size: number, label: string): Promise<void> => {
    const attrs = await button(page).evaluate((el) => ({
      disabled: el.hasAttribute('disabled'),
      aria: el.hasAttribute('aria-disabled'),
    }));
    expect(attrs, label).toEqual({ disabled: false, aria: false });
    await openByClick(page);
    await item(page, size).click();
    expect(await editorSize(page), label).toBe(`${size}px`);
  };

  await setProgram(page, 'while True: pass\n');
  await page.locator('#btn-run').click();
  await expect(page.locator('#btn-stop')).toHaveAttribute('aria-disabled', 'false');
  await operable(16, 'running');
  await page.locator('#btn-stop').click();
  await expect(page.locator('#btn-run')).toBeEnabled({ timeout: 10_000 });

  await setProgram(page, 'input("? ")\n');
  await page.locator('#btn-run').click();
  await waitForStdinPrompt(page);
  await operable(18, 'stdin-waiting');
  await page.locator('#btn-stop').click();
  await expect(page.locator('#btn-run')).toBeEnabled({ timeout: 10_000 });

  await setProgram(
    page,
    'from pathlib import Path\nPath("blob.bin").write_bytes(bytes([0, 255, 1]))\n',
  );
  await page.locator('#btn-run').click();
  await page.locator('[data-file="blob.bin"]').click({ timeout: 30_000 });
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await operable(20, 'read-only file');
});

test('VC-1315 (FR-1315): operable with the cross-origin-isolation banner showing', async ({
  page,
}) => {
  const { PLAIN_BASE_URL } = await import('../../playwright.config');
  await page.goto(PLAIN_BASE_URL);
  await page.waitForSelector('.cm-content');
  await expect(page.locator('#coi-banner')).toBeVisible();
  const attrs = await button(page).evaluate((el) => ({
    disabled: el.hasAttribute('disabled'),
    aria: el.hasAttribute('aria-disabled'),
  }));
  expect(attrs).toEqual({ disabled: false, aria: false });
  await openByClick(page);
  await item(page, 36).click();
  expect(await editorSize(page)).toBe('36px');
});

test.describe('VC-1316 (FR-1316): layout fit', () => {
  const cases: Array<{ width: number; layout: 'horizontal' | 'vertical'; scheme: 'light' | 'dark' }> = [];
  for (const scheme of ['light', 'dark'] as const) {
    for (const layout of ['horizontal', 'vertical'] as const) {
      cases.push({ width: 1280, layout, scheme }, { width: 900, layout, scheme });
    }
    cases.push({ width: 700, layout: 'horizontal', scheme }, { width: 375, layout: 'horizontal', scheme });
  }
  for (const c of cases) {
    test(`${c.width}px ${c.layout} ${c.scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: c.width, height: 700 });
      await page.emulateMedia({ colorScheme: c.scheme });
      await page.addInitScript(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: LAYOUT_KEY, value: c.layout },
      );
      await openPlayground(page, { seedLayout: false });

      const fit = await page.evaluate(() => {
        const toolbar = document.querySelector('.toolbar') as HTMLElement;
        const kids = Array.from(toolbar.children) as HTMLElement[];
        const tops = kids.map((el) => el.getBoundingClientRect().top);
        const b = document.getElementById('btn-fontsize')!.getBoundingClientRect();
        const de = document.documentElement;
        return {
          singleRow: Math.max(...tops) - Math.min(...tops) < 4,
          noHScroll: de.scrollWidth <= de.clientWidth,
          bodyNoHScroll: document.body.scrollWidth <= document.body.clientWidth,
          visible: b.left >= 0 && b.right <= de.clientWidth && b.width > 0,
        };
      });
      if (c.width >= 900) expect(fit.singleRow).toBe(true);
      expect(fit.noHScroll).toBe(true);
      expect(fit.bodyNoHScroll).toBe(true);
      expect(fit.visible).toBe(true);

      await openByClick(page);
      const box = await menu(page).boundingBox();
      const vp = page.viewportSize()!;
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
    });
  }

  test('a short viewport flips the menu above or clamps it inside', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 300 });
    await openPlayground(page);
    await openByClick(page);
    const box = await menu(page).boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(300);
  });

  test('a very short viewport scrolls the nine-item menu and keyboard focus follows', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 200 });
    await openPlayground(page);
    await openByClick(page);
    const m = await menu(page).boundingBox();
    expect(m!.y).toBeGreaterThanOrEqual(0);
    expect(m!.y + m!.height).toBeLessThanOrEqual(200);
    await page.keyboard.press('End');
    expect(await activeSize(page)).toBe('36');
    const inView = await page.evaluate(() => {
      const mr = document.getElementById('fontsize-menu')!.getBoundingClientRect();
      const ir = (document.activeElement as HTMLElement).getBoundingClientRect();
      return ir.top >= mr.top - 1 && ir.bottom <= mr.bottom + 1;
    });
    expect(inView).toBe(true);
  });
});

test('VC-1322 (NFR-1304): the button and every item are at least 24 x 24 px', async ({ page }) => {
  await openPlayground(page);
  const b = await button(page).boundingBox();
  expect(b!.width).toBeGreaterThanOrEqual(24);
  expect(b!.height).toBeGreaterThanOrEqual(24);
  await openByClick(page);
  for (const size of SIZES) {
    const box = await item(page, size).boundingBox();
    expect(box!.width, `${size} width`).toBeGreaterThanOrEqual(24);
    expect(box!.height, `${size} height`).toBeGreaterThanOrEqual(24);
  }
});

test('VC-1327 (BR-1307): a custom menu, no <select> in the toolbar', async ({ page }) => {
  await openPlayground(page);
  await openByClick(page);
  expect(await page.locator('header.toolbar select').count()).toBe(0);
  expect(await page.locator('select').count()).toBe(0);
  expect(await page.locator('#fontsize-menu [role="menuitemradio"]').count()).toBe(9);
  expect(await menu(page).getAttribute('aria-labelledby')).toBe('btn-fontsize');
});

// ---------------------------------------------------------------------------
// Iteration 3
// ---------------------------------------------------------------------------

/** The live CodeMirror view, reached the way `EditorView.findFromDOM` does. */
const VIEW = `(() => {
  const c = document.querySelector('.cm-content');
  const v = (c && (c.cmTile && c.cmTile.view)) || (c && c.cmView && c.cmView.view);
  if (!v) throw new Error('CodeMirror view not found');
  return v;
})()`;

const TWO_HUNDRED = Array.from({ length: 200 }, (_, i) => `v${i + 1} = ${i + 1}`).join('\n') + '\n';

async function choose(page: Page, size: number): Promise<void> {
  await openByClick(page);
  await item(page, size).click();
  await expect(button(page)).toBeFocused();
}

test('VC-1325 (FR-1317): every line number stays level with its line after growing and shrinking', async ({
  page,
}) => {
  await openPlayground(page);
  // Line numbers are CodeMirror-sized inline from its last measure; a CSS-only
  // size change must trigger a re-measure or they collapse (grow) or spread
  // apart (shrink) while the text reflows.
  const offsets = () =>
    page.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.cm-content .cm-line')) as HTMLElement[];
      const nums = Array.from(
        document.querySelectorAll('.cm-lineNumbers .cm-gutterElement'),
      ) as HTMLElement[];
      // Skip CodeMirror's zero-height, hidden width-measuring element.
      const numbered = nums.filter((n) => n.getBoundingClientRect().height > 0);
      return numbered.slice(0, lines.length).map((n, i) => {
        const a = n.getBoundingClientRect();
        const b = lines[i]!.getBoundingClientRect();
        return { i, gutterTop: a.top, lineTop: b.top, gutterH: a.height, lineH: b.height };
      });
    });
  for (const size of [36, 12, 24, 14]) {
    await choose(page, size);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const rows = await offsets();
    expect(rows.length, `rows at ${size}`).toBeGreaterThan(5);
    for (const r of rows) {
      expect(Math.abs(r.gutterTop - r.lineTop), `${size}px row ${r.i} top`).toBeLessThanOrEqual(2);
      expect(Math.abs(r.gutterH - r.lineH), `${size}px row ${r.i} height`).toBeLessThanOrEqual(2);
    }
  }
});

test('VC-1308 (FR-1308): document, selection, undo history and first visible line survive 14 -> 36 -> 12', async ({
  page,
}) => {
  await openPlayground(page);
  await setProgram(page, TWO_HUNDRED);
  // Three separate undo steps: history groups edits closer than 500 ms.
  for (const n of [1, 2, 3]) {
    await page.waitForTimeout(650);
    await page.evaluate(
      ({ view, n }) => {
        const v = new Function(`return ${view}`)();
        v.dispatch({ changes: { from: v.state.doc.length, insert: `# edit ${n}\n` }, userEvent: 'input.type' });
      },
      { view: VIEW, n },
    );
  }
  const original = await page.evaluate(
    (view) => (new Function(`return ${view}`)()).state.doc.toString() as string,
    VIEW,
  );
  // Caret at line 120 col 5 with a selection back to line 118 col 2; line 80 first visible.
  const before = await page.evaluate((view) => {
    const v = new Function(`return ${view}`)();
    const a = v.state.doc.line(118).from + 1;
    const b = v.state.doc.line(120).from + 4;
    v.dispatch({ selection: { anchor: a, head: b } });
    v.requestMeasure();
    return { ranges: v.state.selection.ranges.map((r: any) => [r.anchor, r.head]), text: v.state.doc.toString() };
  }, VIEW);
  // Off-screen line heights are estimates until measured, so converge on
  // "line 80 is the first visible line" over a few frames.
  await page.evaluate(async (view) => {
    const v = new Function(`return ${view}`)();
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 8; i++) {
      // +1: sub-pixel scrollTop rounding in Gecko/WebKit can otherwise leave line 79 first.
      v.scrollDOM.scrollTop = v.lineBlockAt(v.state.doc.line(80).from).top + 1;
      await frame();
      if (v.state.doc.lineAt(v.lineBlockAtHeight(v.scrollDOM.scrollTop).from).number === 80) break;
    }
  }, VIEW);

  const probe = (): Promise<{ text: string; ranges: number[][]; first: number; visible: boolean }> =>
    page.evaluate((view) => {
      const v = new Function(`return ${view}`)();
      const top = v.scrollDOM.scrollTop;
      const block = v.lineBlockAt(v.state.doc.line(80).from);
      const first = v.state.doc.lineAt(v.lineBlockAtHeight(top).from).number;
      return {
        text: v.state.doc.toString(),
        ranges: v.state.selection.ranges.map((r: any) => [r.anchor, r.head]),
        first,
        visible: block.bottom > top && block.top < top + v.scrollDOM.clientHeight,
      };
    }, VIEW);
  expect((await probe()).first, 'line 80 is first visible before').toBe(80);

  await choose(page, 36);
  await choose(page, 12);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const after = await probe();
  expect(after.text).toBe(before.text);
  expect(after.ranges).toEqual(before.ranges);
  expect(after.visible, 'line 80 is within the viewport').toBe(true);

  // Undo x3 restores the text from before the three edits.
  await page.locator('.cm-content').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+z');
  const undone = await probe();
  expect(undone.text).toBe(original.replace(/# edit \d\n/g, ''));
});

test('VC-1325 (FR-1317): after 14 -> 36 the caret and the gutter are laid out at the new metrics', async ({
  page,
}) => {
  await openPlayground(page);
  await setProgram(page, TWO_HUNDRED);
  await page.evaluate((view) => {
    const v = new Function(`return ${view}`)();
    v.dispatch({ selection: { anchor: v.state.doc.line(150).to } });
    v.focus();
  }, VIEW);
  await choose(page, 36);
  await page.locator('.cm-content').focus();
  // Real Chrome can move the caret to the document start when the content is
  // re-focused; put it back so `x` lands where the test says (not under test).
  await page.evaluate((view) => {
    const v = new Function(`return ${view}`)();
    v.dispatch({ selection: { anchor: v.state.doc.line(150).to } });
  }, VIEW);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.keyboard.type('x');
  const state = await page.evaluate((view) => {
    const v = new Function(`return ${view}`)();
    const head = v.state.selection.main.head;
    const line = v.state.doc.lineAt(head);
    return { char: v.state.doc.sliceString(head - 1, head), line: line.text };
  }, VIEW);
  expect(state.char).toBe('x');
  expect(state.line, JSON.stringify(state)).toMatch(/x$/);

  // Within one animation frame the layers have been re-measured.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const measure = () =>
    page.evaluate(() => {
      const cursor = document.querySelector('.cm-cursor-primary, .cm-cursor') as HTMLElement | null;
      const line = document.querySelector('.cm-line') as HTMLElement;
      const gutters = document.querySelector('.cm-gutters') as HTMLElement;
      const clipped = Array.from(gutters.querySelectorAll('.cm-gutterElement')).filter(
        (el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth,
      ).length;
      return {
        caret: cursor ? cursor.getBoundingClientRect().height : -1,
        line: line.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(line).lineHeight),
        gutterScroll: gutters.scrollWidth,
        gutterClient: gutters.clientWidth,
        clipped,
      };
    });
  const live = await measure();
  // CodeMirror draws the caret at the glyph box (ascent + descent), which is
  // shorter than the line box at every size, 14 px included. So the caret is
  // compared with a page that loaded straight at 36, which needed no
  // re-measure (VC-1325 as worded would fail at the default size too).
  await page.evaluate((k) => localStorage.setItem(k, '36'), KEY);
  await page.reload();
  await page.waitForSelector('.cm-content');
  await page.evaluate((view) => {
    const v = new Function(`return ${view}`)();
    v.dispatch({ selection: { anchor: v.state.doc.line(150).to } });
    v.focus();
  }, VIEW);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const fresh = await measure();
  expect(live.caret).toBeGreaterThan(0);
  expect(Math.abs(live.caret - fresh.caret)).toBeLessThanOrEqual(2);
  expect(Math.abs(live.line - fresh.line)).toBeLessThanOrEqual(2);
  expect(live.caret).toBeLessThanOrEqual(live.line + 2);
  expect(live.gutterScroll).toBeLessThanOrEqual(live.gutterClient);
  expect(live.clipped).toBe(0);
});

test('VC-1310 (FR-1310, BR-1302): a size change dispatches nothing, writes no program, posts nothing, logs nothing', async ({
  page,
}) => {
  await page.addInitScript(
    ({ fontKey }) => {
      const w = window as unknown as { __posts: unknown[]; __sets: string[] };
      w.__posts = [];
      w.__sets = [];
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (...args: unknown[]) {
        w.__posts.push(args[0]);
        return (post as (...a: unknown[]) => void).apply(this, args);
      };
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k !== fontKey) w.__sets.push(k);
        return set.call(this, k, v);
      };
    },
    { fontKey: KEY },
  );
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

  await openPlayground(page);
  await waitForPythonReady(page);
  await setProgram(page, TWO_HUNDRED);
  await page.waitForTimeout(900); // let the autosave debounce settle

  // Count every transaction the view applies from here on. `update` is the
  // single funnel `dispatch` goes through, so this sees them all.
  await page.evaluate((view) => {
    const v = new Function(`return ${view}`)();
    const w = window as unknown as { __updates: number; __posts: unknown[]; __sets: string[] };
    w.__updates = 0;
    const update = v.update.bind(v);
    v.update = (...a: unknown[]) => {
      w.__updates++;
      return update(...a);
    };
    w.__posts.length = 0;
    w.__sets.length = 0;
  }, VIEW);
  logs.length = 0;
  const bytesBefore = {
    program: await storedProgram(page),
    raw: await page.evaluate((k) => localStorage.getItem(k), WORKSPACE_KEY),
    legacy: await page.evaluate((k) => localStorage.getItem(k), PROGRAM_KEY),
  };

  await choose(page, 36);
  await choose(page, 12);
  await page.waitForTimeout(1000); // past the 500 ms autosave debounce

  const seen = await page.evaluate(() => {
    const w = window as unknown as { __updates: number; __posts: unknown[]; __sets: string[] };
    return { updates: w.__updates, posts: w.__posts.length, sets: w.__sets };
  });
  // Zero transactions also means zero autosave and zero lint scheduling: both
  // are driven only by a document-changing transaction.
  expect(seen.updates).toBe(0);
  expect(seen.posts).toBe(0);
  expect(seen.sets).toEqual([]);
  expect(await storedProgram(page)).toBe(bytesBefore.program);
  expect(await page.evaluate((k) => localStorage.getItem(k), WORKSPACE_KEY)).toBe(bytesBefore.raw);
  expect(await page.evaluate((k) => localStorage.getItem(k), PROGRAM_KEY)).toBe(bytesBefore.legacy);
  expect(logs).toEqual([]);
});

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

/** Source text without comments, so a mention in prose is not a string. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .split('<!--')
    .map((part, i) => (i === 0 ? part : part.slice(part.indexOf('-->') + 3)))
    .join('');
}

test('VC-1318 (BR-1306): strings live in format.ts; the menu makes no request and posts no worker message; never disabled', async ({
  page,
}) => {
  const FRAGMENTS = ['Font size', 'remembered', '(default)'];
  const files = readdirSync(SRC, { recursive: true })
    .map(String)
    .filter((f) => /\.ts$/.test(f) && f !== 'format.ts')
    .map((f) => join(SRC, f));
  files.push(join(SRC, '..', 'index.html'));
  for (const file of files) {
    const text = code(file);
    for (const fragment of FRAGMENTS) {
      expect(text.includes(fragment), `${fragment} in ${file}`).toBe(false);
    }
  }
  const format = readFileSync(join(SRC, 'format.ts'), 'utf8');
  for (const needle of ['FONT_SIZE_LABEL', 'FONT_SIZE_NAME', 'FONT_SIZE_ITEM', 'FONT_SIZE_SAVE_FAILED']) {
    expect(format).toContain(needle);
  }

  await page.addInitScript(() => {
    const w = window as unknown as { __posts: unknown[] };
    w.__posts = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (...args: unknown[]) {
      w.__posts.push(args[0]);
      return (post as (...a: unknown[]) => void).apply(this, args);
    };
  });
  await openPlayground(page);
  await waitForPythonReady(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => ((window as unknown as { __posts: unknown[] }).__posts.length = 0));
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await openByClick(page);
  await page.keyboard.press('Escape');
  await openByClick(page);
  await item(page, 20).click();
  await page.waitForTimeout(300);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __posts: unknown[] }).__posts.length)).toBe(0);

  // No `disabled` attribute in any state: idle, running, waiting on input.
  const noDisabled = () => expect(button(page)).not.toHaveAttribute('disabled', /.*/);
  await noDisabled();
  await setProgram(page, 'input("? ")\n');
  await page.locator('#btn-run').click();
  await waitForStdinPrompt(page);
  await noDisabled();
  await page.locator('#btn-stop').click();
});

test('VC-1326 (BR-1306, BR-1303): after exercising the app the origin holds only documented keys', async ({
  page,
}) => {
  await openPlayground(page);
  await waitForPythonReady(page);
  await runProgram(page, 'name = input("n? ")\nprint("hola", name)\n');
  await submitStdin(page, 'Ana');
  await expect.poll(() => page.locator('#console').innerText()).toContain('hola Ana');
  await page.locator('.cm-content').click();
  await page.keyboard.type('# edit');
  await page.click('#layout-vertical');
  await page.click('#layout-horizontal');
  await page.locator('#btn-theme').click();
  await page.locator('#diag-resizer').press('ArrowUp');
  await choose(page, 18);
  await page.waitForTimeout(800);

  const storage = await page.evaluate(async () => ({
    local: Object.keys(window.localStorage).sort(),
    session: Object.keys(window.sessionStorage).sort(),
    cookies: document.cookie,
    databases: (await indexedDB.databases?.())?.map((db) => db.name ?? '') ?? [],
  }));
  const documented = [
    'pyplay.diagnostics-height.v1',
    'pyplay.fontsize.v1',
    'pyplay.layout.v2',
    'pyplay.theme.v1',
    'pyplay.workspace.v1',
  ];
  expect(storage.local).toContain(KEY);
  expect(storage.local.filter((k) => !documented.includes(k))).toEqual([]);
  expect(storage.session).toEqual([]);
  expect(storage.cookies).toBe('');
  expect(storage.databases).toEqual([]);
});

test('VC-1319 (NFR-1301): a selected size is painted within 50 ms with no task over 50 ms', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'NFR-1301 is measured in Chromium');
  await openPlayground(page);
  await waitForPythonReady(page);
  await page.waitForTimeout(500);
  const tasks = await trackLongTasks(page);
  const samples: number[] = [];
  for (const size of [36, 12, 20, 16, 14]) {
    await openByClick(page);
    await tasks.reset();
    // From the selecting event to the next painted frame: rAF fires before the
    // paint, the following message-channel task runs after it.
    await page.evaluate(() => {
      const target = (window as unknown as { __t?: { start: number; end: number } });
      target.__t = { start: 0, end: 0 };
      document.addEventListener(
        'click',
        () => {
          target.__t!.start = performance.now();
          requestAnimationFrame(() => {
            const ch = new MessageChannel();
            ch.port1.onmessage = () => (target.__t!.end = performance.now());
            ch.port2.postMessage(0);
          });
        },
        { capture: true, once: true },
      );
    });
    await item(page, size).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __t: { end: number } }).__t.end))
      .toBeGreaterThan(0);
    const t = await page.evaluate(() => (window as unknown as { __t: { start: number; end: number } }).__t);
    expect(await editorSize(page)).toBe(`${size}px`);
    samples.push(t.end - t.start);
    expect(await tasks.read(), `long tasks at ${size}`).toEqual([]);
  }
  console.log('VC-1319 latency (ms):', samples.map((n) => n.toFixed(1)).join(', '));
  for (const ms of samples) expect(ms).toBeLessThanOrEqual(50);
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`VC-1321 (NFR-1303): ${scheme} palette`, () => {
    test.use({ colorScheme: scheme });

    test(`the button, the open menu, its items and the check mark clear 4.5:1 text and 3:1 non-text — ${scheme}`, async ({
      page,
    }) => {
      await openPlayground(page);
      const text: Sample[] = [{ label: 'font size button label', selector: '#btn-fontsize', prop: 'color' }];
      const nonText: Sample[] = [
        { label: 'font size button border', selector: '#btn-fontsize', prop: 'borderTopColor' },
        { label: 'focus ring (font size button)', selector: '#btn-fontsize', prop: 'outlineColor', focus: true },
      ];
      const measured = [
        ...(await measureContrast(page, text)),
        ...(await measureContrast(page, nonText)),
      ];
      const textCount = text.length;

      // Keyboard modality, so `:focus-visible` is genuinely on the item.
      await button(page).focus();
      await page.keyboard.press('Enter');
      await expect(menu(page)).toBeVisible();
      // 14 is focused *and* checked.
      const open: Sample[] = [
        { label: 'menu item (focused, checked)', selector: '.fontsize-item[aria-checked="true"]', prop: 'color' },
        { label: 'menu item (unchecked)', selector: '.fontsize-item[aria-checked="false"]', prop: 'color' },
      ];
      const openNonText: Sample[] = [
        { label: 'menu border', selector: '#fontsize-menu', prop: 'borderTopColor' },
        { label: 'focus ring (menu item)', selector: '.fontsize-item[aria-checked="true"]', prop: 'outlineColor' },
      ];
      const texts = await measureContrast(page, open);
      const nonTexts = await measureContrast(page, openNonText);
      // Move focus off the checked item: checked but not focused.
      await page.keyboard.press('ArrowDown');
      const checkedIdle = await measureContrast(page, [
        { label: 'menu item (checked, not focused)', selector: '.fontsize-item[aria-checked="true"]', prop: 'color' },
      ]);
      // The check mark is a pseudo-element: it must take the item's colour, so
      // its contrast is the item's, against the item's own background.
      const mark = await page.evaluate(() => {
        const el = document.querySelector('.fontsize-item[aria-checked="true"]')!;
        return {
          mark: getComputedStyle(el, '::before').color,
          item: getComputedStyle(el).color,
          content: getComputedStyle(el, '::before').content,
        };
      });
      expect(mark.content).toContain('✓');
      expect(mark.mark).toBe(mark.item);

      const allText = [...measured.slice(0, textCount), ...texts, ...checkedIdle];
      const allNonText = [
        ...measured.slice(textCount),
        ...nonTexts,
        // the check mark is non-text *and* text-coloured: held to both bounds
        ...checkedIdle.map((m) => ({ ...m, label: 'check mark' })),
      ];
      expect(failures(allText, 4.5)).toEqual([]);
      expect(failures(allNonText, 3)).toEqual([]);
    });
  });
}

test('VC-1324 (acceptance): choose 20 by keyboard, reload at 20 from first paint, choose 14, reload at 14; program untouched', async ({
  page,
}) => {
  await openPlayground(page);
  const outside = ['#console', '#file-pane', '#symbol-pane', '#diagnostics-list', '#stdin-input', '.toolbar'];
  const sample = () =>
    page.evaluate((sels) => sels.map((s) => getComputedStyle(document.querySelector(s)!).fontSize), outside);
  const program = await editorText(page);
  const outsideBefore = await sample();

  // Keyboard only: focus the button, open with Enter, step to 20, select.
  await button(page).focus();
  await page.keyboard.press('Enter');
  await expect(menu(page)).toBeVisible();
  expect(await activeSize(page)).toBe('14');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect(await activeSize(page)).toBe('18');
  await page.keyboard.press('ArrowDown');
  expect(await activeSize(page)).toBe('20');
  await page.keyboard.press('Enter');
  await expect(menu(page)).toBeHidden();
  expect(await editorSize(page)).toBe('20px');
  expect(await editorSize(page, '.cm-gutters')).toBe('20px');
  expect(await sample()).toEqual(outsideBefore);
  expect(await editorText(page)).toBe(program);

  // Reload: 20 px is in place when the editor first exists, label follows.
  await page.reload();
  await page.waitForSelector('.cm-content');
  expect(await editorSize(page)).toBe('20px');
  await expect(button(page)).toHaveText('Font size: 20');
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('20');
  expect(await editorText(page)).toBe(program);

  // Back to the default; the stored value follows and survives a reload.
  await button(page).focus();
  await page.keyboard.press('Enter');
  await expect(menu(page)).toBeVisible();
  expect(await activeSize(page)).toBe('20');
  await item(page, 14).click();
  expect(await editorSize(page)).toBe('14px');
  await page.reload();
  await page.waitForSelector('.cm-content');
  expect(await editorSize(page)).toBe('14px');
  await expect(button(page)).toHaveText('Font size: 14');
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('14');
  expect(await sample()).toEqual(outsideBefore);
  expect(await editorText(page)).toBe(program);
});
