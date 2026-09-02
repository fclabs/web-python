import { expect, test } from '@playwright/test';
import { STARTER_PROGRAM, editorText, openPlayground, typeProgram } from './helpers';

test('cross-origin isolation headers are served (BR-002)', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response?.headers() ?? {};
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
});

test('VC-001 (FR-001): multi-line Python with keyword highlighting and line numbers', async ({
  page,
}) => {
  await openPlayground(page);
  await typeProgram(page, 'def f():\nreturn 1');

  const lines = (await editorText(page)).split('\n');
  expect(lines).toHaveLength(2);
  expect(lines[0]).toBe('def f():');
  expect(lines[1].trim()).toBe('return 1');

  const keywords = await page
    .locator('.cm-content .tok-keyword')
    .evaluateAll((nodes) => nodes.map((n) => n.textContent));
  // Joined, not matched span by span: CodeMirror may split a highlighted run
  // across sibling text nodes while it is measuring, so `return` can arrive as
  // `re` + `turn` — both still inside `.tok-keyword`, which is what FR-001 asks.
  expect(keywords.join('')).toContain('def');
  expect(keywords.join('')).toContain('return');

  const gutter = await page
    .locator('.cm-gutter.cm-lineNumbers .cm-gutterElement')
    .evaluateAll((nodes) => nodes.map((n) => n.textContent?.trim()).filter(Boolean));
  expect(gutter).toContain('1');
  expect(gutter).toContain('2');
});

test('VC-002 (FR-002, FR-003): autosave after 500 ms is restored on reload', async ({ page }) => {
  await openPlayground(page);
  await typeProgram(page, 'x = 42');
  await page.waitForTimeout(1000);

  await page.reload();
  await page.waitForSelector('.cm-content');
  expect(await editorText(page)).toBe('x = 42');
});

test('VC-003 (FR-050): pagehide inside the debounce window flushes the full contents', async ({
  page,
}) => {
  await openPlayground(page);
  await typeProgram(page, 'x = 42');
  await page.waitForTimeout(100);

  // Still inside the 500 ms debounce: nothing written yet.
  const flushed = await page.evaluate((key) => {
    const before = window.localStorage.getItem(key);
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    return { before, after: window.localStorage.getItem(key) };
  }, 'pyplay.program.v1');

  expect(flushed.before).toBeNull();
  expect(flushed.after).toBe('x = 42');

  await page.reload();
  await page.waitForSelector('.cm-content');
  expect(await editorText(page)).toBe('x = 42');
});

test('VC-004 (FR-004, BR-010): a clean origin loads the starter program', async ({ page }) => {
  await openPlayground(page);
  const text = await editorText(page);
  expect(text).toBe(STARTER_PROGRAM);
  expect(text).toContain('input(');
  expect(text).toContain('print(');
});

test('VC-010 (FR-010): Reset replaces the buffer on confirm and leaves it on cancel', async ({
  page,
}) => {
  await openPlayground(page);
  await typeProgram(page, 'mi_codigo = 1');
  await page.waitForTimeout(600);

  const messages: string[] = [];

  page.once('dialog', (dialog) => {
    messages.push(dialog.message());
    void dialog.accept();
  });
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect
    .poll(() => editorText(page))
    .toBe(STARTER_PROGRAM);

  await typeProgram(page, 'mi_codigo = 1');
  page.once('dialog', (dialog) => {
    messages.push(dialog.message());
    void dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.waitForTimeout(200);
  expect(await editorText(page)).toBe('mi_codigo = 1');

  expect(messages).toEqual(['Discard your code?', 'Discard your code?']);
});
