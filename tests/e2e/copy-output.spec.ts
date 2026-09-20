/**
 * spec-15 — Copy output from the console (issue #46).
 *
 * VC-1501 – VC-1506 against the built site.
 */
import { expect, test } from '@playwright/test';
import { COPY_OUTPUT_FAILED } from '../../src/format';
import {
  consoleText,
  editorText,
  openPlayground,
  runProgram,
  setProgram,
  waitForPythonReady,
} from './helpers';

const TERMINATION = /Program (finished in \d+\.\d{2} s|exited with an error\.)/;

async function waitForTermination(page: Parameters<typeof consoleText>[0]): Promise<void> {
  await expect.poll(async () => TERMINATION.test(await consoleText(page)), { timeout: 60_000 }).toBe(true);
}

test('VC-1501 (FR-1502): Copy output matches the displayed transcript across runs', async ({
  page,
}) => {
  await openPlayground(page);
  await waitForPythonReady(page);

  await runProgram(page, 'print("hello")\n');
  await waitForTermination(page);

  await runProgram(
    page,
    'print("second")\nraise RuntimeError("boom")\n',
  );
  await expect
    .poll(async () => (await consoleText(page)).includes('Program exited with an error.'))
    .toBe(true);

  const displayed = await consoleText(page);
  expect(displayed).toContain('─── Running ');
  expect(displayed).toContain('hello');
  expect(displayed).toContain('second');
  expect(displayed).toContain('RuntimeError: boom');
  expect(displayed).toContain('Program exited with an error.');

  await page.getByRole('button', { name: 'Copy output' }).click();
  await expect(page.locator('#btn-copy-output')).toHaveAccessibleName('Copied');

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(displayed);
  expect(copied).not.toContain('Copy output');
  expect(copied).not.toContain('Clear console');
});

test('VC-1502 (FR-1502): line breaks and non-ASCII Python output are preserved', async ({
  page,
}) => {
  await openPlayground(page);
  await waitForPythonReady(page);

  await runProgram(page, 'print("café")\nprint("你好")\nprint("a\\nb")\n');
  await waitForTermination(page);

  const displayed = await consoleText(page);
  expect(displayed).toContain('café');
  expect(displayed).toContain('你好');
  expect(displayed).toMatch(/a\nb/);

  await page.getByRole('button', { name: 'Copy output' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(displayed);
});

test('VC-1503 (FR-1503, FR-1506): success is announced and does not clear or edit', async ({
  page,
}) => {
  await openPlayground(page);
  await waitForPythonReady(page);
  await setProgram(page, 'x = 1');
  await page.locator('#btn-run').click();
  await waitForTermination(page);

  const beforeConsole = await consoleText(page);
  const beforeEditor = await editorText(page);

  const copy = page.locator('#btn-copy-output');
  await copy.click();
  await expect(copy).toHaveAccessibleName('Copied');
  await expect(copy.locator('.icon-check')).toBeVisible();
  await expect(copy.locator('.icon-copy')).toBeHidden();

  expect(await consoleText(page)).toBe(beforeConsole);
  expect(await editorText(page)).toBe(beforeEditor);

  await expect(copy).toHaveAccessibleName('Copy output', { timeout: 3000 });
  await expect(copy.locator('.icon-copy')).toBeVisible();
  expect(await consoleText(page)).toBe(beforeConsole);
  expect(await editorText(page)).toBe(beforeEditor);
});

test('VC-1504 (FR-1504): a rejected clipboard write notifies and selects the output', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
      },
    });
  });

  await openPlayground(page);
  await waitForPythonReady(page);
  await setProgram(page, 'print("keep me")');
  await page.locator('#btn-run').click();
  await waitForTermination(page);

  const displayed = await consoleText(page);
  await page.getByRole('button', { name: 'Copy output' }).click();

  await expect(page.locator(`[data-notice="${COPY_OUTPUT_FAILED}"]`)).toHaveCount(1);
  await expect(page.locator('#btn-copy-output')).toHaveAccessibleName('Copy output');
  await expect(page.locator('#btn-copy-output')).not.toHaveAttribute('data-state', 'copied');

  // `Selection#toString` drops a trailing newline that `textContent` keeps.
  await expect
    .poll(async () => (await page.evaluate(() => window.getSelection()?.toString() ?? '')).replace(/\n$/, ''))
    .toBe(displayed.replace(/\n$/, ''));

  expect(await editorText(page)).toBe('print("keep me")');
  expect(await consoleText(page)).toBe(displayed);
  expect(pageErrors).toEqual([]);
});

test('VC-1505 (FR-1505): the empty console leaves Copy output inert', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          (window as unknown as { __clipboardWrites: string[] }).__clipboardWrites.push(text);
          return Promise.resolve();
        },
      },
    });
    (window as unknown as { __clipboardWrites: string[] }).__clipboardWrites = [];
  });

  await openPlayground(page);
  await waitForPythonReady(page);

  const copy = page.locator('#btn-copy-output');
  await expect(copy).toBeEnabled();

  await page.getByRole('button', { name: 'Clear console' }).click();
  expect(await consoleText(page)).toBe('');
  await expect(copy).toBeDisabled();
  await expect(copy).toHaveAttribute('aria-disabled', 'true');
  await expect(copy).not.toHaveAttribute('disabled');
  await expect(copy).toHaveAccessibleName('Copy output');

  await copy.click({ force: true });
  await copy.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);

  expect(
    await page.evaluate(() => (window as unknown as { __clipboardWrites: string[] }).__clipboardWrites),
  ).toEqual([]);
  await expect(page.locator('[data-notice]')).toHaveCount(0);
  await expect(copy).toHaveAccessibleName('Copy output');
  await expect(copy).toBeDisabled();

  await runProgram(page, 'print("again")\n');
  await waitForTermination(page);
  await expect(copy).toBeEnabled();
});

test('VC-1506 (FR-1501, FR-1507): placement, keyboard copy, traversal, hidden Output', async ({
  page,
}) => {
  await openPlayground(page);
  await waitForPythonReady(page);

  const copy = page.locator('#btn-copy-output');
  await expect(page.locator('#console-pane #btn-copy-output')).toHaveCount(1);
  await expect(copy).toHaveAccessibleName('Copy output');
  await expect(copy).toHaveAttribute('title', 'Copy output');
  await expect(copy.locator('svg').first()).toHaveAttribute('aria-hidden', 'true');
  const box = (await copy.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(32);
  expect(box.height).toBeGreaterThanOrEqual(32);

  await page.locator('#btn-clear').focus();
  await page.keyboard.press('Tab');
  await expect(copy).toBeFocused();

  await copy.focus();
  await page.keyboard.press('Enter');
  await expect(copy).toHaveAccessibleName('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await consoleText(page));

  await page.locator('#btn-output').click();
  await expect(copy).toBeHidden();
  await expect(page.locator('#btn-clear')).toBeHidden();
  await expect(page.locator('#btn-copy')).toBeVisible();
});
