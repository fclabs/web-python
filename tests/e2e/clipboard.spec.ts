import { expect, test } from '@playwright/test';
import { editorText, openPlayground, typeProgram } from './helpers';

test('VC-006 (FR-006): Copy code puts the exact buffer on the clipboard and confirms', async ({
  page,
}) => {
  await openPlayground(page);
  await typeProgram(page, 'print("hi")');

  const copy = page.getByRole('button', { name: 'Copy code' });
  await copy.click();

  const copied = page.getByRole('button', { name: 'Copied' });
  await expect(copied).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('print("hi")');

  // Still showing `Copied` well inside the 2 s window, back to normal after it.
  await page.waitForTimeout(1000);
  await expect(copied).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy code' })).toBeVisible({ timeout: 3000 });
});

test('VC-007 (FR-007): a rejected clipboard write notifies and selects the code', async ({
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
  await typeProgram(page, 'print("hi")');
  await page.getByRole('button', { name: 'Copy code' }).click();

  await expect(
    page.locator('[data-notice="Couldn\'t copy — select the code and press Ctrl/Cmd+C"]'),
  ).toHaveCount(1);

  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
    .toBe('print("hi")');

  expect(await editorText(page)).toBe('print("hi")');
  expect(pageErrors).toEqual([]);
});
