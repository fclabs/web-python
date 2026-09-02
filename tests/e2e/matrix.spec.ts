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

/* -------------------------------------------------------------------------
   spec-04 — VC-432 (NFR-406)
   ------------------------------------------------------------------------- */

/**
 * NFR-406 asks that every Must-priority FR of spec-04 pass on each of the 8
 * pinned versions, and VC-432 names the seven criteria that carry them:
 * VC-403, VC-409, VC-413, VC-414, VC-416, VC-420 and VC-427.
 *
 * They are re-asserted here rather than grepped out of `layout.spec.ts`,
 * because `playwright.config.ts` gives the matrix projects `testMatch:
 * /matrix\.spec\.ts$/` — this file is the only one they run, which is what
 * keeps a plain `npx playwright test` from running every spec twice. Each
 * block below is the same assertion as its named criterion, condensed to what
 * distinguishes one engine from another.
 */
test('VC-432 (NFR-406): the layout control on this browser', async ({ page }, info) => {
  test.setTimeout(120_000);

  const layoutOf = (): Promise<string | undefined> =>
    page.evaluate(() => document.getElementById('app')?.dataset.layout);
  const storedLayout = (): Promise<string | null> =>
    page.evaluate(() => window.localStorage.getItem('pyplay.layout.v2'));
  const checkedRadio = (): Promise<string | undefined> =>
    page.evaluate(
      () =>
        (
          document.querySelector('#layout-group [role="radio"][aria-checked="true"]') as
            | HTMLElement
            | undefined
        )?.id,
    );

  // --- VC-416 (FR-416): resolved in the first painted frame ---------------
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('pyplay.layout.v2', 'horizontal');
    } catch {
      /* VC-418's subject, not this one's */
    }
    const state = { firstFrame: null as string | null };
    (window as unknown as { __firstFrame: typeof state }).__firstFrame = state;
    const start = (): void => {
      requestAnimationFrame(() => {
        state.firstFrame = document.getElementById('app')?.dataset.layout ?? null;
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  });
  await page.goto('/');
  await page.waitForSelector('.cm-content');
  await waitForPythonReady(page);

  expect(
    await page.evaluate(
      () => (window as unknown as { __firstFrame: { firstFrame: string | null } }).__firstFrame.firstFrame,
    ),
    'VC-416: the first painted frame already carries the resolved layout',
  ).toBe('horizontal');

  // --- VC-403 (FR-403, FR-414): selecting applies and persists ------------
  await page.locator('#layout-vertical').click();
  expect(await layoutOf(), 'VC-403: applied').toBe('vertical');
  expect(await checkedRadio(), 'VC-403: checked').toBe('layout-vertical');
  expect(await storedLayout(), 'VC-403: persisted as a bare string').toBe('vertical');

  // --- VC-409 (FR-408, BR-407): the two-column geometry -------------------
  const columns = await page.evaluate(() => {
    const box = (selector: string): DOMRect =>
      (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
    const editor = box('.panel--editor');
    const app = document.getElementById('app') as HTMLElement;
    const style = getComputedStyle(app);
    const content =
      app.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return {
      editorRight: editor.right,
      editorTop: editor.top,
      editorBottom: editor.bottom,
      consoleLeft: box('.panel--console').left,
      consoleTop: box('.panel--console').top,
      stdinLeft: box('.panel--stdin').left,
      diagLeft: box('.panel--diagnostics').left,
      diagBottom: box('.panel--diagnostics').bottom,
      share: (editor.right - editor.left) / content,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
  expect(columns.editorRight, 'VC-409: the editor ends before the right column').toBeLessThanOrEqual(
    columns.consoleLeft,
  );
  expect(columns.stdinLeft, 'VC-409: shared inline-start edge').toBeCloseTo(columns.consoleLeft, 0);
  expect(columns.diagLeft, 'VC-409: shared inline-start edge').toBeCloseTo(columns.consoleLeft, 0);
  expect(columns.editorTop, 'VC-409: the editor spans the split').toBeCloseTo(columns.consoleTop, 0);
  expect(columns.editorBottom, 'VC-409: the editor spans the split').toBeCloseTo(
    columns.diagBottom,
    0,
  );
  // FR-409's 50–65 % band, which `LAYOUT_EDITOR_COLUMN` sits inside at 58 %.
  expect(columns.share, 'VC-409: the editor column share').toBeGreaterThanOrEqual(0.5);
  expect(columns.share, 'VC-409: the editor column share').toBeLessThanOrEqual(0.65);
  expect(columns.scrollWidth).toBeLessThanOrEqual(columns.innerWidth);

  // --- VC-420 (FR-419): the editor survives a switch ----------------------
  await setProgram(page, 'value = 1\nother = 2\nprint(value, other)\n');
  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & { cmView?: { view: unknown }; cmTile?: { view: unknown } })
      | null;
    const view = (content?.cmTile?.view ?? content?.cmView?.view) as
      | { dispatch(spec: unknown): void }
      | undefined;
    view!.dispatch({ selection: { anchor: 6, head: 9 } });
    (window as unknown as { __view: unknown }).__view = view;
  });
  const editorBefore = await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & { cmView?: { view: unknown }; cmTile?: { view: unknown } })
      | null;
    const view = (content?.cmTile?.view ?? content?.cmView?.view) as
      | {
          state: { doc: { toString(): string }; selection: { main: { from: number; to: number } } };
        }
      | undefined;
    return {
      doc: view!.state.doc.toString(),
      from: view!.state.selection.main.from,
      to: view!.state.selection.main.to,
    };
  });

  await page.locator('#layout-horizontal').click();
  expect(await layoutOf()).toBe('horizontal');
  await page.locator('#layout-vertical').click();
  expect(await layoutOf()).toBe('vertical');

  const editorAfter = await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & { cmView?: { view: unknown }; cmTile?: { view: unknown } })
      | null;
    const view = (content?.cmTile?.view ?? content?.cmView?.view) as
      | {
          state: { doc: { toString(): string }; selection: { main: { from: number; to: number } } };
        }
      | undefined;
    return {
      doc: view!.state.doc.toString(),
      from: view!.state.selection.main.from,
      to: view!.state.selection.main.to,
      sameView: (window as unknown as { __view: unknown }).__view === view,
    };
  });
  expect(editorAfter.doc, 'VC-420: the document').toBe(editorBefore.doc);
  expect(editorAfter.from, 'VC-420: the selection').toBe(editorBefore.from);
  expect(editorAfter.to, 'VC-420: the selection').toBe(editorBefore.to);
  expect(editorAfter.sameView, 'VC-420: the same EditorView instance').toBe(true);

  // --- VC-413 (FR-413, BR-404): the narrow override, non-destructively ----
  await page.setViewportSize({ width: 375, height: 667 });
  await expect.poll(layoutOf, { timeout: 2_000 }).toBe('horizontal');
  expect(await storedLayout(), 'VC-413: the stored choice is untouched').toBe('vertical');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    'VC-413: no horizontal scroll at 375 px',
  ).toBeLessThanOrEqual(375);

  // --- VC-414 (FR-415): inert but focusable, every interaction a no-op ----
  await expect(page.locator('#layout-group')).toHaveAttribute('aria-disabled', 'true');
  expect(
    await page.locator('#layout-vertical').evaluate((el) => el.hasAttribute('disabled')),
    'VC-414: `aria-disabled`, never the `disabled` attribute',
  ).toBe(false);
  await page.locator('#layout-horizontal').focus();
  for (const key of ['ArrowRight', 'ArrowDown', 'Home', 'End', 'Space', 'Enter'] as const) {
    await page.keyboard.press(key);
    expect(await layoutOf(), `VC-414: ${key} did not apply`).toBe('horizontal');
    expect(await checkedRadio(), `VC-414: ${key} did not check`).toBe('layout-horizontal');
    expect(await storedLayout(), `VC-414: ${key} did not write`).toBe('vertical');
  }
  await page.locator('#layout-vertical').click({ force: true });
  expect(await layoutOf(), 'VC-414: a pointer click did not apply').toBe('horizontal');
  expect(await storedLayout(), 'VC-414: a pointer click did not write').toBe('vertical');

  // --- VC-427 (NFR-401): 375 px is usable and the radios are big enough ---
  const narrow = await page.evaluate(() => {
    const boxes = ['#layout-horizontal', '#layout-vertical'].map((selector) => {
      const box = (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
      return Math.min(box.width, box.height);
    });
    const unclipped = [
      '.toolbar',
      '#status-bar',
      '.panel--console',
      '.panel--editor',
      '#stdin-input',
      '#btn-eof',
      '.panel--diagnostics',
    ].every((selector) => {
      const box = (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.left >= -1 && box.right <= window.innerWidth + 1;
    });
    return { smallest: Math.min(...boxes), unclipped, scrollWidth: document.documentElement.scrollWidth };
  });
  expect(narrow.smallest, 'VC-427: each radio is at least 32 x 32 px').toBeGreaterThanOrEqual(32);
  expect(narrow.unclipped, 'VC-427: nothing is clipped').toBe(true);
  expect(narrow.scrollWidth).toBeLessThanOrEqual(375);

  // --- VC-413's last clause: widening restores it with no interaction -----
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(layoutOf, { timeout: 2_000 }).toBe('vertical');

  info.annotations.push({ type: 'browser', description: `${info.project.name}` });
});

/**
 * VC-516 (NFR-506) — spec-05's Must-priority subset on each pinned version.
 *
 * VC-502, VC-505, VC-507, VC-508, VC-510 and VC-511 condensed into one flow
 * so the matrix stays affordable on eight engines.
 */
test('VC-516 (NFR-506): color mode on this browser', async ({ page }, info) => {
  test.setTimeout(180_000);

  const THEME_KEY = 'pyplay.theme.v1';
  const LIGHT_BG = 'rgb(255, 255, 255)';
  const DARK_BG = 'rgb(20, 22, 26)';

  /** Seed then reload so the bootstrap and module both see the value. */
  const loadWithTheme = async (value: string | null): Promise<void> => {
    await page.goto('/');
    await page.evaluate(
      ({ key, value }) => {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      },
      { key: THEME_KEY, value },
    );
    await page.reload();
    await page.waitForSelector('.cm-content');
  };

  const snapshot = async (): Promise<{
    dataTheme: string | undefined;
    bodyBg: string;
    editorDark: boolean;
  }> =>
    page.evaluate(() => {
      const content = document.querySelector('.cm-content') as HTMLElement & {
        cmView?: {
          view: {
            state: { facet: (f: unknown) => unknown };
            constructor: { darkTheme: unknown };
          };
        };
        cmTile?: {
          view: {
            state: { facet: (f: unknown) => unknown };
            constructor: { darkTheme: unknown };
          };
        };
      };
      const view = content?.cmTile?.view ?? content?.cmView?.view;
      if (!view) throw new Error('CodeMirror view not found');
      return {
        dataTheme: document.documentElement.dataset.theme,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        editorDark: !!view.state.facet(view.constructor.darkTheme),
      };
    });

  // VC-505 / VC-507: forced light under OS dark.
  await page.emulateMedia({ colorScheme: 'dark' });
  await loadWithTheme('light');
  let snap = await snapshot();
  expect(snap.dataTheme).toBe('light');
  expect(snap.bodyBg).toBe(LIGHT_BG);
  expect(snap.editorDark).toBe(false);

  // VC-505 / VC-507: forced dark under OS light.
  await page.emulateMedia({ colorScheme: 'light' });
  await loadWithTheme('dark');
  snap = await snapshot();
  expect(snap.dataTheme).toBe('dark');
  expect(snap.bodyBg).toBe(DARK_BG);
  expect(snap.editorDark).toBe(true);

  // VC-502: full cycle light → dark → system → light under OS light.
  await loadWithTheme('light');
  const btn = page.locator('#btn-theme');
  await btn.click();
  snap = await snapshot();
  expect(snap.dataTheme).toBe('dark');
  expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('dark');
  await btn.click();
  snap = await snapshot();
  expect(snap.dataTheme).toBe('system');
  expect(snap.bodyBg).toBe(LIGHT_BG);
  expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('system');
  await btn.click();
  snap = await snapshot();
  expect(snap.dataTheme).toBe('light');
  expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('light');

  // VC-511: Tab after Symbols; focus ring; Enter advances.
  // Start from Run so sequential focus navigation is exercised (FR-513).
  await page.locator('#btn-run').focus();
  let landed = false;
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.id ?? '');
    if (id === 'btn-symbols') {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('btn-theme');
      landed = true;
      break;
    }
  }
  expect(landed, 'Tab never reached Symbols then theme').toBe(true);
  const ring = await page.evaluate(() => {
    const el = document.getElementById('btn-theme')!;
    const style = getComputedStyle(el);
    const width = Number.parseFloat(style.outlineWidth || '0');
    return style.outlineStyle !== 'none' && width >= 1 && style.outlineColor !== 'transparent';
  });
  expect(ring).toBe(true);
  await page.keyboard.press('Enter');
  expect((await snapshot()).dataTheme).toBe('dark');

  // VC-510: doc / caret preserved across a cycle.
  await setProgram(page, 'alpha\nbeta\ngamma\n');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('alpha\nbeta\ngamma\n');
  await page.keyboard.press('ArrowUp');
  const before = await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as HTMLElement & {
      cmView?: {
        view: {
          state: {
            doc: { toString(): string };
            selection: { main: { head: number } };
          };
          scrollDOM: { scrollTop: number };
        };
      };
      cmTile?: {
        view: {
          state: {
            doc: { toString(): string };
            selection: { main: { head: number } };
          };
          scrollDOM: { scrollTop: number };
        };
      };
    };
    const view = content.cmTile?.view ?? content.cmView?.view;
    if (!view) throw new Error('no view');
    return {
      doc: view.state.doc.toString(),
      head: view.state.selection.main.head,
      scrollTop: view.scrollDOM.scrollTop,
    };
  });
  await btn.click(); // dark → system
  const after = await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as HTMLElement & {
      cmView?: {
        view: {
          state: {
            doc: { toString(): string };
            selection: { main: { head: number } };
          };
          scrollDOM: { scrollTop: number };
        };
      };
      cmTile?: {
        view: {
          state: {
            doc: { toString(): string };
            selection: { main: { head: number } };
          };
          scrollDOM: { scrollTop: number };
        };
      };
    };
    const view = content.cmTile?.view ?? content.cmView?.view;
    if (!view) throw new Error('no view');
    return {
      doc: view.state.doc.toString(),
      head: view.state.selection.main.head,
      scrollTop: view.scrollDOM.scrollTop,
    };
  });
  expect(after.doc).toBe(before.doc);
  expect(after.head).toBe(before.head);
  expect(after.scrollTop).toBe(before.scrollTop);

  // VC-508: System ignores a mid-session OS flip until reload.
  await page.emulateMedia({ colorScheme: 'light' });
  await loadWithTheme('system');
  snap = await snapshot();
  expect(snap.dataTheme).toBe('system');
  expect(snap.bodyBg).toBe(LIGHT_BG);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(200);
  snap = await snapshot();
  expect(snap.bodyBg).toBe(LIGHT_BG);
  expect(snap.editorDark).toBe(false);
  await page.reload();
  await page.waitForSelector('.cm-content');
  snap = await snapshot();
  expect(snap.bodyBg).toBe(DARK_BG);
  expect(snap.editorDark).toBe(true);

  info.annotations.push({ type: 'browser', description: `${info.project.name}` });
});
