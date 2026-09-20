/**
 * spec-15 — pending-input cue when Output is hidden.
 *
 * VC-1501 – VC-1506 against the built site.
 */
import { expect, test, type Page } from '@playwright/test';
import { GOTO_INPUT_LABEL, STDIN_WAITING_HINT } from '../../src/format';
import { failures, measureContrast, type Sample } from './contrast';
import {
  consoleText,
  openPlayground,
  runProgram,
  setProgram,
  submitStdin,
  waitForLinter,
  waitForPythonReady,
  waitForStdinPrompt,
} from './helpers';

const WIDE = { width: 1280, height: 800 };
const NARROW = { width: 375, height: 667 };
const LAYOUT_KEY = 'pyplay.layout.v2';

test.use({ viewport: WIDE });

async function openReady(page: Page, layout: 'vertical' | 'horizontal' = 'vertical'): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* storage denial is a dedicated criterion elsewhere */
      }
    },
    { key: LAYOUT_KEY, value: layout },
  );
  await openPlayground(page, { seedLayout: false });
  await waitForPythonReady(page);
  await waitForLinter(page);
}

async function hideOutput(page: Page): Promise<void> {
  const toggle = page.locator('#btn-output');
  if ((await toggle.getAttribute('aria-expanded')) === 'true') {
    await toggle.click();
  }
  await expect(page.locator('#console-pane')).toBeHidden();
  await expect(page.locator('#stdin-pane')).toBeHidden();
}

async function editorSelection(page: Page): Promise<{ from: number; to: number; head: number }> {
  return page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & {
          cmView?: { view: { state: { selection: { main: { from: number; to: number; head: number } } } } };
          cmTile?: { view: { state: { selection: { main: { from: number; to: number; head: number } } } } };
        })
      | null;
    const view = content?.cmTile?.view ?? content?.cmView?.view;
    if (!view) throw new Error('CodeMirror view not found');
    const main = view.state.selection.main;
    return { from: main.from, to: main.to, head: main.head };
  });
}

test('VC-1501 (FR-1501, FR-1506): the cue is shown while a read is pending', async ({ page }) => {
  await openReady(page);
  await expect(page.locator('#stdin-cue')).toBeHidden();

  await runProgram(page, 'name = input("n: ")\nprint(name)\n');
  await waitForStdinPrompt(page);
  await expect(page.locator('#stdin-cue')).toBeVisible();
  await expect(page.locator('#stdin-cue-text')).toHaveText(STDIN_WAITING_HINT);
  await expect(page.locator('#btn-goto-input')).toHaveText(GOTO_INPUT_LABEL);
  await expect(page.locator('#stdin-pane')).toBeVisible();

  await submitStdin(page, 'Ada');
  await expect(page.locator('#stdin-cue')).toBeHidden();
  await expect.poll(() => consoleText(page)).toContain('Program finished in');

  await hideOutput(page);
  await runProgram(page, 'name = input("n: ")\nprint(name)\n');
  await waitForStdinPrompt(page);
  await expect(page.locator('#stdin-cue')).toBeVisible();
  await expect(page.locator('#stdin-cue-text')).toHaveText(STDIN_WAITING_HINT);
  await expect(page.locator('#stdin-pane')).toBeHidden();
  await expect(page.locator('#console-pane')).toBeHidden();
});

test('VC-1502 (FR-1502): Go to input reveals Input only, by pointer and keyboard', async ({
  page,
}) => {
  await openReady(page);
  await hideOutput(page);
  await runProgram(page, 'x = input("n: ")\nprint(x)\n');
  await waitForStdinPrompt(page);
  await expect(page.locator('#stdin-pane')).toBeHidden();

  await page.locator('#btn-goto-input').click();
  await expect(page.locator('#stdin-pane')).toBeVisible();
  await expect(page.locator('#stdin-input')).toBeFocused();
  await expect(page.locator('#btn-eof')).toBeVisible();
  await expect(page.locator('#console-pane')).toBeHidden();
  await expect(page.locator('#diagnostics-pane')).toBeHidden();
  await expect(page.locator('#btn-output')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#app')).toHaveAttribute('data-stdin', 'pending');

  await submitStdin(page, 'one');
  await expect.poll(() => consoleText(page)).toContain('Program finished in');

  await hideOutput(page);
  await runProgram(page, 'x = input("n: ")\nprint(x)\n');
  await waitForStdinPrompt(page);
  await expect(page.locator('#stdin-pane')).toBeHidden();

  await page.locator('#btn-goto-input').focus();
  await expect(page.locator('#btn-goto-input')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#stdin-pane')).toBeVisible();
  await expect(page.locator('#stdin-input')).toBeFocused();
  await expect(page.locator('#console-pane')).toBeHidden();
});

test('VC-1503 (FR-1503): a pending read does not steal editor focus or auto-reveal', async ({
  page,
}) => {
  await openReady(page);
  await hideOutput(page);
  await runProgram(page, 'x = input("n: ")\nprint(x)\n');
  await waitForStdinPrompt(page);
  await expect(page.locator('#stdin-input')).not.toBeFocused();
  await expect(page.locator('#stdin-pane')).toBeHidden();
  await expect(page.locator('#stdin-cue')).toBeVisible();
});

test('VC-1504 (FR-1504): submit, EOF, Stop and error each clear the cue', async ({ page }) => {
  await openReady(page);
  await hideOutput(page);

  await runProgram(page, 'print(input())\n');
  await waitForStdinPrompt(page);
  await page.locator('#btn-goto-input').click();
  await submitStdin(page, 'ok');
  await expect.poll(() => consoleText(page)).toContain('Program finished in');
  await expect(page.locator('#stdin-cue')).toBeHidden();
  await expect(page.locator('#stdin-pane')).toBeHidden();

  await runProgram(page, 'input()\n');
  await waitForStdinPrompt(page);
  await page.locator('#btn-goto-input').click();
  await page.locator('#btn-eof').click();
  await expect.poll(() => consoleText(page)).toContain('Program exited with an error.');
  await expect(page.locator('#stdin-cue')).toBeHidden();
  await expect(page.locator('#stdin-pane')).toBeHidden();

  await runProgram(page, 'input()\n');
  await waitForStdinPrompt(page);
  await expect(page.locator('#stdin-cue')).toBeVisible();
  await page.locator('#btn-stop').click();
  await expect.poll(() => consoleText(page)).toContain('Program stopped.');
  await expect(page.locator('#stdin-cue')).toBeHidden();
  await expect(page.locator('#stdin-pane')).toBeHidden();
  await waitForPythonReady(page);

  await runProgram(page, 'raise RuntimeError("boom")\n');
  await expect.poll(() => consoleText(page)).toContain('Program exited with an error.');
  await expect(page.locator('#stdin-cue')).toBeHidden();
});

test('VC-1505 (FR-1505): two input() calls; reveal preserves editor and console', async ({
  page,
}) => {
  await openReady(page);
  const program = 'a = input("first: ")\nb = input("second: ")\nprint(a, b)\n';
  await setProgram(page, program);
  await page.locator('#btn-run').click();
  await waitForStdinPrompt(page);
  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement &
          {
            cmView?: { view: { state: { doc: { length: number } }; dispatch(spec: unknown): void } };
            cmTile?: { view: { state: { doc: { length: number } }; dispatch(spec: unknown): void } };
          })
      | null;
    const view = content?.cmTile?.view ?? content?.cmView?.view;
    if (!view) throw new Error('CodeMirror view not found');
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
  });
  const selectionBefore = await editorSelection(page);
  expect(selectionBefore.from).toBeLessThan(selectionBefore.to);
  const consoleBefore = await consoleText(page);

  await hideOutput(page);
  await expect(page.locator('#stdin-cue')).toBeVisible();
  await page.locator('#btn-goto-input').click();

  const selectionAfterReveal = await editorSelection(page);
  expect(selectionAfterReveal).toEqual(selectionBefore);
  await page.locator('#btn-output').click();
  await expect(page.locator('#console-pane')).toBeVisible();
  expect(await consoleText(page)).toBe(consoleBefore);

  await submitStdin(page, 'one');
  await waitForStdinPrompt(page);
  await hideOutput(page);
  await expect(page.locator('#stdin-cue')).toBeVisible();
  await expect(page.locator('#stdin-pane')).toBeHidden();

  await page.locator('#btn-goto-input').click();
  await submitStdin(page, 'two');
  await expect.poll(() => consoleText(page)).toContain('one two');
  await expect(page.locator('#stdin-cue')).toBeHidden();
});

test('VC-1506 (NFR-1501, NFR-1503): 375 px cue is unclipped and Tab-reachable', async ({
  page,
}) => {
  await page.setViewportSize(NARROW);
  await openReady(page, 'horizontal');
  await hideOutput(page);
  await runProgram(page, 'print(input())\n');
  await waitForStdinPrompt(page);
  await expect(page.locator('#stdin-cue')).toBeVisible();

  const report = await page.evaluate(() => {
    const selectors = [
      '.toolbar',
      '.status-bar',
      '#stdin-cue',
      '#stdin-cue-text',
      '#btn-goto-input',
      '.panel--editor',
    ];
    const clipped: string[] = [];
    for (const selector of selectors) {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el || el.hidden) {
        clipped.push(`${selector}: missing`);
        continue;
      }
      const box = el.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0 || box.left < -1 || box.right > window.innerWidth + 1) {
        clipped.push(selector);
      }
    }
    const btn = document.getElementById('btn-goto-input')!.getBoundingClientRect();
    return {
      clipped,
      scrollWidth: document.documentElement.scrollWidth,
      button: { width: btn.width, height: btn.height },
    };
  });
  expect(report.clipped).toEqual([]);
  expect(report.scrollWidth).toBeLessThanOrEqual(NARROW.width);
  expect(report.button.width).toBeGreaterThanOrEqual(32);
  expect(report.button.height).toBeGreaterThanOrEqual(32);

  await page.locator('#btn-about').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#btn-goto-input')).toBeFocused();
});

const CUE_TEXT: Sample[] = [
  { label: 'pending-input cue text', selector: '#stdin-cue-text', prop: 'color' },
  { label: 'Go to input label', selector: '#btn-goto-input', prop: 'color' },
];
const CUE_NON_TEXT: Sample[] = [
  { label: 'Go to input border', selector: '#btn-goto-input', prop: 'borderTopColor' },
  {
    label: 'Go to input focus ring',
    selector: '#btn-goto-input',
    prop: 'outlineColor',
    focus: true,
  },
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} palette`, () => {
    test.use({ colorScheme: scheme });

    test(`VC-1506 (NFR-1502): cue contrast — ${scheme}`, async ({ page }) => {
      await openReady(page);
      await runProgram(page, 'input()\n');
      await waitForStdinPrompt(page);
      await expect(page.locator('#stdin-cue')).toBeVisible();

      const text = await measureContrast(page, CUE_TEXT);
      expect(failures(text, 4.5)).toEqual([]);
      const chrome = await measureContrast(page, CUE_NON_TEXT);
      expect(failures(chrome, 3)).toEqual([]);
    });
  });
}
