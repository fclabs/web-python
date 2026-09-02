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
 *
 * It is opt-in via `MATRIX=1` (`npm run test:matrix`, which also pins
 * `--workers=1`). VC-024's NFR-014 budget is a *reference-profile* wall-clock
 * measurement, and running six browser engines concurrently — which a plain
 * `npx playwright test` would do — is not that profile: the recovery it timed
 * was contention, not the app. The plan's Final Verification already invokes
 * the matrix as its own command, so this matches it. Without the flag the
 * matrix projects report `skipped`, never a pass they did not earn.
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

import { UNAVAILABLE_MATRIX_PROJECTS } from '../../playwright.config';

test.skip(
  !process.env.MATRIX,
  'NFR-011 matrix is opt-in: run `npm run test:matrix` (serial, uncontended).',
);

// A pinned version whose engine cannot be launched here is skipped, never
// silently run on a substitute engine under its name.
test.beforeEach(({}, testInfo) => {
  test.skip(
    UNAVAILABLE_MATRIX_PROJECTS.includes(testInfo.project.name),
    `${testInfo.project.name}: no such engine installed on this machine — uncovered, not passing.`,
  );
});

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

/**
 * VC-324 (NFR-306) — spec-03's Must-priority subset on each pinned version.
 *
 * VC-302, **VC-308**, VC-311, VC-313 and VC-319 are re-run here; VC-316 is
 * covered by the mid-run copy folded into the flow below. The copy itself is
 * verified by **pasting into the editor**, never by reading the clipboard:
 * `clipboard-read` is grantable under Playwright on Chromium but not on
 * Firefox or WebKit, so VC-307's clipboard-read observation stays Chromium-only
 * and out of the matrix.
 */
test('VC-324 (NFR-306): the special-character pane on this browser', async ({
  page,
  context,
  browserName,
}, info) => {
  test.setTimeout(180_000);

  // Chromium gates `clipboard.writeText` behind a permission that the default
  // `chromium` project grants and the matrix projects do not; Firefox and
  // WebKit accept the write on transient user activation and reject the
  // permission name outright. Granting it here keeps the matrix measuring the
  // app rather than Playwright's permission model.
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-write']);

  await page.goto('/');
  await page.waitForSelector('.cm-content');
  await waitForPythonReady(page);

  const pane = page.locator('#symbol-pane');
  const toggle = page.getByRole('button', { name: 'Symbols' });
  const button = (value: string) =>
    page.locator(`#symbol-pane .symbol[data-value="${value.replace(/([\\"])/g, '\\$1')}"]`);

  // VC-302 (FR-302): the toggle opens the pane and focuses the first button.
  await toggle.click();
  await expect(pane).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.value ?? ''),
  ).toBe('"');

  // VC-313 (FR-309, BR-305): one tab stop, and ArrowDown walks the set in
  // Character set order without wrapping.
  const tabindexes = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('#symbol-pane .symbol')).map(
      (b) => b.tabIndex,
    ),
  );
  expect(tabindexes.filter((t) => t === 0)).toHaveLength(1);
  expect(tabindexes.filter((t) => t === -1)).toHaveLength(28);

  await page.keyboard.press('End');
  expect(
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.value ?? ''),
  ).toBe('...');
  await page.keyboard.press('ArrowDown');
  expect(
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.value ?? ''),
  ).toBe('...');
  await page.keyboard.press('Home');
  expect(
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.value ?? ''),
  ).toBe('"');

  // VC-308 (FR-306): `**` copies, and pastes as exactly two characters.
  await setProgram(page, 'x = 1\n');
  await button('**').click();
  await expect(page.locator('#symbol-status')).toHaveText('Copied **');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => editorText(page), { timeout: 15_000 }).toBe('**');

  // VC-316 (FR-310): a copy mid-run interrupts neither the run nor its output.
  await page.getByRole('button', { name: 'Clear console' }).click();
  await runProgram(page, 'import time\nfor i in range(10):\n    print(i)\n    time.sleep(0.1)\n');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();
  await button('%').click();
  await expect(page.getByRole('button', { name: 'Run' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();
  await expect
    .poll(() => consoleText(page), { timeout: 60_000 })
    .toMatch(/Program finished in \d+\.\d{2} s/);
  expect(await programStdout(page)).toBe(
    Array.from({ length: 10 }, (_, i) => `${i}\n`).join(''),
  );

  // VC-319 (FR-311, NFR-301): the 375 px band scrolls itself, not the page.
  await page.setViewportSize({ width: 375, height: 667 });
  const narrow = await page.evaluate(() => {
    const pane = document.getElementById('symbol-pane')!;
    const editor = document.querySelector('.panel--editor')!;
    return {
      scrollWidth: document.documentElement.scrollWidth,
      paneAbove: pane.getBoundingClientRect().top < editor.getBoundingClientRect().top,
      smallest: Math.min(
        ...Array.from(document.querySelectorAll('#symbol-pane .symbol')).flatMap((b) => {
          const box = b.getBoundingClientRect();
          return [box.width, box.height];
        }),
      ),
    };
  });
  expect(narrow.scrollWidth).toBeLessThanOrEqual(375);
  expect(narrow.paneAbove).toBe(true);
  expect(narrow.smallest).toBeGreaterThanOrEqual(32);

  // VC-311 (FR-308, BR-303): a denied write notifies and selects the glyph,
  // and the pane keeps working.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });
  });
  await button('{').click();
  await expect(
    page.locator('[data-notice="Couldn\'t copy — select the character and press Ctrl/Cmd+C"]'),
  ).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
    .toBe('{');
  expect(
    await page.evaluate(() => document.getElementById('symbol-status')?.textContent ?? ''),
  ).toBe('');
  await expect(pane).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  info.annotations.push({ type: 'browser', description: `${info.project.name}` });
});
