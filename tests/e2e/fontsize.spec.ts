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
 */
import { expect, test, type Page } from '@playwright/test';
import {
  LAYOUT_KEY,
  noticeTexts,
  openPlayground,
  setProgram,
  waitForPythonReady,
  waitForStdinPrompt,
} from './helpers';

const KEY = 'pyplay.fontsize.v1';
const SIZES = [12, 14, 16, 18, 20, 24];

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
    [12, 14, 16, 18, 20, 24].map((n) => {
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
  expect(await activeSize(page)).toBe('24');
  await page.keyboard.press('ArrowDown');
  expect(await activeSize(page)).toBe('24');
  await page.keyboard.press('ArrowUp');
  expect(await activeSize(page)).toBe('20');
  await page.keyboard.press('Enter');
  await expect(menu(page)).toBeHidden();
  expect(await editorSize(page)).toBe('20px');
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

test('VC-1307 (FR-1307): choosing 24 by click and by keyboard applies, closes and refocuses', async ({
  page,
}) => {
  await openPlayground(page);
  const url = page.url();

  await openByClick(page);
  await item(page, 24).click();
  await expect(menu(page)).toBeHidden();
  expect(await editorSize(page)).toBe('24px');
  expect(await editorSize(page, '.cm-gutters')).toBe('24px');
  expect(await activeId(page)).toBe('btn-fontsize');
  await expect(button(page)).toHaveText('Font size: 24');

  await openByClick(page);
  await item(page, 12).click();
  expect(await editorSize(page)).toBe('12px');

  await button(page).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.press(' ');
  await expect(menu(page)).toBeHidden();
  expect(await editorSize(page)).toBe('24px');
  expect(await activeId(page)).toBe('btn-fontsize');
  await expect(button(page)).toHaveText('Font size: 24');
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
  await item(page, 24).click();
  expect(await editorSize(page)).toBe('24px');
  expect(await editorSize(page, '.cm-gutters')).toBe('24px');
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
      localStorage.setItem(key, '24');
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
  expect(probe.insertedVar).toBe('24px');
  expect(probe.insertedSize).toBe('24px');
  await expect(button(page)).toHaveText('Font size: 24');
  expect(await editorSize(page)).toBe('24px');
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
  await item(page, 24).click();
  expect(await editorSize(page)).toBe('24px');
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
  expect(await page.locator('#fontsize-menu [role="menuitemradio"]').count()).toBe(6);
  expect(await menu(page).getAttribute('aria-labelledby')).toBe('btn-fontsize');
});
