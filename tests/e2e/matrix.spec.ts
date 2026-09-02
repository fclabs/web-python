/**
 * VC-055 (NFR-011) — the pinned browser matrix.
 *
 * NFR-011 pins Chrome 141/140, Edge 141/140, Firefox 145/144 and Safari
 * 26.1/26.0, and asks that VC-016, VC-022, VC-024, VC-030, VC-067 and VC-045
 * pass on each. `playwright.config.ts` declares one project per pinned version
 * and maps it onto the closest engine Playwright can actually launch here; see
 * `docs/architecture.md` → "Browser matrix" for exactly which of the eight are
 * genuine and which are engine aliases.
 *
 * This file is the *only* one those projects run: the rest of the suite runs
 * on the default `chromium` project.
 */
import { expect, test } from '@playwright/test';
import {
  consoleText,
  editorText,
  programStdout,
  runProgram,
  setProgram,
  statusText,
  submitStdin,
  waitForLinter,
  waitForPythonReady,
  waitForStdinPrompt,
} from './helpers';

/** VC-067's six reads at four depths, condensed but structurally identical. */
const DEPTHS_PROGRAM = [
  'name = input()',
  'print("hello", name)',
  '',
  'total = 0',
  'for i in range(3):',
  '    print("iter", i)',
  '    total += int(input())',
  '',
  '',
  'def ask():',
  '    return input()',
  '',
  '',
  'acc = 0',
  'for i in range(200000):',
  '    acc += i',
  'print("acc", acc)',
  'deep = ask()',
  'print("deep", deep)',
  '',
  'try:',
  '    guarded = input()',
  'except EOFError:',
  '    guarded = "none"',
  'print("guarded", guarded)',
  `print("total", total)`,
  '',
].join('\n');

const EXPECTED_DEPTHS =
  'hello Ana\niter 0\niter 1\niter 2\nacc 19999900000\ndeep down\nguarded ok\ntotal 6\n';

test('VC-055 (NFR-011): the Must-priority core flows on this browser', async ({ page }, info) => {
  test.setTimeout(180_000);

  await page.goto('/');
  await page.waitForSelector('.cm-content');
  await waitForPythonReady(page);

  // VC-016 (FR-016, FR-019): stdout streams into the console.
  await runProgram(page, 'print("hello")\n');
  await expect.poll(() => programStdout(page), { timeout: 30_000 }).toBe('hello\n');

  // VC-022 (FR-021): a real CPython traceback, with the user's line number.
  await runProgram(page, 'a = 1\nb = 2\n1/0\n');
  await expect
    .poll(() => consoleText(page), { timeout: 30_000 })
    .toContain('Program exited with an error.');
  const traceback = await consoleText(page);
  expect(traceback).toContain('ZeroDivisionError');
  expect(traceback).toContain('division by zero');
  expect(traceback).toContain('line 3');

  // VC-030 (FR-029, FR-030, FR-031): a prompted read suspends and resumes.
  await page.getByRole('button', { name: 'Clear console' }).click();
  await runProgram(page, 'n = input("Name: ")\nprint("Hi", n)\n');
  await waitForStdinPrompt(page);
  // The console paints on a `requestAnimationFrame` batch (NFR-009), so the
  // prompt can trail the field being enabled by one frame.
  await expect
    .poll(async () => ((await consoleText(page)).match(/Name: /g) ?? []).length, {
      timeout: 10_000,
    })
    .toBe(1);
  await submitStdin(page, 'Ana');
  await expect.poll(() => programStdout(page), { timeout: 30_000 }).toBe('Hi Ana\n');

  // VC-067 (FR-057): six reads at four depths, in source order.
  await page.getByRole('button', { name: 'Clear console' }).click();
  await runProgram(page, DEPTHS_PROGRAM);
  for (const line of ['Ana', '1', '2', '3', 'down', 'ok']) await submitStdin(page, line);
  await expect
    .poll(() => consoleText(page), { timeout: 60_000 })
    .toMatch(/Program finished in \d+\.\d{2} s/);
  expect(await programStdout(page)).toBe(EXPECTED_DEPTHS);

  // VC-024 (FR-023, FR-024, NFR-006, NFR-014): Stop kills a runaway loop and
  // the worker comes back without a page reload.
  await page.getByRole('button', { name: 'Clear console' }).click();
  await runProgram(page, 'while True: pass\n');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();
  await page.waitForTimeout(1_000);
  const stoppedAt = Date.now();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(() => consoleText(page), { timeout: 5_000 }).toContain('Program stopped.');
  await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled({ timeout: 5_000 });
  expect(Date.now() - stoppedAt, 'NFR-014 recovery').toBeLessThanOrEqual(5_000);
  expect(await statusText(page)).not.toBe('Restarting Python…');
  await runProgram(page, 'print("ok")\n');
  await expect.poll(() => programStdout(page), { timeout: 30_000 }).toContain('ok');

  // VC-045 (FR-043): Ruff-WASM reformats the buffer.
  await waitForLinter(page);
  await setProgram(page, 'x=1\ny   =    2\n');
  await page.getByRole('button', { name: 'Format' }).click();
  await expect.poll(() => editorText(page), { timeout: 15_000 }).toBe('x = 1\ny = 2\n');

  info.annotations.push({ type: 'browser', description: `${info.project.name}` });
});
