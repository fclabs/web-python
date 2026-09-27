/**
 * Spec-03 — the vertical special-character pane.
 *
 * Iteration 1 criteria: VC-301 – VC-306, VC-321, VC-325, VC-331, VC-332.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { failures, measureContrast } from './contrast';
import {
  LAYOUT_KEY,
  consoleText,
  diagnosticEntries,
  editorSnapshot,
  editorText,
  noticeTexts,
  openPlayground,
  programStdout,
  runProgram,
  setCaret,
  setProgram,
  storedProgram,
  submitStdin,
  trackLongTasks,
  typeProgram,
  waitForLinter,
  waitForPythonReady,
  waitForStdinPrompt,
} from './helpers';

/** The repository's `src/` directory — VC-1612 greps the pane's own source. */
const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

/** The 29 values of *Character set*, in table order (FR-305). */
export const SYMBOL_VALUES = [
  '"',
  "'",
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '+',
  '-',
  '*',
  '/',
  '//',
  '%',
  '**',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  ':',
  ',',
  '.',
  '#',
  '_',
  '\\',
  '|',
  '...',
];

/** The five group headings, in order (FR-305). */
export const SYMBOL_HEADINGS = ['Quotes', 'Brackets', 'Operators', 'Punctuation', 'Ellipsis'];

/** The accessible name of every row, in table order (FR-314). */
export const SYMBOL_NAMES = [
  'Double quote',
  'Single quote',
  'Left parenthesis',
  'Right parenthesis',
  'Left square bracket',
  'Right square bracket',
  'Left brace',
  'Right brace',
  'Plus',
  'Minus',
  'Asterisk',
  'Slash',
  'Floor division',
  'Percent',
  'Power',
  'Equal to',
  'Not equal to',
  'Less than',
  'Greater than',
  'Less than or equal to',
  'Greater than or equal to',
  'Colon',
  'Comma',
  'Period',
  'Hash',
  'Underscore',
  'Backslash',
  'Pipe',
  'Ellipsis',
];

/** Open the pane through its toggle, the way a visitor does (FR-302). */
export async function openSymbolPane(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Symbols' }).click();
  await expect(page.locator('#symbol-pane')).toBeVisible();
}

/** The `data-value` of the button that currently holds focus, or ''. */
export async function focusedSymbol(page: Page): Promise<string> {
  return page.evaluate(
    () => (document.activeElement as HTMLElement | null)?.dataset.value ?? '',
  );
}

/**
 * FR-309 / BR-305: the pane is still a live composite widget — exactly one of
 * its buttons is in the tab order, and it is the one focus is on or would
 * return to.
 */
export async function expectPaneNavigable(page: Page): Promise<void> {
  const tabindexes = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('#symbol-pane .symbol')).map(
      (b) => b.tabIndex,
    ),
  );
  expect(tabindexes.filter((t) => t === 0)).toHaveLength(1);
  expect(tabindexes.filter((t) => t === -1)).toHaveLength(28);

  // ...and `ArrowDown` still moves focus between its buttons.
  await page.locator('#symbol-pane .symbol').first().focus();
  await page.keyboard.press('ArrowDown');
  expect(await focusedSymbol(page)).not.toBe('');
  expect(await focusedSymbol(page)).not.toBe('"');
}

/* -------------------------------------------------------------------------
   FR-301 – FR-305, FR-314, FR-315
   ------------------------------------------------------------------------- */

test('VC-301 (FR-301): the toolbar ends with a closed, correctly wired Symbols toggle', async ({
  page,
}) => {
  await openPlayground(page);

  const toggle = page.locator('#btn-symbols');
  await expect(toggle).toHaveText('Symbols');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-controls', 'symbol-pane');

  // It sits immediately before `#btn-theme` (spec-05); `#btn-about` is last
  // (spec-08 amendment). It has no disabled state.
  const wiring = await page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll('.toolbar > button'));
    const toggle = document.getElementById('btn-symbols')!;
    const theme = document.getElementById('btn-theme');
    const about = document.getElementById('btn-about');
    const target = document.getElementById(toggle.getAttribute('aria-controls')!);
    return {
      followedByTheme: toggle.nextElementSibling === theme,
      aboutIsLast: controls[controls.length - 1] === about,
      themeIsLast: controls[controls.length - 1] === theme,
      resolves: target === document.getElementById('symbol-pane'),
      ariaDisabled: toggle.getAttribute('aria-disabled'),
      hidden: (document.getElementById('symbol-pane') as HTMLElement).hidden,
    };
  });
  expect(wiring.followedByTheme).toBe(true);
  expect(wiring.aboutIsLast).toBe(true);
  expect(wiring.themeIsLast).toBe(false);
  expect(wiring.resolves).toBe(true);
  expect(wiring.ariaDisabled).toBeNull();
  expect(wiring.hidden).toBe(true);

  // Neither rendered nor in the accessibility tree while closed.
  await expect(page.locator('#symbol-pane')).toBeHidden();
  await expect(page.getByRole('toolbar', { name: 'Special characters' })).toHaveCount(0);
});

test('VC-302 (FR-302): a pointer activation opens the pane and focuses the first button', async ({
  page,
}) => {
  await openPlayground(page);
  await openSymbolPane(page);

  await expect(page.locator('#btn-symbols')).toHaveAttribute('aria-expanded', 'true');
  expect(await focusedSymbol(page)).toBe('"');
});

test('VC-303 (FR-302, FR-309): Enter and Space both open the pane and focus the first button', async ({
  page,
}) => {
  await openPlayground(page);

  for (const key of ['Enter', 'Space']) {
    await page.locator('#btn-symbols').focus();
    await page.keyboard.press(key);
    await expect(page.locator('#symbol-pane')).toBeVisible();
    await expect(page.locator('#btn-symbols')).toHaveAttribute('aria-expanded', 'true');
    expect(await focusedSymbol(page), `after ${key}`).toBe('"');

    // Back to closed for the next key, through the toggle (FR-303).
    await page.locator('#btn-symbols').click();
    await expect(page.locator('#symbol-pane')).toBeHidden();
  }
});

test('VC-304 (FR-303): the toggle closes the pane and takes focus back', async ({ page }) => {
  await openPlayground(page);
  await openSymbolPane(page);

  await page.locator('#btn-symbols').click();

  await expect(page.locator('#symbol-pane')).toBeHidden();
  await expect(page.locator('#btn-symbols')).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('btn-symbols');
});

test('VC-305 (FR-304): Escape from inside the pane closes it and returns focus', async ({
  page,
}) => {
  await openPlayground(page);
  await openSymbolPane(page);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');

  await expect(page.locator('#symbol-pane')).toBeHidden();
  await expect(page.locator('#btn-symbols')).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('btn-symbols');
});

test('VC-306 (FR-305, BR-302): 29 buttons and five headings, in table order', async ({ page }) => {
  await openPlayground(page);
  await openSymbolPane(page);

  const rendered = await page.evaluate(() => ({
    values: Array.from(document.querySelectorAll<HTMLElement>('#symbol-pane .symbol')).map(
      (b) => b.dataset.value ?? '',
    ),
    headings: Array.from(
      document.querySelectorAll('#symbol-pane .symbol-group-title'),
    ).map((h) => h.textContent ?? ''),
  }));

  expect(rendered.values).toEqual(SYMBOL_VALUES);
  expect(rendered.headings).toEqual(SYMBOL_HEADINGS);
});

test('VC-321 (FR-314, FR-315): every button carries its name, title and glyph', async ({
  page,
}) => {
  await openPlayground(page);
  await openSymbolPane(page);

  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('#symbol-pane .symbol')).map((b) => ({
      value: b.dataset.value ?? '',
      label: b.getAttribute('aria-label') ?? '',
      title: b.getAttribute('title') ?? '',
      text: b.textContent ?? '',
    })),
  );

  expect(rows).toHaveLength(29);
  rows.forEach((row, i) => {
    expect(row.value, `row ${i + 1} value`).toBe(SYMBOL_VALUES[i]);
    expect(row.label, `row ${i + 1} accessible name`).toBe(SYMBOL_NAMES[i]);
    expect(row.title, `row ${i + 1} title`).toBe(SYMBOL_NAMES[i]);
    // FR-314: the visible label is the glyph, which for every row equals the
    // value — including `...`, which is never the single code point U+2026.
    expect(row.text, `row ${i + 1} glyph`).toBe(SYMBOL_VALUES[i]);
  });

  // The accessible name really is the row's name, not the punctuation.
  await expect(page.getByRole('button', { name: 'Floor division', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Pipe', exact: true })).toHaveCount(1);
});

test('VC-325 (BR-302): the compiled character set holds no Python look-alike', async ({ page }) => {
  await openPlayground(page);
  await openSymbolPane(page);

  const points = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('#symbol-pane .symbol'))
      .flatMap((b) => [...(b.dataset.value ?? ''), ...(b.textContent ?? '')])
      .map((c) => c.codePointAt(0) ?? 0),
  );

  // Curly quotes, mathematical look-alikes and full-width parentheses.
  for (const bad of [0x2018, 0x2019, 0x201c, 0x201d, 0x2264, 0x2265, 0x2260, 0x00d7, 0x00f7, 0xff08, 0xff09]) {
    expect(points, `U+${bad.toString(16).toUpperCase()}`).not.toContain(bad);
  }
  // No emoji or other supplementary-plane glyph.
  expect(points.filter((p) => p >= 0x1f000)).toEqual([]);
  // Nothing outside printable ASCII at all, which subsumes the list above.
  expect(points.filter((p) => p < 0x21 || p > 0x7e)).toEqual([]);
});

/* -------------------------------------------------------------------------
   FR-317 — the pane's position in the document
   ------------------------------------------------------------------------- */

for (const viewport of [
  { width: 375, height: 667 },
  { width: 1280, height: 800 },
]) {
  test(`VC-331 (FR-317): the sibling chain is identical at ${viewport.width} px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openPlayground(page);
    await openSymbolPane(page);

    const chain = await page.evaluate(() => {
      const notices = document.getElementById('notices')!;
      const pane = document.getElementById('symbol-pane')!;
      return {
        afterNotices: notices.nextElementSibling?.id ?? '',
        afterPane: pane.nextElementSibling?.className ?? '',
      };
    });

    expect(chain.afterNotices).toBe('symbol-pane');
    expect(chain.afterPane).toContain('panel--console');
  });
}

/* -------------------------------------------------------------------------
   FR-318 — the pane closes only two ways
   ------------------------------------------------------------------------- */

test('VC-332 (FR-318): nothing but the toggle and Escape dismisses the pane', async ({ page }) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  await waitForPythonReady(page);
  await waitForLinter(page);
  await openSymbolPane(page);

  const pane = page.locator('#symbol-pane');
  const scrollTop = async (): Promise<number> =>
    page.evaluate(() => document.getElementById('symbol-pane')!.scrollTop);
  const before = await scrollTop();

  /** After every one of FR-318's events the pane is untouched. */
  const stillOpen = async (what: string): Promise<void> => {
    await expect(pane, what).toBeVisible();
    await expect(page.locator('#btn-symbols'), what).toHaveAttribute('aria-expanded', 'true');
    expect(await scrollTop(), what).toBe(before);
    await expectPaneNavigable(page);
  };

  // The visitor clicks the editor and types.
  await page.locator('.cm-content').click();
  await page.keyboard.type('x = 1');
  await stillOpen('after editing');

  // Focus leaves the pane by Tab.
  await page.locator('#symbol-pane .symbol').first().focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await stillOpen('after Tab-out');

  // A click on the page background.
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await stillOpen('after a background click');

  for (const name of ['Copy output', 'Clear console', 'Copy code', 'Format']) {
    await page.getByRole('button', { name }).click();
    await stillOpen(`after ${name}`);
  }

  // Run, then Stop. A runaway loop keeps the program alive long enough for
  // Stop to be genuinely enabled while the pane is inspected.
  await setProgram(page, 'while True: pass\n');
  await stillOpen('after replacing the program');
  await page.locator('#btn-run').click();
  await stillOpen('after Run');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(() => consoleText(page), { timeout: 15_000 }).toContain('Program stopped.');
  await stillOpen('after Stop');
});

/* -------------------------------------------------------------------------
   FR-311 / NFR-301 — the two layouts
   ------------------------------------------------------------------------- */

/** The geometry FR-311 constrains, measured on the rendered page. */
async function layout(page: Page): Promise<{
  pane: DOMRect;
  editor: DOMRect;
  /** `.app`'s content width — what "the app content width" means in VC-319. */
  appContentWidth: number;
  scrollWidth: number;
  paneScrolls: boolean;
}> {
  return page.evaluate(() => {
    const rect = (selector: string): DOMRect =>
      document.querySelector(selector)!.getBoundingClientRect().toJSON() as DOMRect;
    const pane = document.getElementById('symbol-pane')!;
    const app = document.querySelector('.app')!;
    const appStyle = getComputedStyle(app);
    return {
      pane: rect('#symbol-pane'),
      editor: rect('.panel--editor'),
      appContentWidth:
        app.clientWidth -
        Number.parseFloat(appStyle.paddingLeft) -
        Number.parseFloat(appStyle.paddingRight),
      scrollWidth: document.documentElement.scrollWidth,
      paneScrolls: pane.scrollHeight > pane.clientHeight,
    };
  });
}

test.describe('wide layout', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('VC-318 (FR-311): the pane docks as an inline-end column', async ({ page }) => {
    await openPlayground(page);
    await openSymbolPane(page);

    const { pane, editor } = await layout(page);

    expect(pane.x, 'pane starts at or after the editor panel’s inline-end edge').toBeGreaterThanOrEqual(
      editor.x + editor.width - 1,
    );
    expect(pane.width, 'pane inline size').toBeGreaterThanOrEqual(44);
    expect(pane.width, 'pane inline size').toBeLessThanOrEqual(96);
    expect(pane.height, 'pane block size vs the editor panel').toBeGreaterThanOrEqual(
      editor.height - 1,
    );

    // FR-309: one button per visual row, so ArrowRight/ArrowLeft cannot move.
    const rows = await page.evaluate(() => {
      const tops = Array.from(document.querySelectorAll('#symbol-pane .symbol')).map(
        (b) => Math.round(b.getBoundingClientRect().top),
      );
      return new Set(tops).size;
    });
    expect(rows, 'distinct visual rows in the wide layout').toBe(29);

    await expect(page.locator('#symbol-pane')).toHaveAttribute('aria-orientation', 'vertical');
  });
});

test.describe('narrow layout', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('VC-319 (FR-311, FR-047, NFR-301): a full-width band that scrolls itself', async ({
    page,
  }) => {
    await openPlayground(page);
    await openSymbolPane(page);

    const { pane, editor, appContentWidth, scrollWidth, paneScrolls } = await layout(page);

    expect(scrollWidth, 'no horizontal page scrolling').toBeLessThanOrEqual(375);
    expect(pane.y, 'pane sits above the editor').toBeLessThan(editor.y);
    expect(pane.width, 'pane spans the app content width').toBeCloseTo(appContentWidth, 0);

    // Every button is inside the pane's scrollable content and big enough to
    // hit; the pane scrolls, the page does not.
    const buttons = await page.evaluate(() => {
      const pane = document.getElementById('symbol-pane')!;
      const box = pane.getBoundingClientRect();
      return Array.from(document.querySelectorAll('#symbol-pane .symbol')).map((b) => {
        const r = b.getBoundingClientRect();
        return { w: r.width, h: r.height, left: r.left - box.left, right: box.right - r.right };
      });
    });
    expect(buttons).toHaveLength(29);
    for (const [i, b] of buttons.entries()) {
      expect(b.w, `button ${i + 1} width`).toBeGreaterThanOrEqual(32);
      expect(b.h, `button ${i + 1} height`).toBeGreaterThanOrEqual(32);
      expect(b.left, `button ${i + 1} clipped at the pane’s inline start`).toBeGreaterThanOrEqual(-1);
      expect(b.right, `button ${i + 1} clipped at the pane’s inline end`).toBeGreaterThanOrEqual(-1);
    }
    expect(paneScrolls, 'the pane scrolls within its own bounds').toBe(true);

    // Scrolling the pane alone brings the last button into view.
    await page.evaluate(() => {
      const pane = document.getElementById('symbol-pane')!;
      pane.scrollTop = pane.scrollHeight;
    });
    const lastVisible = await page.evaluate(() => {
      const pane = document.getElementById('symbol-pane')!.getBoundingClientRect();
      const all = document.querySelectorAll('#symbol-pane .symbol');
      const last = all[all.length - 1]!.getBoundingClientRect();
      return last.top >= pane.top - 1 && last.bottom <= pane.bottom + 1;
    });
    expect(lastVisible, 'the last button is reachable by pane-only scrolling').toBe(true);

    await expect(page.locator('#symbol-pane')).toHaveAttribute('aria-orientation', 'horizontal');
  });
});

test('VC-330 (FR-311): the 700/699 px boundary flips the layout', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await openPlayground(page);
  await openSymbolPane(page);

  {
    const { pane, editor, scrollWidth } = await layout(page);
    expect(pane.x, '700 px: pane after the editor').toBeGreaterThanOrEqual(
      editor.x + editor.width - 1,
    );
    expect(pane.width, '700 px: pane inline size').toBeGreaterThanOrEqual(44);
    expect(pane.width, '700 px: pane inline size').toBeLessThanOrEqual(96);
    expect(scrollWidth, '700 px: no horizontal page scrolling').toBeLessThanOrEqual(700);
  }

  await page.setViewportSize({ width: 699, height: 800 });
  {
    const { pane, editor, appContentWidth, scrollWidth } = await layout(page);
    expect(pane.y, '699 px: pane above the editor').toBeLessThan(editor.y);
    expect(pane.width, '699 px: pane spans the app content width').toBeCloseTo(appContentWidth, 0);
    expect(scrollWidth, '699 px: no horizontal page scrolling').toBeLessThanOrEqual(699);
  }
});

test('A-305: the multi-character glyphs render as literal characters', async ({ page }) => {
  await openPlayground(page);
  await openSymbolPane(page);

  const rendered = await page.evaluate(() =>
    ['//', '**', '==', '!=', '<=', '>=', '...'].map((value) => {
      const button = document.querySelector<HTMLElement>(
        `#symbol-pane .symbol[data-value="${CSS.escape(value)}"]`,
      )!;
      return {
        value,
        text: button.textContent ?? '',
        ligatures: getComputedStyle(button).fontVariantLigatures,
        width: button.getBoundingClientRect().width,
      };
    }),
  );

  for (const row of rendered) {
    expect(row.text, `${row.value} text`).toBe(row.value);
    expect(row.ligatures, `${row.value} ligatures`).toBe('none');
    expect(row.width, `${row.value} rendered width`).toBeGreaterThan(0);
  }
});

/* -------------------------------------------------------------------------
   FR-1601, FR-1609 — inserting and its feedback

   spec-16 supersedes spec-03's clipboard path: FR-306 – FR-308, FR-313 and
   FR-316 are retired together with the criteria that verified them. VC-307
   and VC-308 are rewritten here against the insertion behaviour; spec-03's
   Enter/Space copy criterion is folded into VC-1604 further down the file.
   ------------------------------------------------------------------------- */

/** The pane's `role="status"` text (FR-1609). */
async function symbolStatus(page: Page): Promise<string> {
  return page.evaluate(() => document.getElementById('symbol-status')?.textContent ?? '');
}

/**
 * The pane button for `value`, addressed by the value it inserts. Every value
 * is printable ASCII (VC-325), so escaping `\` and `"` is enough to make a
 * valid attribute selector.
 */
function symbolButton(page: Page, value: string) {
  const escaped = value.replace(/([\\"])/g, '\\$1');
  return page.locator(`#symbol-pane .symbol[data-value="${escaped}"]`);
}

/**
 * Count the document-changing transactions the live view receives, by wrapping
 * `view.dispatch` in the page (FR-1601: *no other transaction is dispatched*).
 * Only a dispatch that actually moves the document is counted, so the lint
 * pass — which dispatches diagnostics, never a change — cannot inflate it.
 */
async function trackDocChanges(page: Page): Promise<{
  reset: () => Promise<void>;
  read: () => Promise<number>;
}> {
  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & { cmView?: { view: unknown }; cmTile?: { view: unknown } })
      | null;
    const view = (content?.cmTile?.view ?? content?.cmView?.view) as
      | { dispatch: (...args: unknown[]) => void; state: { doc: { toString(): string } } }
      | undefined;
    if (!view) throw new Error('CodeMirror view not found');
    const box = window as unknown as { __docChanges: number };
    box.__docChanges = 0;
    const original = view.dispatch.bind(view);
    view.dispatch = (...args: unknown[]): void => {
      const before = view.state.doc.toString();
      original(...args);
      if (view.state.doc.toString() !== before) box.__docChanges++;
    };
  });
  return {
    reset: () =>
      page.evaluate(() => {
        (window as unknown as { __docChanges: number }).__docChanges = 0;
      }),
    read: () => page.evaluate(() => (window as unknown as { __docChanges: number }).__docChanges),
  };
}

test('VC-307 (FR-1601, BR-1601): the editor moves exactly once per activation, for all 29 values', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  await setProgram(page, 'x = 1\ny = 2\n');
  await setCaret(page, 2, 3); // offset 8 — between `y ` and `= 2`
  await openSymbolPane(page);

  const changes = await trackDocChanges(page);
  const start = (await editorSnapshot(page)).from;

  let inserted = '';
  for (const value of SYMBOL_VALUES) {
    await changes.reset();
    await symbolButton(page, value).click();
    // FR-1601 / BR-1602: one dispatch, carrying the change and the selection.
    await expect.poll(() => changes.read(), { timeout: 2_000 }).toBe(1);

    inserted += value;
    const snapshot = await editorSnapshot(page);
    expect(snapshot.text, `document after ${value}`).toBe(`x = 1\ny ${inserted}= 2\n`);
    expect(snapshot.from, `caret after ${value}`).toBe(start + inserted.length);
    expect(snapshot.to, `collapsed after ${value}`).toBe(start + inserted.length);
  }

  // Nothing outside the insertion point moved, in 29 activations.
  expect(await editorText(page)).toBe(`x = 1\ny ${SYMBOL_VALUES.join('')}= 2\n`);
});

test('VC-308 (FR-1601, FR-1603): `**` inserts as exactly two characters, in one undo step', async ({
  page,
}) => {
  await openPlayground(page);
  await setProgram(page, 'x = 1\n');
  await setCaret(page, 1, 6); // end of `x = 1`
  await openSymbolPane(page);

  await symbolButton(page, '**').click();
  await expect(page.locator('#symbol-status')).toHaveText('Inserted **');

  // FR-1602: both characters land, and only those two.
  const after = await editorSnapshot(page);
  expect(after.text).toBe('x = 1**\n');
  expect(after.from, 'caret immediately after the two characters').toBe(7);

  // FR-1603: one undo removes the pair, not one character of it.
  await focusEditor(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => editorText(page)).toBe('x = 1\n');
});

/* -------------------------------------------------------------------------
   FR-309 — keyboard navigation
   ------------------------------------------------------------------------- */

test.describe('wide layout keyboard model', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('VC-313 (FR-309, BR-305): one tab stop, and one button per visual row', async ({ page }) => {
    await openPlayground(page);
    await openSymbolPane(page);

    expect(await focusedSymbol(page)).toBe('"');
    // Exactly one button is in the tab order (the helper also moves focus, so
    // `Home` puts it back at the start before the walk).
    await expectPaneNavigable(page);
    await page.keyboard.press('Home');
    expect(await focusedSymbol(page)).toBe('"');

    // 28 ArrowDown presses walk the whole set in Character set order.
    for (let i = 1; i < 29; i++) {
      await page.keyboard.press('ArrowDown');
      expect(await focusedSymbol(page), `after ${i} ArrowDown presses`).toBe(SYMBOL_VALUES[i]);
    }
    await page.keyboard.press('ArrowDown');
    expect(await focusedSymbol(page), 'no wrap at the end').toBe('...');

    await page.keyboard.press('Home');
    expect(await focusedSymbol(page)).toBe('"');
    await page.keyboard.press('End');
    expect(await focusedSymbol(page)).toBe('...');

    await page.keyboard.press('ArrowUp');
    expect(await focusedSymbol(page)).toBe('|');

    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowUp');
    expect(await focusedSymbol(page), 'no wrap at the start').toBe('"');

    // One button per visual row, so the row-wise keys cannot move focus.
    await page.keyboard.press('ArrowRight');
    expect(await focusedSymbol(page)).toBe('"');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedSymbol(page)).toBe('"');

    // The roving tabindex followed focus, and there is still exactly one.
    await page.keyboard.press('End');
    expect(
      await page.evaluate(
        () =>
          document.querySelector<HTMLElement>('#symbol-pane .symbol[tabindex="0"]')?.dataset
            .value ?? '',
      ),
    ).toBe('...');
    await expectPaneNavigable(page);
  });

  test('VC-315 (FR-049, BR-305): the pane contributes exactly one tab stop', async ({ page }) => {
    await openPlayground(page);
    await openSymbolPane(page);

    // Start the traversal from the very top of the document, as a fresh page
    // load does. Blurring alone leaves the sequential starting point where it
    // was; a click on the page background moves it (and, per FR-318, leaves
    // the pane open).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const visited: string[] = [];
    // About, Output, and optional separators under vertical (≥900) need headroom.
    const tabBudget = 28;
    for (let i = 0; i < tabBudget; i++) {
      await page.keyboard.press('Tab');
      const target = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return '';
          if (el.classList.contains('symbol')) return 'pane';
          if (el.classList.contains('cm-content')) return 'editor';
          if (el.classList.contains('file-tree-button')) return 'file-tree';
          // spec-04 FR-405: the layout radiogroup is one tab stop, whichever
          // of its two radios currently holds the roving `tabindex="0"`.
          if (el.closest('#layout-group')) return 'layout';
          return el.id ? `#${el.id}` : el.tagName.toLowerCase();
        });
      // FR-1405: count one full traversal, not a partial second lap.
      if (target === '#btn-run' && visited.length > 0) break;
      visited.push(target);
      // Issue #31: use CodeMirror's keyboard escape after reaching the editor.
      if (target === 'editor') await page.keyboard.press('Control+m');
    }

    expect(visited.filter((id) => id === 'pane')).toHaveLength(1);
    // spec-04 VC-407: the layout group contributes exactly one tab stop.
    expect(visited.filter((id) => id === 'layout')).toHaveLength(1);
    // The files pane is open by default at this width (`FilePane`'s
    // `syncLayout`); its own DOM position (after Diagnostics, per FR-317 and
    // FR-410's fixed runs) puts its tab stops after the editor/stdin group.
    // Vertical ≥ 900 inserts `#diag-resizer` between editor and stdin (FR-913).
    const diagResizerVisible = await page.locator('#diag-resizer').isVisible();
    const outputResizerVisible = await page.locator('#output-resizer').isVisible();
    const consoleResizerVisible = await page.locator('#console-resizer').isVisible();
    const afterEditor = [
      ...(outputResizerVisible ? (['#output-resizer'] as const) : []),
      ...(diagResizerVisible ? (['#diag-resizer'] as const) : []),
      '#stdin-input',
      '#btn-eof',
    ];
    const expected = [
      '#btn-run',
      '#btn-stop',
      '#btn-reset',
      // spec-04 FR-401: immediately after `Reset`, before `Symbols`.
      'layout',
      '#btn-files',
      '#btn-output',
      '#btn-symbols',
      '#btn-theme',
      // spec-08 FR-801: About is last toolbar control after theme.
      '#btn-about',
      'pane',
      '#btn-clear',
      '#btn-copy-output',
      ...(consoleResizerVisible ? (['#console-resizer'] as const) : []),
      '#btn-copy',
      '#btn-format',
      'editor',
      ...afterEditor,
      '#btn-file-new',
      '#btn-file-rename',
      '#btn-file-delete',
      'file-tree',
      '#file-resizer',
    ];
    expect(visited.slice(0, expected.length)).toEqual(expected);
  });

  /*
   * spec-03's Enter/Space *copy* criterion is folded into VC-1604, which
   * asserts that the pointer, `Enter` and `Space` paths produce an identical
   * document, caret and `Inserted V` (spec-16, *Existing criteria: re-run,
   * rewritten, retired*).
   */
});

test.describe('narrow layout keyboard model', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('VC-329 (FR-309, FR-311): row-wise and column-wise moves over the rendered grid', async ({
    page,
  }) => {
    await openPlayground(page);
    await openSymbolPane(page);

    /** The rendered visual rows, as values, derived exactly as FR-309 says. */
    const rows: string[][] = await page.evaluate(() => {
      const out: { top: number; values: string[] }[] = [];
      for (const button of document.querySelectorAll<HTMLElement>('#symbol-pane .symbol')) {
        const top = button.getBoundingClientRect().top;
        const row = out.find((candidate) => Math.abs(candidate.top - top) <= 2);
        if (row) row.values.push(button.dataset.value ?? '');
        else out.push({ top, values: [button.dataset.value ?? ''] });
      }
      return out.sort((a, b) => a.top - b.top).map((row) => row.values);
    });

    expect(rows.length, 'the narrow layout wraps into several rows').toBeGreaterThan(1);
    expect(rows.flat()).toEqual(SYMBOL_VALUES);

    /** Focus the button for `value` without going through the arrow keys. */
    const focus = async (value: string): Promise<void> => {
      await symbolButton(page, value).focus();
    };

    const secondRow = rows[1]!;
    await focus(secondRow[0]!);
    await page.keyboard.press('ArrowLeft');
    expect(await focusedSymbol(page), 'no wrap at a row’s start').toBe(secondRow[0]);

    await page.keyboard.press('ArrowRight');
    expect(await focusedSymbol(page)).toBe(secondRow[1]);

    await focus(secondRow[0]!);
    await page.keyboard.press('ArrowUp');
    expect(await focusedSymbol(page), 'ArrowUp keeps the column index').toBe(rows[0]![0]);

    const lastOfSecond = secondRow[secondRow.length - 1]!;
    await focus(lastOfSecond);
    await page.keyboard.press('ArrowRight');
    expect(await focusedSymbol(page), 'no wrap at a row’s end').toBe(lastOfSecond);

    // A column index past the next row's length clamps to that row's last
    // button rather than moving nowhere.
    const short = rows.findIndex(
      (row, i) => i > 0 && rows[i - 1] !== undefined && row.length < rows[i - 1]!.length,
    );
    expect(short, 'the narrow layout has a shorter row to clamp into').toBeGreaterThan(0);
    const above = rows[short - 1]!;
    await focus(above[above.length - 1]!);
    await page.keyboard.press('ArrowDown');
    expect(await focusedSymbol(page), 'ArrowDown clamps to the shorter row’s last button').toBe(
      rows[short]![rows[short]!.length - 1],
    );

    await page.keyboard.press('Home');
    expect(await focusedSymbol(page)).toBe('"');
    await page.keyboard.press('End');
    expect(await focusedSymbol(page)).toBe('...');
  });
});

/* -------------------------------------------------------------------------
   FR-310 — the pane never reaches a running program
   ------------------------------------------------------------------------- */

test('VC-316 / VC-1606, VC-1607 (FR-310, FR-1607, FR-1606): a mid-run activation is inert unless a read is pending, and interrupts nothing either way', async ({
  page,
}) => {
  test.setTimeout(240_000);

  await openPlayground(page);
  await waitForPythonReady(page);
  await runProgram(page, 'import time\nfor i in range(20):\n    print(i)\n    time.sleep(0.2)\n');

  const run = page.locator('#btn-run');
  const stop = page.getByRole('button', { name: 'Stop' });
  await expect(stop).toBeEnabled();
  await expect(run).toBeDisabled();

  // Sample the two controls continuously while the pane is used.
  const states: string[] = [];
  const sample = async (): Promise<void> => {
    states.push(
      await page.evaluate(
        () =>
          `${document.getElementById('btn-run')!.getAttribute('aria-disabled')}/` +
          `${document.getElementById('btn-stop')!.getAttribute('aria-disabled')}`,
      ),
    );
  };

  await sample();
  await openSymbolPane(page);
  await sample();

  // FR-1607 (VC-1606): a running program with *no* pending read resolves no
  // live target, so every button is inert and every activation path no-ops.
  await expectPaneLocked(page, 'mid-run, no pending read');
  await expectInertActivationsDoNothing(page, 'mid-run, no pending read');
  await sample();

  await page.getByRole('button', { name: 'Symbols' }).click();
  await expect(page.locator('#symbol-pane')).toBeHidden();
  await sample();

  expect(new Set(states), 'Run stayed disabled and Stop stayed enabled').toEqual(
    new Set(['true/false']),
  );

  await expect
    .poll(() => consoleText(page), { timeout: 60_000 })
    .toMatch(/Program finished in \d+\.\d{2} s/);

  // The program was neither interrupted nor restarted: 0–19, in order, once.
  expect(await programStdout(page)).toBe(
    Array.from({ length: 20 }, (_, i) => `${i}\n`).join(''),
  );

  /*
   * ...and the other half of FR-310 under spec-16 (VC-1607): with a read
   * pending the buttons are live, so the activation inserts — and that still
   * interrupts nothing. Run stays disabled, Stop stays enabled, and the read
   * that was pending is the one that is answered.
   */
  await page.getByRole('button', { name: 'Clear console' }).click();
  await runProgram(page, 'value = input()\nprint("[" + value + "]")\n');
  await waitForStdinPrompt(page);
  await openSymbolPane(page);

  const duringRead: string[] = [];
  const sampleRead = async (): Promise<void> => {
    duringRead.push(
      await page.evaluate(
        () =>
          `${document.getElementById('btn-run')!.getAttribute('aria-disabled')}/` +
          `${document.getElementById('btn-stop')!.getAttribute('aria-disabled')}`,
      ),
    );
  };

  await sampleRead();
  await symbolButton(page, '%').click();
  await expect(page.locator('#symbol-status')).toHaveText('Inserted %');
  await expect(page.locator('#stdin-input')).toHaveValue('%');
  await sampleRead();

  expect(new Set(duringRead), 'the insertion did not touch Run or Stop').toEqual(
    new Set(['true/false']),
  );

  await page.locator('#stdin-input').press('Enter');
  await expect.poll(() => programStdout(page), { timeout: 30_000 }).toContain('[%]');
});

test('VC-317 (FR-310, FR-1606): an activation while a read is pending reaches the field, not the run', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  await waitForPythonReady(page);
  await runProgram(page, 'x = input("? ")\nprint(x)\n');
  await waitForStdinPrompt(page);

  const stdinEnabled = async (): Promise<boolean> =>
    page.evaluate(
      () => document.getElementById('stdin-input')!.getAttribute('aria-disabled') !== 'true',
    );

  expect(await stdinEnabled()).toBe(true);
  await openSymbolPane(page);
  expect(await stdinEnabled()).toBe(true);

  /*
   * spec-16 FR-1606 inverts spec-03's original criterion: a pending read *is*
   * a live target, so the pane now deliberately writes into the field. What
   * FR-310 still guarantees is that it interrupts nothing — the field stays
   * live, the run is not restarted, and the read that was pending is the one
   * that gets answered, with the inserted character in the middle of it.
   */
  await page.locator('#stdin-input').fill('a');
  await symbolButton(page, ',').click();
  await expect(page.locator('#symbol-status')).toHaveText('Inserted ,');
  await expect(page.locator('#stdin-input')).toHaveValue('a,');
  expect(await stdinEnabled()).toBe(true);

  // Focusing the field resets its selection to offset 0 (the field was
  // written to while unfocused), so the caret is moved to the end explicitly.
  await page.locator('#stdin-input').press('End');
  await page.locator('#stdin-input').press('b');
  await expect(page.locator('#stdin-input')).toHaveValue('a,b');
  await page.locator('#stdin-input').press('Enter');
  await expect.poll(() => programStdout(page), { timeout: 30_000 }).toBe('a,b\n');
});

/* -------------------------------------------------------------------------
   FR-312 / BR-304 — the pane persists nothing
   ------------------------------------------------------------------------- */

/** Everything spec-01's *Persisted state* table says the origin may hold. */
async function storageSnapshot(page: Page): Promise<{
  local: Record<string, string>;
  session: Record<string, string>;
  cookie: string;
  databases: string[];
}> {
  return page.evaluate(async () => {
    const dump = (store: Storage): Record<string, string> => {
      const out: Record<string, string> = {};
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i)!;
        out[key] = store.getItem(key) ?? '';
      }
      return out;
    };
    const databases = (await indexedDB.databases()).map((db) => db.name ?? '').sort();
    return {
      local: dump(window.localStorage),
      session: dump(window.sessionStorage),
      cookie: document.cookie,
      databases,
    };
  });
}

test('VC-320 (FR-312, BR-304, FR-1611): inserting persists nothing of the pane’s, and a reload closes it', async ({
  page,
}) => {
  await openPlayground(page);

  // The autosave key only exists once the visitor has edited, and VC-320 names
  // it as the one key that may be there.
  await typeProgram(page, 'print("hi")');
  await expect.poll(() => storedProgram(page)).toBe('print("hi")');

  /*
   * The keys that may legitimately be present: the workspace autosave key,
   * spec-05's `pyplay.theme.v1`, and — under a spec-04 VC-433 run, which loads
   * the parent suites with the layout preference pre-seeded — spec-04's
   * `pyplay.layout.v2`. None is the pane's; what VC-320 asserts is that *the
   * pane* writes nothing of its own, which is the comparisons below, plus the
   * absence of any key outside this set.
   */
  const ALLOWED_KEYS = ['pyplay.layout.v2', 'pyplay.workspace.v1', 'pyplay.theme.v1'];
  const unexpectedKeys = (snapshot: { local: Record<string, string> }): string[] =>
    Object.keys(snapshot.local).filter((key) => !ALLOWED_KEYS.includes(key));

  const before = await storageSnapshot(page);
  expect(Object.keys(before.local)).toContain('pyplay.workspace.v1');
  expect(unexpectedKeys(before)).toEqual([]);

  await openSymbolPane(page);
  await symbolButton(page, '_').click();
  await expect(page.locator('#symbol-status')).toHaveText('Inserted _');

  /*
   * spec-16 FR-1611: the inserted character reaches `pyplay.workspace.v1`
   * through the editor's own autosave, exactly as a typed one does, so that
   * one value legitimately changes. BR-304 is about what *the pane* writes:
   * no new key, no session storage, no cookie, no database, and nothing about
   * the pane's own state anywhere.
   */
  await expect.poll(() => storedProgram(page)).toBe('print("hi")_');
  const after = await storageSnapshot(page);
  expect(Object.keys(after.local).sort()).toEqual(Object.keys(before.local).sort());
  expect(unexpectedKeys(after)).toEqual([]);
  expect({ session: after.session, cookie: after.cookie, databases: after.databases }).toEqual({
    session: before.session,
    cookie: before.cookie,
    databases: before.databases,
  });
  for (const key of Object.keys(after.local)) {
    if (key !== 'pyplay.workspace.v1') expect(after.local[key], key).toBe(before.local[key]);
  }

  await page.reload();
  await page.waitForSelector('.cm-content');

  // FR-312: the pane is closed again — its open state was never persisted.
  await expect(page.locator('#symbol-pane')).toBeHidden();
  await expect(page.locator('#btn-symbols')).toHaveAttribute('aria-expanded', 'false');
  expect(unexpectedKeys(await storageSnapshot(page))).toEqual([]);
});

/* -------------------------------------------------------------------------
   spec-16 — FR-1601 – FR-1612: the pane inserts at the caret

   Iteration 2 of the insert-at-caret plan covered the editor target; the stdin
   target and FR-1608's outline are in the Iteration 3 section further down.
   ------------------------------------------------------------------------- */

/** Focus the live CodeMirror view without a pointer, so the selection is kept. */
async function focusEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & { cmView?: { view: { focus(): void } }; cmTile?: { view: { focus(): void } } })
      | null;
    (content?.cmTile?.view ?? content?.cmView?.view)?.focus();
  });
}

/** Put an explicit anchor/head selection on the editor (VC-1602, VC-1605). */
async function setSelection(page: Page, anchor: number, head: number): Promise<void> {
  await page.evaluate(
    ({ anchor, head }) => {
      const content = document.querySelector('.cm-content') as
        | (HTMLElement & { cmView?: { view: unknown }; cmTile?: { view: unknown } })
        | null;
      const view = (content?.cmTile?.view ?? content?.cmView?.view) as
        | { dispatch(spec: unknown): void; focus(): void }
        | undefined;
      if (!view) throw new Error('CodeMirror view not found');
      view.dispatch({ selection: { anchor, head } });
      view.focus();
    },
    { anchor, head },
  );
}

/** The `data-value` of every button in FR-1609's 2 000 ms window. */
async function insertedButtons(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('#symbol-pane .symbol[data-state="inserted"]'),
    ).map((b) => b.dataset.value ?? ''),
  );
}

/** Every character button's inertness, exactly as FR-1607 describes it. */
async function buttonStates(
  page: Page,
): Promise<{ aria: string | null; disabled: boolean; tabIndex: number }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('#symbol-pane .symbol')).map((b) => ({
      aria: b.getAttribute('aria-disabled'),
      disabled: b.hasAttribute('disabled'),
      tabIndex: b.tabIndex,
    })),
  );
}

/**
 * FR-1607: every button inert, none natively `disabled`, the roving tab stop
 * intact — and the one we focus really does take focus.
 */
async function expectPaneLocked(page: Page, what: string): Promise<void> {
  const states = await buttonStates(page);
  expect(states, what).toHaveLength(29);
  expect(
    states.filter((s) => s.aria !== 'true'),
    `${what}: every button aria-disabled`,
  ).toEqual([]);
  expect(
    states.filter((s) => s.disabled),
    `${what}: never the disabled attribute`,
  ).toEqual([]);
  expect(states.filter((s) => s.tabIndex === 0), `${what}: roving tab stop`).toHaveLength(1);

  // Still focusable (FR-049 / FR-1607).
  await symbolButton(page, '#').focus();
  expect(await focusedSymbol(page), `${what}: focusable`).toBe('#');
}

/**
 * FR-1607: a forced pointer click, `Enter` and `Space` on an inert button all
 * no-op. Returns nothing — it asserts the document, the caret and the status
 * region are byte-identical afterwards.
 */
async function expectInertActivationsDoNothing(page: Page, what: string): Promise<void> {
  const before = await editorSnapshot(page);
  const statusBefore = await symbolStatus(page);
  const stateBefore = await insertedButtons(page);

  await symbolButton(page, '#').click({ force: true });
  await symbolButton(page, '#').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');

  expect(await editorSnapshot(page), `${what}: document and caret`).toEqual(before);
  expect(await symbolStatus(page), `${what}: status region`).toBe(statusBefore);
  expect(await insertedButtons(page), `${what}: no new data-state`).toEqual(stateBefore);
}

test('VC-1601 (FR-1601, FR-1612): all 29 values insert at the caret, in table order', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  await setProgram(page, 'ab\n');
  await setCaret(page, 1, 2); // offset 1 — between `a` and `b`
  await openSymbolPane(page);

  let inserted = '';
  for (const value of SYMBOL_VALUES) {
    await symbolButton(page, value).click();
    inserted += value;
    const snapshot = await editorSnapshot(page);
    expect(snapshot.text, `document after ${value}`).toBe(`a${inserted}b\n`);
    // FR-1601: the caret sits immediately after the inserted text.
    expect(snapshot.from, `caret after ${value}`).toBe(1 + inserted.length);
    expect(snapshot.to, `collapsed after ${value}`).toBe(1 + inserted.length);
  }

  // Nothing else changed: the prefix and the suffix are exactly as they were.
  expect(await editorText(page)).toBe(`a${SYMBOL_VALUES.join('')}b\n`);
});

test('VC-1602 (FR-1601): an activation replaces the selection', async ({ page }) => {
  await openPlayground(page);
  await setProgram(page, 'print("x")\n');
  await setSelection(page, 0, 10); // the whole `print("x")` call
  await openSymbolPane(page);

  await symbolButton(page, '#').click();

  const snapshot = await editorSnapshot(page);
  expect(snapshot.text).toBe('#\n');
  expect(snapshot.from).toBe(1);
  expect(snapshot.to).toBe(1);

  // The multi-range leg: the playground never enables
  // `allowMultipleSelections`, so a two-range selection cannot exist here at
  // all. FR-1601 delegates multi-range mapping to `state.replaceSelection`,
  // and that leg is discharged at state level by `tests/unit/insert.test.ts`.
  // Asserted rather than assumed, so the gap stays visible.
  const rangeCount = await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & { cmView?: { view: unknown }; cmTile?: { view: unknown } })
      | null;
    const view = (content?.cmTile?.view ?? content?.cmView?.view) as
      | { state: { selection: { ranges: unknown[] } } }
      | undefined;
    return view?.state.selection.ranges.length ?? 0;
  });
  expect(rangeCount).toBe(1);
});

test('VC-1603 (FR-1602): the insertion is literal — no matched pair, re-indent parity', async ({
  page,
}) => {
  await openPlayground(page);
  await openSymbolPane(page);

  // `(` inserts one character; *typing* `(` in the same editor still pairs.
  await setProgram(page, '\n');
  await setCaret(page, 1, 1);
  await symbolButton(page, '(').click();
  expect(await editorText(page)).toBe('(\n');

  await focusEditor(page);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type('(');
  expect(await editorText(page), 'typing still auto-closes (spec-12 FR-1201)').toBe('()');

  // `...` is three characters, never U+2026.
  await setProgram(page, '\n');
  await setCaret(page, 1, 1);
  await symbolButton(page, '...').click();
  expect(await editorText(page)).toBe('...\n');

  // FR-1602's re-indent parity. `indentOnInput()` is an
  // `EditorState.transactionFilter` gated on `tr.isUserEvent('input.type')`
  // (`@codemirror/language`, `dist/index.js:1188`), which FR-1601 requires the
  // insertion to carry, so it treats the pane and the keyboard identically. A
  // dangling `else` is the line shape its Python rules match.
  const dangling = 'if x:\n    pass\n    else\n';
  const reindented = 'if x:\n    pass\nelse:\n';

  await setProgram(page, dangling);
  await setCaret(page, 3, 9); // end of `    else`
  await symbolButton(page, ':').click();
  expect(await editorText(page), 'the pane re-indents exactly as typing does').toBe(reindented);

  await setProgram(page, dangling);
  await setCaret(page, 3, 9);
  await focusEditor(page);
  await page.keyboard.type(':');
  expect(await editorText(page), 'typing produces the identical result').toBe(reindented);

  // FR-1603: the filter's changes ride in the insertion's own transaction, so
  // the re-indent is still one undo step.
  await setProgram(page, dangling);
  await setCaret(page, 3, 9);
  await symbolButton(page, ':').click();
  expect(await editorText(page)).toBe(reindented);
  await focusEditor(page);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await editorText(page), 'one undo removes the insertion and its re-indent').toBe(
    dangling,
  );
});

test('VC-1604 (FR-1604): pointer, Enter and Space produce the same insertion', async ({ page }) => {
  await openPlayground(page);
  await openSymbolPane(page);

  const results: { text: string; from: number; to: number; status: string }[] = [];
  for (const activate of ['click', 'Enter', 'Space'] as const) {
    await setProgram(page, 'x = 1\n');
    await setCaret(page, 1, 6); // offset 5, end of `x = 1`
    if (activate === 'click') {
      await symbolButton(page, '#').click();
    } else {
      await symbolButton(page, '#').focus();
      await page.keyboard.press(activate);
    }
    const snapshot = await editorSnapshot(page);
    results.push({ ...snapshot, status: await symbolStatus(page) });
  }

  expect(results[0]).toEqual({ text: 'x = 1#\n', from: 6, to: 6, status: 'Inserted #' });
  expect(results[1]).toEqual(results[0]);
  expect(results[2]).toEqual(results[0]);
});

test('VC-1605 (FR-1603, BR-1602): one activation is exactly one undo step', async ({ page }) => {
  await openPlayground(page);
  await openSymbolPane(page);

  // (a) the collapsed-caret case.
  await setProgram(page, 'x = 1\n');
  await setCaret(page, 1, 6);
  const collapsed = await editorSnapshot(page);
  await symbolButton(page, '#').click();
  expect(await editorText(page)).toBe('x = 1#\n');
  await focusEditor(page);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await editorSnapshot(page), 'document and selection restored').toEqual(collapsed);

  // (b) the replaced-selection case: the selected text comes back selected.
  await setProgram(page, 'x = 1\n');
  await setSelection(page, 0, 5);
  const selected = await editorSnapshot(page);
  await symbolButton(page, '_').click();
  expect(await editorText(page)).toBe('_\n');
  await focusEditor(page);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await editorSnapshot(page), 'the replaced selection comes back').toEqual(selected);

  // (c) three activations inside history's 500 ms `newGroupDelay`, dispatched
  // in a single task so the window cannot be missed, are three undo steps in
  // reverse order — `isolateHistory` is what stops them coalescing.
  await setProgram(page, 'x = 1\n');
  await setCaret(page, 1, 6);
  await page.evaluate((values) => {
    for (const value of values) {
      const escaped = value.replace(/([\\"])/g, '\\$1');
      document
        .querySelector<HTMLButtonElement>(`#symbol-pane .symbol[data-value="${escaped}"]`)!
        .click();
    }
  }, ['#', '_', '|']);
  expect(await editorText(page)).toBe('x = 1#_|\n');

  await focusEditor(page);
  for (const expected of ['x = 1#_\n', 'x = 1#\n', 'x = 1\n']) {
    await page.keyboard.press('ControlOrMeta+z');
    expect(await editorText(page)).toBe(expected);
  }
});

test('VC-1606 (FR-1607, BR-1604): a running program with no pending read locks every button', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  await waitForPythonReady(page);
  await openSymbolPane(page);

  // Live before the run.
  expect((await buttonStates(page)).filter((s) => s.aria !== 'false')).toEqual([]);

  await runProgram(page, 'while True: pass\n');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();

  await expectPaneLocked(page, 'while running');
  await expectInertActivationsDoNothing(page, 'while running');
  const whileRunning = await editorText(page);

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('#btn-run')).toBeEnabled({ timeout: 15_000 });

  // FR-1607: leaving the state clears inertness on every button...
  expect((await buttonStates(page)).filter((s) => s.aria !== 'false')).toEqual([]);

  // ...and the same activation now inserts. One undo takes the document back
  // to exactly what it was while the program ran, which is only true if the
  // three inert activations left no history entry behind.
  await setCaret(page, 1, 1);
  await symbolButton(page, '#').click();
  expect(await editorText(page)).toBe(`#${whileRunning}`);
  await focusEditor(page);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await editorText(page)).toBe(whileRunning);
});

test('VC-1606 (FR-1607, BR-1604): a binary active file and no active file both lock the pane', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  await waitForPythonReady(page);
  await runProgram(page, 'from pathlib import Path\nPath("blob.bin").write_bytes(bytes([0, 255, 1]))\n');
  await expect(page.locator('[data-file="blob.bin"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#btn-run')).toBeEnabled({ timeout: 60_000 });

  await openSymbolPane(page);
  expect((await buttonStates(page)).filter((s) => s.aria !== 'false')).toEqual([]);

  // (a) a binary active file.
  await page.locator('[data-file="blob.bin"]').click();
  await expect(page.locator('.cm-content')).toContainText('Binary file: blob.bin');
  await expectPaneLocked(page, 'binary active file');
  await expectInertActivationsDoNothing(page, 'binary active file');

  // Leaving the state makes the same activation insert.
  await page.locator('[data-file="main.py"]').click();
  await expect(page.locator('.cm-content')).not.toContainText('Binary file');
  expect((await buttonStates(page)).filter((s) => s.aria !== 'false')).toEqual([]);
  await setProgram(page, 'x = 1\n');
  await setCaret(page, 1, 6);
  await symbolButton(page, '#').click();
  expect(await editorText(page)).toBe('x = 1#\n');

  // (b) no active file at all — delete every file in the workspace.
  for (const name of ['blob.bin', 'main.py']) {
    await page.locator(`[data-file="${name}"]`).click();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator(`[data-file="${name}"]`)).toHaveCount(0);
  }
  await expectPaneLocked(page, 'no active file');
  await expectInertActivationsDoNothing(page, 'no active file');

  // Creating a file restores a live target.
  await page.getByRole('button', { name: 'New' }).click();
  const nameInput = page.locator('#file-name-input');
  await nameInput.fill('again.py');
  await nameInput.press('Enter');
  await expect(page.locator('[data-file="again.py"]')).toBeVisible();
  expect((await buttonStates(page)).filter((s) => s.aria !== 'false')).toEqual([]);
  await setCaret(page, 1, 1);
  await symbolButton(page, '#').click();
  expect(await editorText(page)).toBe('#');
});

test('VC-1610 (FR-1611): an insertion is autosaved and linted exactly like typed input', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  await waitForLinter(page);
  await setProgram(page, 'x = 1\n');
  await setCaret(page, 1, 6);
  await openSymbolPane(page);

  await symbolButton(page, '#').click();
  expect(await editorText(page)).toBe('x = 1#\n');

  // FR-1611: the editor's existing debounced autosave carries it, with no
  // second path to storage from the pane.
  await expect.poll(() => storedProgram(page), { timeout: 10_000 }).toBe('x = 1#\n');
  await page.reload();
  await page.waitForSelector('.cm-content');
  expect(await editorText(page)).toBe('x = 1#\n');

  // ...and the existing lint schedule runs on it, exactly as it does for a
  // typed character: `(` at the end of the line is a syntax error either way.
  // `**` is used rather than `(` because typing `(` auto-closes it (FR-1602),
  // so the two paths would not be comparing the same document.
  await waitForLinter(page);
  await openSymbolPane(page);
  await setProgram(page, 'x = 1\n');
  await setCaret(page, 1, 6);
  await symbolButton(page, '**').click();
  expect(await editorText(page)).toBe('x = 1**\n');
  await expect.poll(() => diagnosticEntries(page), { timeout: 20_000 }).not.toEqual([]);
  const inserted = await diagnosticEntries(page);

  await setProgram(page, 'x = 1\n');
  await expect.poll(() => diagnosticEntries(page), { timeout: 20_000 }).toEqual([]);
  await setCaret(page, 1, 6);
  await focusEditor(page);
  await page.keyboard.type('**');
  expect(await editorText(page)).toBe('x = 1**\n');
  await expect.poll(() => diagnosticEntries(page), { timeout: 20_000 }).not.toEqual([]);
  expect(await diagnosticEntries(page), 'same diagnostics as typing').toEqual(inserted);
});

test('VC-1611 (FR-1609): `Inserted V` appears at once, moves, restarts and is cleaned up', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  await setProgram(page, 'x = 1\n');
  await setCaret(page, 1, 6);
  await openSymbolPane(page);

  // Synchronous — read with no polling at all, which is stronger than the
  // 100 ms the criterion allows.
  await symbolButton(page, '(').click();
  expect(await symbolStatus(page)).toBe('Inserted (');
  expect(await insertedButtons(page)).toEqual(['(']);

  // COPIED_MS is 2 000 ms: still there just before, gone after.
  await page.waitForTimeout(1_200);
  expect(await symbolStatus(page)).toBe('Inserted (');
  await expect(page.locator('#symbol-status')).toHaveText('', { timeout: 4_000 });
  expect(await insertedButtons(page)).toEqual([]);

  // A second insertion inside the window replaces the text, moves the state
  // and restarts the timer from zero.
  await symbolButton(page, '(').click();
  await page.waitForTimeout(1_200);
  await symbolButton(page, '_').click();
  expect(await symbolStatus(page)).toBe('Inserted _');
  expect(await insertedButtons(page)).toEqual(['_']);
  await page.waitForTimeout(1_200);
  expect(await symbolStatus(page), 'the timer restarted').toBe('Inserted _');

  // Closing the pane mid-window leaves nothing behind.
  await symbolButton(page, '#').click();
  expect(await symbolStatus(page)).toBe('Inserted #');
  await page.getByRole('button', { name: 'Symbols' }).click();
  await expect(page.locator('#symbol-pane')).toBeHidden();
  expect(await symbolStatus(page)).toBe('');
  expect(await insertedButtons(page)).toEqual([]);
});

test('VC-1612 (FR-1610, FR-318, BR-1601): five insertions leave the pane open and focused', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  await setProgram(page, 'x = 1\n');
  await setCaret(page, 1, 6);
  await openSymbolPane(page);

  const scrollTop = async (): Promise<number> =>
    page.evaluate(() => document.getElementById('symbol-pane')!.scrollTop);

  const five = ['(', ')', '#', '_', '...'];
  for (const value of five) await symbolButton(page, value).click();
  expect(await editorText(page)).toBe(`x = 1${five.join('')}\n`);

  // FR-1610: the pane is still open and still scrolled — `...` is the last
  // button of the last group, so reaching it scrolled the pane, and the
  // insertion neither closed it nor reset that scroll.
  await expect(page.locator('#symbol-pane')).toBeVisible();
  await expect(page.locator('#btn-symbols')).toHaveAttribute('aria-expanded', 'true');
  const scrolled = await scrollTop();
  expect(scrolled, 'the pane is genuinely scrolled').toBeGreaterThan(0);
  await symbolButton(page, '...').click();
  expect(await scrollTop(), 'a further insertion does not move the pane').toBe(scrolled);
  expect(await editorText(page)).toBe(`x = 1${five.join('')}...\n`);
  expect(await focusedSymbol(page)).toBe('...');

  // ...and it is the pane's only tab stop, with arrow navigation intact.
  const zeros = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('#symbol-pane .symbol'))
      .filter((b) => b.tabIndex === 0)
      .map((b) => b.dataset.value ?? ''),
  );
  expect(zeros).toEqual(['...']);
  await expectPaneNavigable(page);
});

test('VC-1612 (BR-1601, FR-1610): the pane source holds no dismissal or editor hook', async () => {
  const source = readFileSync(join(SRC_DIR, 'symbol-pane.ts'), 'utf8');

  for (const forbidden of [
    'blur',
    'focusout',
    'pointerdown',
    'mousedown',
    'document.addEventListener',
    'window.addEventListener',
    '@codemirror/',
  ]) {
    expect(source, `src/symbol-pane.ts must not mention ${forbidden}`).not.toContain(forbidden);
  }

  // The paragraph that makes FR-318's narrowness true by construction.
  expect(source).toContain('registers no focus-loss listener');
});

test('VC-1613 (FR-1606, BR-1603): a full insertion cycle writes no clipboard and no notice', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.addInitScript(() => {
    const box = window as unknown as { __clipboardWrites: string[] };
    box.__clipboardWrites = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          box.__clipboardWrites.push(text);
          return Promise.resolve();
        },
        readText: () => Promise.resolve(''),
      },
    });
  });

  await openPlayground(page);
  await setProgram(page, 'x = 1\n');
  await setCaret(page, 1, 6);
  await openSymbolPane(page);

  for (const value of ['(', '_', '**']) await symbolButton(page, value).click();
  expect(await editorText(page)).toBe('x = 1(_**\n');

  expect(
    await page.evaluate(() => (window as unknown as { __clipboardWrites: string[] }).__clipboardWrites),
    'the pane wrote to the clipboard',
  ).toEqual([]);
  expect(await noticeTexts(page), '#notices stays empty').toEqual([]);
  expect(await page.evaluate(() => document.getElementById('notices')!.textContent)).toBe('');
});

test('VC-1613 (BR-1603): the pane still inserts with navigator.clipboard deleted', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });

  await openPlayground(page);
  await setProgram(page, 'x = 1\n');
  await setCaret(page, 1, 6);
  await openSymbolPane(page);

  await symbolButton(page, '#').click();
  expect(await editorText(page)).toBe('x = 1#\n');
  expect(await symbolStatus(page)).toBe('Inserted #');
  expect(await noticeTexts(page)).toEqual([]);
});

/* -------------------------------------------------------------------------
   spec-16 — FR-1605, FR-1606, FR-1608: the stdin target and its outline
   ------------------------------------------------------------------------- */

/** A program that blocks on one read and echoes exactly what it was given. */
const ECHO_READ = 'value = input()\nprint("[" + value + "]")\n';

/** The element FR-1608 has marked, as a stable name — or '' when none is. */
async function insertTargetElements(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-insert-target]')).map((el) =>
      el.id !== '' ? `#${el.id}` : el.classList.contains('cm-content') ? 'cm-content' : el.tagName,
    ),
  );
}

/** FR-1608: focus a character button, which is what puts the pane in focus. */
async function focusSymbol(page: Page, value: string): Promise<void> {
  await symbolButton(page, value).focus();
  expect(await focusedSymbol(page)).toBe(value);
}

test('VC-1607 (FR-1605, FR-1606): a pending read makes the stdin field the target', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  await waitForPythonReady(page);
  await runProgram(page, ECHO_READ);
  await waitForStdinPrompt(page);

  await openSymbolPane(page);
  const editorBefore = await editorSnapshot(page);

  // FR-1606: the first activation lands in the field, at its caret.
  await symbolButton(page, '_').click();
  await expect(page.locator('#stdin-input')).toHaveValue('_');
  // FR-1610: focus never left the activated button.
  expect(await focusedSymbol(page)).toBe('_');
  // FR-1601 is not reached at all: the editor document and caret are untouched.
  expect(await editorSnapshot(page)).toEqual(editorBefore);

  // FR-1606: five activations in a row accumulate in field order.
  for (const value of ['#', '|', '%', '...']) await symbolButton(page, value).click();
  await expect(page.locator('#stdin-input')).toHaveValue('_#|%...');
  expect(await editorSnapshot(page)).toEqual(editorBefore);
  expect(await editorText(page)).toBe(ECHO_READ);

  // FR-1606: `submitStdin()` reads `#stdin-input.value` directly, so the value
  // the worker receives is the one the pane built — no synthetic event needed.
  await page.locator('#stdin-input').press('Enter');
  await expect.poll(() => programStdout(page), { timeout: 30_000 }).toContain('[_#|%...]');
});

test('VC-1608 (FR-1605): the target follows the last-focused of the two', async ({ page }) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  await waitForPythonReady(page);
  await setProgram(page, ECHO_READ);
  await openSymbolPane(page);

  // (a) a fresh load with neither target focused resolves to the editor.
  await focusSymbol(page, '#');
  expect(await insertTargetElements(page)).toEqual(['cm-content']);

  // (b) the editor, then a toolbar control: the record still says the editor,
  // because focusing anything else leaves it unchanged.
  await focusEditor(page);
  await page.locator('#btn-clear').focus();
  await focusSymbol(page, '#');
  expect(await insertTargetElements(page)).toEqual(['cm-content']);

  // (c) a read begins: `stdinPending()` focuses the field, so it is the target.
  await page.locator('#btn-run').click();
  await waitForStdinPrompt(page);
  await focusSymbol(page, '#');
  expect(await insertTargetElements(page)).toEqual(['#stdin-input']);

  // (d) the read is answered: the field is inert again, so the editor wins.
  await submitStdin(page, 'x');
  await expect(page.locator('#btn-run')).toBeEnabled({ timeout: 30_000 });
  await focusSymbol(page, '#');
  expect(await insertTargetElements(page)).toEqual(['cm-content']);
});

for (const palette of ['light', 'dark'] as const) {
  test(`VC-1609 (FR-1608, NFR-1603): exactly one outlined target — ${palette}`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ value }) => window.localStorage.setItem('pyplay.theme.v1', value),
      { value: palette },
    );
    await openPlayground(page);
    await setProgram(page, 'x = 1\n');
    await setCaret(page, 1, 6);

    // Nothing is marked until the pane both is open and holds focus (FR-1608).
    expect(await insertTargetElements(page)).toEqual([]);
    await openSymbolPane(page);
    await focusSymbol(page, '#');

    // Exactly one element, and it is the resolved target — the same activation
    // inserts there and nowhere else.
    expect(await insertTargetElements(page)).toEqual(['cm-content']);
    await symbolButton(page, '#').click();
    expect(await editorText(page)).toBe('x = 1#\n');
    await expect(page.locator('#stdin-input')).toHaveValue('');

    // FR-1608: the editor's caret is rendered although focus is in the pane.
    await focusSymbol(page, '#');
    expect(
      await page.evaluate(() => {
        const cursor = document.querySelector('.cm-cursorLayer .cm-cursor');
        return cursor === null ? 'missing' : getComputedStyle(cursor).display;
      }),
      'the editor caret is rendered while the editor is the target',
    ).toBe('block');

    // NFR-1603: the outline clears 3:1 against the surface behind it.
    const measured = await measureContrast(page, [
      {
        label: `insert-target outline (editor, ${palette})`,
        selector: '.cm-content[data-insert-target]',
        prop: 'outlineColor',
      },
    ]);
    expect(measured).toHaveLength(1);
    expect(failures(measured, 3)).toEqual([]);

    // Moving focus out of the pane removes the attribute outright.
    await page.locator('#btn-clear').focus();
    expect(await insertTargetElements(page)).toEqual([]);
  });
}

test('VC-1609 (FR-1608, NFR-1603): the stdin field is the outlined target while a read is pending', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  await waitForPythonReady(page);
  await runProgram(page, ECHO_READ);
  await waitForStdinPrompt(page);
  await openSymbolPane(page);
  await focusSymbol(page, '#');

  expect(await insertTargetElements(page)).toEqual(['#stdin-input']);

  const measured = await measureContrast(page, [
    {
      label: 'insert-target outline (stdin field)',
      selector: '#stdin-input[data-insert-target]',
      prop: 'outlineColor',
    },
  ]);
  expect(measured).toHaveLength(1);
  expect(failures(measured, 3)).toEqual([]);

  // FR-1608 is presentation only: focus never moved out of the pane.
  expect(await focusedSymbol(page)).toBe('#');
});

test('VC-1613 (FR-1605, FR-1606): an idle, last-focused stdin field is not a target', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await openPlayground(page);
  await waitForPythonReady(page);
  await runProgram(page, ECHO_READ);
  // The read focuses the field, then answering it makes the field inert again
  // — the last-focused target is the stdin field, and it is not live.
  await submitStdin(page, 'x');
  await expect(page.locator('#btn-run')).toBeEnabled({ timeout: 30_000 });

  await openSymbolPane(page);
  await setCaret(page, 1, 1);
  await symbolButton(page, '_').click();

  // FR-1605: the editor took the insertion...
  expect(await editorText(page)).toBe(`_${ECHO_READ}`);
  // ...and the field was never written to (FR-1606).
  await expect(page.locator('#stdin-input')).toHaveValue('');
});

/* -------------------------------------------------------------------------
   spec-16 — VC-1614, VC-1615: the insertion in every rendering, and its cost
   ------------------------------------------------------------------------- */

/**
 * VC-1601's core insertion, condensed to what a second rendering can change:
 * the character lands at the caret and the caret ends up after it. The pane
 * must already be open.
 */
async function expectCoreInsertion(page: Page, what: string): Promise<void> {
  await setProgram(page, 'ab\n');
  await setCaret(page, 1, 2); // offset 1 — between `a` and `b`
  await symbolButton(page, '#').click();

  await expect(page.locator('#symbol-status'), what).toHaveText('Inserted #');
  const snapshot = await editorSnapshot(page);
  expect(snapshot.text, `${what}: document`).toBe('a#b\n');
  expect(snapshot.from, `${what}: caret after the insertion`).toBe(2);
  expect(snapshot.to, `${what}: caret collapsed`).toBe(2);
}

/** NFR-1603: every hit area is at least 32 × 32 CSS px in this rendering. */
async function expectHitAreas(page: Page, what: string): Promise<void> {
  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#symbol-pane .symbol')).map((b) => {
      const box = b.getBoundingClientRect();
      return { w: box.width, h: box.height };
    }),
  );
  expect(boxes, what).toHaveLength(29);
  for (const [i, box] of boxes.entries()) {
    expect(box.w, `${what}: button ${i + 1} width`).toBeGreaterThanOrEqual(32);
    expect(box.h, `${what}: button ${i + 1} height`).toBeGreaterThanOrEqual(32);
  }
}

// spec-04 FR-411: both layouts are only *choosable* at 900 px and up, so the
// preference is seeded and the viewport kept wide enough for it to be honoured.
for (const preference of ['horizontal', 'vertical'] as const) {
  test(`VC-1614 (FR-1601, FR-311, NFR-1603): the insertion holds in the ${preference} layout`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(
      ({ key, value }) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          /* ignore */
        }
      },
      { key: LAYOUT_KEY, value: preference },
    );
    await openPlayground(page, { seedLayout: false });
    await expect
      .poll(() => page.evaluate(() => document.getElementById('app')?.dataset.layout))
      .toBe(preference);

    await openSymbolPane(page);
    await expectCoreInsertion(page, `${preference} layout`);
    await expectHitAreas(page, `${preference} layout`);
  });
}

test('VC-1614 (FR-1601, FR-311, NFR-1603): the insertion holds either side of the 700 px flip', async ({
  page,
}) => {
  // 701 px: the pane is the inline-end column (FR-311, VC-330).
  await page.setViewportSize({ width: 701, height: 800 });
  await openPlayground(page);
  await openSymbolPane(page);
  await expectCoreInsertion(page, '701 px');
  await expectHitAreas(page, '701 px');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    '701 px: no horizontal page scrolling',
  ).toBeLessThanOrEqual(701);

  // 699 px: the same insertion in the full-width band the flip produces.
  await page.setViewportSize({ width: 699, height: 800 });
  await expect(page.locator('#symbol-pane')).toHaveAttribute('aria-orientation', 'horizontal');
  await expectCoreInsertion(page, '699 px');
  await expectHitAreas(page, '699 px');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    '699 px: no horizontal page scrolling',
  ).toBeLessThanOrEqual(699);

  // NFR-1603 / NFR-301: 375 px with the pane open still does not scroll
  // sideways, and the insertion is unchanged there too.
  await page.setViewportSize({ width: 375, height: 667 });
  await expectCoreInsertion(page, '375 px');
  await expectHitAreas(page, '375 px');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    '375 px: no horizontal page scrolling with the pane open',
  ).toBeLessThanOrEqual(375);
});

/**
 * NFR-1601 measures at "the 5 000-character program size spec-01 budgets for".
 * Every line is a comment, so 29 insertions into one of them produce no
 * diagnostic, no fold and no syntax error — what is being timed is the
 * insertion, not a lint pass reacting to broken code.
 */
const BUDGETED_PROGRAM = `# ${'x'.repeat(78)}\n`.repeat(63); // 5 103 characters

test('VC-1615 (NFR-1601): 29 insertions cost no long task, and each lands within 100 ms', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await openPlayground(page);
  // A long task from Pyodide or Ruff still loading is not the pane's, so the
  // page is brought fully to rest before the observer is reset (NFR-1601).
  await waitForPythonReady(page);
  await waitForLinter(page);

  await setProgram(page, BUDGETED_PROGRAM);
  expect(BUDGETED_PROGRAM.length).toBeGreaterThanOrEqual(5_000);
  await setCaret(page, 1, 3); // inside the first comment
  await openSymbolPane(page);

  const longTasks = await trackLongTasks(page);
  await page.waitForTimeout(250);
  await longTasks.reset();

  const latencies: { value: string; ms: number }[] = [];
  for (const value of SYMBOL_VALUES) {
    const ms = await page.evaluate(
      (target) =>
        new Promise<number>((resolve, reject) => {
          const content = document.querySelector('.cm-content') as
            | (HTMLElement & { cmView?: { view: unknown }; cmTile?: { view: unknown } })
            | null;
          const view = (content?.cmTile?.view ?? content?.cmView?.view) as
            | { state: { doc: { toString(): string } } }
            | undefined;
          if (!view) throw new Error('CodeMirror view not found');
          const before = view.state.doc.toString();
          const start = performance.now();
          document
            .querySelector<HTMLButtonElement>(
              `#symbol-pane .symbol[data-value="${CSS.escape(target)}"]`,
            )!
            .click();
          const check = (): void => {
            if (view.state.doc.toString() !== before) resolve(performance.now() - start);
            else if (performance.now() - start > 5_000) reject(new Error('no insertion'));
            else requestAnimationFrame(check);
          };
          check();
        }),
      value,
    );
    latencies.push({ value, ms });
  }

  const observed = await longTasks.read();

  for (const { value, ms } of latencies) {
    expect(ms, `NFR-1601 activation -> document change for ${value}`).toBeLessThanOrEqual(100);
  }
  expect(
    Math.max(0, ...observed),
    'NFR-1601 longest main-thread task across 29 insertions',
  ).toBeLessThanOrEqual(100);

  // The document really did take all 29 values, at the caret. Read from the
  // view, not the DOM: CodeMirror renders only the lines in the viewport.
  expect((await editorSnapshot(page)).text).toBe(
    `# ${SYMBOL_VALUES.join('')}${'x'.repeat(78)}\n` + `# ${'x'.repeat(78)}\n`.repeat(62),
  );

  console.log(
    [
      'VC-1615 measurements:',
      `  NFR-1601 slowest activation -> change  ${Math.max(...latencies.map((l) => l.ms)).toFixed(1)} ms   (<= 100)`,
      `  NFR-1601 longest main-thread task      ${Math.max(0, ...observed).toFixed(0)} ms   (<= 100)`,
    ].join('\n'),
  );
});
