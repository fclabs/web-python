/**
 * Spec-03 — the vertical special-character pane.
 *
 * Iteration 1 criteria: VC-301 – VC-306, VC-321, VC-325, VC-331, VC-332.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  consoleText,
  openPlayground,
  setProgram,
  waitForLinter,
  waitForPythonReady,
} from './helpers';

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

  // It is the toolbar's last control, and it has no disabled state.
  const wiring = await page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll('.toolbar > button'));
    const toggle = document.getElementById('btn-symbols')!;
    const target = document.getElementById(toggle.getAttribute('aria-controls')!);
    return {
      isLast: controls[controls.length - 1] === toggle,
      resolves: target === document.getElementById('symbol-pane'),
      ariaDisabled: toggle.getAttribute('aria-disabled'),
      hidden: (document.getElementById('symbol-pane') as HTMLElement).hidden,
    };
  });
  expect(wiring.isLast).toBe(true);
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

  for (const name of ['Clear console', 'Copy code', 'Format']) {
    await page.getByRole('button', { name }).click();
    await stillOpen(`after ${name}`);
  }

  // Run, then Stop. A runaway loop keeps the program alive long enough for
  // Stop to be genuinely enabled while the pane is inspected.
  await setProgram(page, 'while True: pass\n');
  await stillOpen('after replacing the program');
  await page.getByRole('button', { name: 'Run' }).click();
  await stillOpen('after Run');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(() => consoleText(page), { timeout: 15_000 }).toContain('Program stopped.');
  await stillOpen('after Stop');
});
