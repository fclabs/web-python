import { expect, test } from '@playwright/test';
import { editorText, exhaustLocalStorage, openPlayground, typeProgram } from './helpers';

test('VC-005 (FR-005, BR-009): a full localStorage shows the notice once and keeps editing', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await openPlayground(page);
  expect(await exhaustLocalStorage(page)).toBe(true);

  await typeProgram(page, 'x = 1');
  await page.waitForTimeout(800);

  const notice = page.locator(
    '[data-notice="Autosave unavailable — your workspace will not survive a reload"]',
  );
  await expect(notice).toHaveCount(1);
  expect(await editorText(page)).toBe('x = 1');

  // A second failing autosave must not add a second notice.
  await page.keyboard.type('23');
  await page.waitForTimeout(800);
  await expect(notice).toHaveCount(1);
  expect(await editorText(page)).toBe('x = 123');

  expect(pageErrors).toEqual([]);
});
