import type { Page } from '@playwright/test';

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
