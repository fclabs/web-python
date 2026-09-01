import type { Page } from '@playwright/test';

/** The slice of the CodeMirror view the helpers reach into from the page. */
interface EditorViewLike {
  state: { doc: { length: number } };
  dispatch(spec: unknown): void;
}

/** The starter program, byte for byte (spec: Data & Interfaces). */
export const STARTER_PROGRAM =
  '# Bienvenido al playground de Python.\n' +
  '# Escribí tu programa y apretá "Run" (Ctrl/Cmd+Enter).\n' +
  '\n' +
  'nombre = input("¿Cómo te llamás? ")\n' +
  'print(f"Hola, {nombre}!")\n' +
  '\n' +
  'for i in range(1, 6):\n' +
  '    print(i, "al cuadrado es", i * i)\n';

export const PROGRAM_KEY = 'pyplay.program.v1';

/** Load the playground and wait for the editor to be mounted. */
export async function openPlayground(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.cm-content');
}

/** The editor's current contents, reconstructed from the rendered lines. */
export async function editorText(page: Page): Promise<string> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.cm-content > .cm-line'))
      .map((line) => (line.textContent === '​' ? '' : (line.textContent ?? '')))
      .join('\n'),
  );
}

/** Replace the editor contents by typing, so the change goes through the UI. */
export async function typeProgram(page: Page, text: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type(text);
}

/** The value persisted under the autosave key, or null. */
export async function storedProgram(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), PROGRAM_KEY);
}

/**
 * Fill localStorage until even a small write is rejected.
 * Returns true when the quota is genuinely exhausted.
 */
export async function exhaustLocalStorage(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    let seq = 0;
    // Fill with progressively smaller writes so no usable slack is left.
    for (const size of [100_000, 10_000, 1_000, 100, 10, 1]) {
      const value = 'a'.repeat(size);
      for (let i = 0; i < 20_000; i++) {
        try {
          window.localStorage.setItem(`fill.${seq++}`, value);
        } catch {
          break;
        }
      }
    }
    try {
      window.localStorage.setItem('pyplay.probe.v1', 'c');
      return false;
    } catch {
      return true;
    }
  });
}

/** The console's full text content. */
export async function consoleText(page: Page): Promise<string> {
  return page.evaluate(() => document.getElementById('console')?.textContent ?? '');
}

/** The status indicator's text (FR-065). */
export async function statusText(page: Page): Promise<string> {
  return page.evaluate(() => document.getElementById('status-bar')?.textContent ?? '');
}

/** Wait for FR-013: the runtime is ready and Run is enabled. */
export async function waitForPythonReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const run = document.getElementById('btn-run') as HTMLButtonElement | null;
      return !!run && !run.disabled;
    },
    undefined,
    { timeout: 60_000 },
  );
}

/**
 * Replace the editor contents without typing — used when the program's exact
 * bytes matter more than the input path (indentation, tabs, long programs).
 * Reaches the CodeMirror view the way `EditorView.findFromDOM` does.
 */
export async function setProgram(page: Page, code: string): Promise<void> {
  await page.evaluate((text) => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & {
          cmView?: { view: EditorViewLike };
          cmTile?: { view: EditorViewLike };
        })
      | null;
    const view = content?.cmTile?.view ?? content?.cmView?.view;
    if (!view) throw new Error('CodeMirror view not found');
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }, code);
}

/** The console's spans, in DOM order, with the class that styled each one. */
export async function consoleSpans(page: Page): Promise<{ kind: string; text: string }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#console > span')).map((span) => ({
      kind: span.className.replace('console-', ''),
      text: span.textContent ?? '',
    })),
  );
}

/**
 * Exactly what the program wrote to stdout — no run separators, no prompts
 * (FR-030 keeps those out of the stream) and no echoed input.
 */
export async function programStdout(page: Page): Promise<string> {
  const spans = await consoleSpans(page);
  return spans
    .filter((span) => span.kind === 'stdout')
    .map((span) => span.text)
    .join('');
}

/** Wait until the program is suspended on a read with the field ready (FR-029). */
export async function waitForStdinPrompt(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const field = document.getElementById('stdin-input') as HTMLInputElement | null;
      return !!field && !field.disabled;
    },
    undefined,
    { timeout: 30_000 },
  );
}

/** Type a line into the stdin field and submit it with Enter (FR-031). */
export async function submitStdin(page: Page, text: string): Promise<void> {
  await waitForStdinPrompt(page);
  const field = page.locator('#stdin-input');
  await field.fill(text);
  await field.press('Enter');
}

/** Load, wait for the runtime, put `code` in the editor and press Run. */
export async function runProgram(page: Page, code: string): Promise<void> {
  await setProgram(page, code);
  await page.getByRole('button', { name: 'Run' }).click();
}

/**
 * Wait until the Ruff engine has loaded: Format is the control that is
 * enabled exactly when the engine is usable (FR-058).
 */
export async function waitForLinter(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const btn = document.getElementById('btn-format') as HTMLButtonElement | null;
      return !!btn && !btn.disabled;
    },
    undefined,
    { timeout: 30_000 },
  );
}

/** The diagnostics panel entries, in listed order (FR-038). */
export async function diagnosticEntries(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#diagnostics-list .diagnostic-entry')).map(
      (el) => el.textContent ?? '',
    ),
  );
}

/** The panel's live count (FR-038) and empty-state text (FR-040, FR-046). */
export async function diagnosticsPanelState(
  page: Page,
): Promise<{ count: string; empty: string; emptyHidden: boolean }> {
  return page.evaluate(() => {
    const empty = document.getElementById('diagnostics-empty') as HTMLElement | null;
    return {
      count: document.getElementById('diagnostics-count')?.textContent ?? '',
      empty: empty?.textContent ?? '',
      emptyHidden: !!empty?.hidden,
    };
  });
}

/** The editor's caret offset and the 1-based line/column it sits on. */
export async function caretPosition(
  page: Page,
): Promise<{ offset: number; line: number; column: number }> {
  return page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & {
          cmView?: { view: { state: unknown } };
          cmTile?: { view: { state: unknown } };
        })
      | null;
    const view = (content?.cmTile?.view ?? content?.cmView?.view) as
      | {
          state: {
            selection: { main: { head: number } };
            doc: { lineAt(pos: number): { number: number; from: number } };
          };
        }
      | undefined;
    if (!view) throw new Error('CodeMirror view not found');
    const offset = view.state.selection.main.head;
    const line = view.state.doc.lineAt(offset);
    return { offset, line: line.number, column: offset - line.from + 1 };
  });
}

/** Place the caret at a 1-based line/column without going through the mouse. */
export async function setCaret(page: Page, line: number, column: number): Promise<void> {
  await page.evaluate(
    ({ line, column }) => {
      const content = document.querySelector('.cm-content') as
        | (HTMLElement & {
            cmView?: { view: unknown };
            cmTile?: { view: unknown };
          })
        | null;
      const view = (content?.cmTile?.view ?? content?.cmView?.view) as
        | {
            state: { doc: { line(n: number): { from: number; to: number } } };
            dispatch(spec: unknown): void;
            focus(): void;
          }
        | undefined;
      if (!view) throw new Error('CodeMirror view not found');
      const target = view.state.doc.line(line);
      view.dispatch({ selection: { anchor: Math.min(target.to, target.from + column - 1) } });
      view.focus();
    },
    { line, column },
  );
}

/**
 * Load the playground with every Ruff asset returning 404, so the lint/format
 * engine can never initialise (VC-049, VC-070).
 */
export async function openWithoutLinter(page: Page): Promise<void> {
  await page.route('**/ruff/**', (route) => route.fulfill({ status: 404, body: 'not found' }));
  await openPlayground(page);
}
