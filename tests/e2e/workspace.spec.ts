import { expect, test, type Page } from '@playwright/test';
import { consoleText, runProgram, setProgram, waitForPythonReady } from './helpers';

const TERMINATION = /Program (finished in \d+\.\d{2} s|exited with an error\.)/g;

async function openReady(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.cm-content');
  await waitForPythonReady(page);
}

async function waitForTermination(page: Page, expected: number): Promise<void> {
  await expect
    .poll(async () => (await consoleText(page)).match(TERMINATION)?.length ?? 0, { timeout: 30_000 })
    .toBe(expected);
}

async function createFile(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New' }).click();
  const input = page.locator('#file-name-input');
  await input.fill(name);
  await input.press('Enter');
}

const file = (page: Page, name: string) => page.locator(`[data-file="${name}"]`);

test('workspace UI: files can be created, renamed, deleted, hidden and resized', async ({ page }) => {
  await openReady(page);
  await expect(page.locator('#active-file-name')).toHaveText('main.py');
  await createFile(page, 'draft.txt');
  await expect(file(page, 'draft.txt')).toBeVisible();
  await expect(page.locator('#active-file-name')).toHaveText('draft.txt');

  await page.getByRole('button', { name: 'Rename' }).click();
  const input = page.locator('#file-name-input');
  await input.fill('answer.txt');
  await input.press('Enter');
  await expect(file(page, 'draft.txt')).toHaveCount(0);
  await expect(file(page, 'answer.txt')).toBeVisible();
  await expect(page.locator('#active-file-name')).toHaveText('answer.txt');

  await page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(file(page, 'answer.txt')).toHaveCount(0);
  await expect(page.locator('#active-file-name')).toHaveText('main.py');

  const filesToggle = page.getByRole('button', { name: 'Files' });
  await filesToggle.click();
  await expect(page.locator('#file-pane')).toBeHidden();
  await filesToggle.click();
  await expect(page.locator('#file-pane')).toBeVisible();

  const resizer = page.getByRole('separator', { name: 'Resize files panel' });
  await resizer.focus();
  await resizer.press('ArrowRight');
  await expect(resizer).toHaveAttribute('aria-valuenow', '276');
});

test('workspace UI: invalid paths are rejected, deleting main.py disables Run, and recreating it restores Run', async ({ page }) => {
  await openReady(page);

  await createFile(page, 'subdirectory/answer.py');
  await expect(page.locator('#notices')).toContainText('Files must stay at the workspace root.');
  await expect(file(page, 'subdirectory/answer.py')).toHaveCount(0);

  await page.once('dialog', (dialog) => dialog.accept());
  await file(page, 'main.py').click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: 'Run' })).toBeDisabled();
  await expect(file(page, 'main.py')).toHaveCount(0);

  await createFile(page, 'main.py');
  await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled();
});

test('workspace runtime: repeated overwrite/read keeps the same root file available on every run', async ({ page }) => {
  await openReady(page);
  await runProgram(page, [
    'with open("hola_mundo.txt", "w", encoding="utf-8") as archivo:',
    '    archivo.write("primera")',
    'with open("hola_mundo.txt", encoding="utf-8") as archivo:',
    '    print(archivo.read())',
  ].join('\n'));
  await waitForTermination(page, 1);
  await expect(file(page, 'hola_mundo.txt')).toBeVisible();

  await runProgram(page, [
    'with open("hola_mundo.txt", "w", encoding="utf-8") as archivo:',
    '    archivo.write("segunda")',
    'with open("hola_mundo.txt", encoding="utf-8") as archivo:',
    '    print(archivo.read())',
  ].join('\n'));
  await waitForTermination(page, 2);

  const text = await consoleText(page);
  expect(text).toContain('primera');
  expect(text).toContain('segunda');
  expect(text).not.toContain('FileNotFoundError');
});

test('workspace runtime: Python-created modules import on the next run and stale imports are refreshed', async ({ page }) => {
  await openReady(page);
  await runProgram(page, 'from pathlib import Path\nPath("helper.py").write_text("def greeting():\\n    return \'hola\'\\n")\n');
  await waitForTermination(page, 1);
  await expect(file(page, 'helper.py')).toBeVisible();

  await runProgram(page, 'from helper import greeting\nprint(greeting())\n');
  await waitForTermination(page, 2);
  expect(await consoleText(page)).toContain('hola');

  await runProgram(page, 'from pathlib import Path\nPath("helper.py").write_text("def greeting():\\n    return \'chau\'\\n")\n');
  await waitForTermination(page, 3);
  await runProgram(page, 'from helper import greeting\nprint(greeting())\n');
  await waitForTermination(page, 4);
  expect(await consoleText(page)).toContain('chau');
});

test('workspace runtime: deletion, renaming, binary files, forbidden directories and a missing main.py stay contained', async ({ page }) => {
  await openReady(page);
  await runProgram(page, [
    'from pathlib import Path',
    'Path("draft.txt").write_text("draft")',
    'Path("draft.txt").rename("answer.txt")',
    'Path("answer.txt").unlink()',
    'Path("blob.bin").write_bytes(bytes([0, 255, 1]))',
  ].join('\n'));
  await waitForTermination(page, 1);
  await expect(file(page, 'draft.txt')).toHaveCount(0);
  await expect(file(page, 'answer.txt')).toHaveCount(0);
  await file(page, 'blob.bin').click();
  await expect(page.locator('.cm-content')).toContainText('Binary file: blob.bin (3 bytes)');
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');

  await file(page, 'main.py').click();
  await setProgram(page, 'import os\nos.mkdir("student_directory")\n');
  await page.getByRole('button', { name: 'Run' }).click();
  await waitForTermination(page, 2);
  expect(await consoleText(page)).toContain('Program exited with an error.');
  await expect(file(page, 'student_directory')).toHaveCount(0);

  await setProgram(page, 'from pathlib import Path\nPath(__file__).unlink()\n');
  await page.getByRole('button', { name: 'Run' }).click();
  await waitForTermination(page, 3);
  await expect(file(page, 'main.py')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run' })).toBeDisabled();
});

test('workspace runtime: a completed Python write survives Stop and a reload', async ({ page }) => {
  await openReady(page);
  await runProgram(page, 'from pathlib import Path\nPath("before_stop.txt").write_text("keep me")\nwhile True: pass\n');
  await expect(file(page, 'before_stop.txt')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled({ timeout: 5_000 });
  await page.reload();
  await page.waitForSelector('.cm-content');
  await expect(file(page, 'before_stop.txt')).toBeVisible();
});
