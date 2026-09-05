/**
 * About toolbar control and modal dialog.
 *
 * Iteration 2:
 * VC-801 (FR-801) — `#btn-about` last, after theme.
 * VC-802 (FR-802, FR-805) — open by pointer; dialog contract + four fields.
 * VC-803 (FR-803, FR-804) — glyph `i`, title/name `About`.
 * VC-804 (FR-806, FR-807) — Escape / Close / backdrop dismiss; focus restore.
 * VC-805 (FR-808) — focus inside dialog; Tab trap.
 * VC-806 (FR-809) — tab order after theme; focus ring; Enter / Space open.
 * VC-808 (FR-811, BR-805) — editor integrity; no notices.
 * VC-818 (FR-811, BR-804, BR-806) — runtime undisturbed; control never disabled.
 * VC-821 — theme still cycles; About follows it.
 * VC-823 (FR-818) — closed on cold load.
 * VC-824 (FR-819) — backdrop swallows chrome clicks.
 *
 * Iteration 3:
 * VC-807 (FR-810, BR-801, NFR-807) — offline after precache; zero requests on open.
 * VC-812 (BR-803) — real-build commit is plain text (all-`unknown` lives in units).
 */
import { expect, test, type Page, type Request } from '@playwright/test';
import {
  consoleText,
  editorText,
  openPlayground,
  precacheReport,
  setProgram,
  waitForPythonReady,
  waitForStatus,
} from './helpers';

async function openAbout(page: Page): Promise<void> {
  await page.locator('#btn-about').click();
  await expect(page.locator('#about-dialog')).toBeVisible();
}

/** Doc / caret / undo depth / scroll — same shape as theme FR-511 checks. */
async function editorIntegrity(page: Page): Promise<{
  text: string;
  caret: number;
  undoDepth: number;
  scrollTop: number;
}> {
  return page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & {
          cmView?: {
            view: {
              state: {
                doc: { toString(): string };
                selection: { main: { head: number } };
                values: unknown[];
              };
            };
          };
          cmTile?: {
            view: {
              state: {
                doc: { toString(): string };
                selection: { main: { head: number } };
                values: unknown[];
              };
            };
          };
        })
      | null;
    const view = content?.cmTile?.view ?? content?.cmView?.view;
    if (!view) throw new Error('CodeMirror view not found');
    let undoDepth = 0;
    for (const v of view.state.values) {
      if (
        v &&
        typeof v === 'object' &&
        Array.isArray((v as { done?: unknown }).done) &&
        Array.isArray((v as { undone?: unknown }).undone)
      ) {
        const branch = (v as { done: { changes?: unknown }[] }).done;
        undoDepth = branch.length - (branch.length && !branch[0]?.changes ? 1 : 0);
        break;
      }
    }
    const scroller = document.querySelector('.cm-scroller') as HTMLElement | null;
    return {
      text: view.state.doc.toString(),
      caret: view.state.selection.main.head,
      undoDepth,
      scrollTop: scroller?.scrollTop ?? 0,
    };
  });
}

test('VC-801 (FR-801): #btn-about is last and immediately after #btn-theme', async ({ page }) => {
  await openPlayground(page);
  const placement = await page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll('.toolbar > button'));
    const theme = document.getElementById('btn-theme');
    const about = document.getElementById('btn-about');
    return {
      present: !!about,
      isLast: controls[controls.length - 1] === about,
      afterTheme: theme?.nextElementSibling === about,
    };
  });
  expect(placement.present).toBe(true);
  expect(placement.isLast).toBe(true);
  expect(placement.afterTheme).toBe(true);
});

test('VC-802 (FR-802, FR-805): pointer open shows dialog, fields, and plain-text commit', async ({
  page,
}) => {
  await openPlayground(page);
  await openAbout(page);

  const snap = await page.evaluate(() => {
    const dialog = document.getElementById('about-dialog')!;
    const title = document.getElementById('about-title')!;
    const labels = Array.from(dialog.querySelectorAll('.about-dialog__label')).map(
      (el) => el.textContent ?? '',
    );
    const values = {
      version: document.getElementById('about-version')!.textContent ?? '',
      branch: document.getElementById('about-branch')!.textContent ?? '',
      commit: document.getElementById('about-commit')!.textContent ?? '',
      built: document.getElementById('about-built')!.textContent ?? '',
    };
    const commit = document.getElementById('about-commit')!;
    return {
      role: dialog.getAttribute('role'),
      ariaModal: dialog.getAttribute('aria-modal'),
      labelledBy: dialog.getAttribute('aria-labelledby'),
      title: title.textContent ?? '',
      labels,
      values,
      commitLinks: commit.querySelectorAll('a[href]').length,
      commitHtml: commit.innerHTML,
    };
  });

  expect(snap.role).toBe('dialog');
  expect(snap.ariaModal).toBe('true');
  expect(snap.labelledBy).toBe('about-title');
  expect(snap.title).toBe('About');
  expect(snap.labels).toEqual(['Version', 'Branch', 'Commit', 'Built']);
  expect(snap.values.version.length).toBeGreaterThan(0);
  expect(snap.values.branch.length).toBeGreaterThan(0);
  expect(snap.values.commit.length).toBeGreaterThan(0);
  expect(snap.values.built.length).toBeGreaterThan(0);
  // Toward VC-812 / BR-803: commit is plain text, never a link.
  expect(snap.commitLinks).toBe(0);
  expect(snap.commitHtml).not.toMatch(/<a\b/i);
  expect(snap.values.commit).not.toMatch(/^https?:\/\//i);
});

test('VC-803 (FR-803, FR-804): glyph is i; title and accessible name are About', async ({
  page,
}) => {
  await openPlayground(page);
  const btn = page.locator('#btn-about');
  await expect(btn).toHaveText('i');
  await expect(btn).toHaveAttribute('title', 'About');
  await expect(btn).toHaveAccessibleName('About');

  const siblingText = await page.evaluate(() => {
    const el = document.getElementById('btn-about')!;
    const next = el.nextSibling;
    return next?.nodeType === Node.TEXT_NODE ? (next.textContent ?? '').trim() : '';
  });
  expect(siblingText).toBe('');
});

test('VC-804 (FR-806, FR-807): Escape, Close, and backdrop dismiss; focus returns', async ({
  page,
}) => {
  await openPlayground(page);
  const dialog = page.locator('#about-dialog');
  const about = page.locator('#btn-about');

  await openAbout(page);
  await expect(page.locator('#about-close')).toHaveAccessibleName('Close');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('btn-about');

  await about.click();
  await expect(dialog).toBeVisible();
  await page.locator('#about-close').click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('btn-about');

  await about.click();
  await expect(dialog).toBeVisible();
  await page.locator('#about-backdrop').click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('btn-about');
});

test('VC-805 (FR-808): focus opens inside the dialog; Tab stays trapped', async ({ page }) => {
  await openPlayground(page);
  await openAbout(page);

  const inside = await page.evaluate(() => {
    const dialog = document.getElementById('about-dialog')!;
    return dialog.contains(document.activeElement);
  });
  expect(inside).toBe(true);

  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(['about-close'].includes(id), `Tab landed on ${id}`).toBe(true);
    expect(id).not.toBe('btn-run');
    expect(id).not.toBe('btn-about');
  }

  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+Tab');
    const id = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(id).toBe('about-close');
  }
});

test('VC-806 (FR-809): Tab after theme; focus ring; Enter and Space open', async ({ page }) => {
  await openPlayground(page);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  let landed = false;
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.id ?? '');
    if (id === 'btn-theme') {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('btn-about');
      landed = true;
      break;
    }
  }
  expect(landed).toBe(true);

  const ring = await page.evaluate(() => {
    const el = document.getElementById('btn-about')!;
    const style = getComputedStyle(el);
    const width = Number.parseFloat(style.outlineWidth || '0');
    return style.outlineStyle !== 'none' && width >= 1 && style.outlineColor !== 'transparent';
  });
  expect(ring).toBe(true);

  await page.keyboard.press('Enter');
  await expect(page.locator('#about-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#about-dialog')).toBeHidden();

  await page.locator('#btn-about').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#about-dialog')).toBeVisible();
});

test('VC-808 (FR-811, BR-805): open/close leaves editor and notices untouched', async ({
  page,
}) => {
  await openPlayground(page);
  await setProgram(page, 'print("about-integrity")\nx = 1\n');
  await page.locator('.cm-content').click();
  // Build undo depth ≥ 1 and place caret mid-document.
  await page.keyboard.type('y');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.evaluate(() => {
    const scroller = document.querySelector('.cm-scroller') as HTMLElement | null;
    if (scroller) scroller.scrollTop = Math.floor(scroller.scrollHeight / 2) || 1;
  });

  const before = await editorIntegrity(page);
  expect(before.undoDepth).toBeGreaterThanOrEqual(1);

  await openAbout(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#about-dialog')).toBeHidden();

  const after = await editorIntegrity(page);
  expect(after.text).toBe(before.text);
  expect(after.caret).toBe(before.caret);
  expect(after.undoDepth).toBe(before.undoDepth);
  expect(after.scrollTop).toBe(before.scrollTop);

  const notices = await page.locator('#notices').innerText();
  expect(notices).not.toMatch(/About/i);
  expect(await editorText(page)).toBe(before.text);
});

test('VC-818 (FR-811, BR-804, BR-806): About does not disturb a running program', async ({
  page,
}) => {
  await openPlayground(page);
  await waitForPythonReady(page);
  await setProgram(page, 'while True: pass\n');
  await page.locator('#btn-run').click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();
  // Wait for the run separator so the before/during console comparison is stable.
  await expect.poll(() => consoleText(page)).toContain('─── Running');

  const before = await page.evaluate(() => ({
    console: document.getElementById('console')!.textContent ?? '',
    runDisabled: document.getElementById('btn-run')!.getAttribute('aria-disabled'),
    stopDisabled: document.getElementById('btn-stop')!.getAttribute('aria-disabled'),
    aboutDisabled: document.getElementById('btn-about')!.getAttribute('disabled'),
    aboutAria: document.getElementById('btn-about')!.getAttribute('aria-disabled'),
  }));

  await openAbout(page);
  await expect(page.locator('#about-dialog')).toBeVisible();

  const during = await page.evaluate(() => ({
    console: document.getElementById('console')!.textContent ?? '',
    runDisabled: document.getElementById('btn-run')!.getAttribute('aria-disabled'),
    stopDisabled: document.getElementById('btn-stop')!.getAttribute('aria-disabled'),
    aboutDisabled: document.getElementById('btn-about')!.getAttribute('disabled'),
    aboutAria: document.getElementById('btn-about')!.getAttribute('aria-disabled'),
  }));

  expect(during.console).toBe(before.console);
  expect(during.runDisabled).toBe(before.runDisabled);
  expect(during.stopDisabled).toBe(before.stopDisabled);
  expect(during.aboutDisabled).toBeNull();
  expect(during.aboutAria).not.toBe('true');

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(() => consoleText(page), { timeout: 15_000 }).toContain('Program stopped.');
});

test('VC-821: theme still cycles and #btn-about follows it', async ({ page }) => {
  await openPlayground(page);

  const order = await page.evaluate(() => {
    const theme = document.getElementById('btn-theme');
    const about = document.getElementById('btn-about');
    const controls = Array.from(document.querySelectorAll('.toolbar > button'));
    return {
      after: theme?.nextElementSibling === about,
      aboutLast: controls[controls.length - 1] === about,
      themeLast: controls[controls.length - 1] === theme,
    };
  });
  expect(order.after).toBe(true);
  expect(order.aboutLast).toBe(true);
  expect(order.themeLast).toBe(false);

  const theme = page.locator('#btn-theme');
  const before = await theme.getAttribute('title');
  await theme.click();
  const after = await theme.getAttribute('title');
  expect(after).not.toBe(before);
});

test('VC-823 (FR-818): cold load keeps dialog and backdrop inactive', async ({ page }) => {
  await openPlayground(page);

  const state = await page.evaluate(() => {
    const dialog = document.getElementById('about-dialog') as HTMLElement;
    const backdrop = document.getElementById('about-backdrop') as HTMLElement;
    return {
      dialogHidden: dialog.hidden,
      backdropHidden: backdrop.hidden,
      dialogVisible: dialog.checkVisibility?.() ?? !dialog.hidden,
      backdropVisible: backdrop.checkVisibility?.() ?? !backdrop.hidden,
    };
  });
  expect(state.dialogHidden).toBe(true);
  expect(state.backdropHidden).toBe(true);
  expect(state.dialogVisible).toBe(false);
  expect(state.backdropVisible).toBe(false);
  await expect(page.getByRole('dialog', { name: 'About' })).toHaveCount(0);
});

test('VC-824 (FR-819): backdrop swallows chrome activations under it', async ({ page }) => {
  await openPlayground(page);
  await waitForPythonReady(page);
  await setProgram(page, 'print("should-not-run")\n');

  const before = await consoleText(page);
  await openAbout(page);

  // Dispatch a click at `#btn-run` itself. A geometric mouse click lands on the
  // backdrop (FR-806 / VC-804); FR-819 requires chrome activations under the
  // modal to be swallowed while the dialog stays open.
  await page.locator('#btn-run').dispatchEvent('click');
  await expect(page.locator('#about-dialog')).toBeVisible();
  expect(await consoleText(page)).toBe(before);
  await expect(page.getByRole('button', { name: 'Stop' })).toBeDisabled();
});

/**
 * VC-812 split: units own all-`unknown` formatter + jsdom field mount
 * (`tests/unit/build-metadata.test.ts`). E2e asserts the real build’s DOM —
 * non-empty fields and commit never a link (BR-803).
 */
test('VC-812 (BR-803): real-build About fields are non-empty; commit is not a link', async ({
  page,
}) => {
  await openPlayground(page);
  await openAbout(page);

  const snap = await page.evaluate(() => {
    const commit = document.getElementById('about-commit')!;
    return {
      version: document.getElementById('about-version')!.textContent ?? '',
      branch: document.getElementById('about-branch')!.textContent ?? '',
      commit: commit.textContent ?? '',
      built: document.getElementById('about-built')!.textContent ?? '',
      commitLinks: commit.querySelectorAll('a[href]').length,
      commitHtml: commit.innerHTML,
    };
  });

  expect(snap.version.length).toBeGreaterThan(0);
  expect(snap.branch.length).toBeGreaterThan(0);
  expect(snap.commit.length).toBeGreaterThan(0);
  expect(snap.built.length).toBeGreaterThan(0);
  expect(snap.commitLinks).toBe(0);
  expect(snap.commitHtml).not.toMatch(/<a\b/i);
  expect(snap.commit).not.toMatch(/^https?:\/\//i);
});

/**
 * Offline After precache — service worker must be allowed (same pattern as
 * `offline.spec.ts` / privacy storage surface).
 */
test.describe('offline About metadata', () => {
  test.use({ serviceWorkers: 'allow' });

  test('VC-807 (FR-810, BR-801, NFR-807): offline About open shows baked fields with zero requests', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);

    await page.goto('/');
    await waitForPythonReady(page);
    await waitForStatus(page, 'Offline ready');

    const report = await precacheReport(page);
    expect(report.missing).toEqual([]);

    await context.setOffline(true);

    // FR-810: open must not consult storage for metadata.
    await page.evaluate(() => {
      const box = window as unknown as { __aboutStorageReads: string[] };
      box.__aboutStorageReads = [];
      const wrap = (store: Storage, label: string): void => {
        const orig = store.getItem.bind(store);
        store.getItem = (key: string): string | null => {
          box.__aboutStorageReads.push(`${label}:${key}`);
          return orig(key);
        };
      };
      wrap(window.localStorage, 'localStorage');
      wrap(window.sessionStorage, 'sessionStorage');
    });

    const requests: string[] = [];
    const record = (request: Request): void => void requests.push(request.url());
    page.on('request', record);

    await openAbout(page);

    // Let any deferred network settle so a late request is not missed.
    await page.waitForTimeout(300);
    page.off('request', record);

    const values = await page.evaluate(() => ({
      version: document.getElementById('about-version')!.textContent ?? '',
      branch: document.getElementById('about-branch')!.textContent ?? '',
      commit: document.getElementById('about-commit')!.textContent ?? '',
      built: document.getElementById('about-built')!.textContent ?? '',
      storageReads: (window as unknown as { __aboutStorageReads: string[] }).__aboutStorageReads,
    }));

    expect(values.version.length).toBeGreaterThan(0);
    expect(values.branch.length).toBeGreaterThan(0);
    expect(values.commit.length).toBeGreaterThan(0);
    expect(values.built.length).toBeGreaterThan(0);
    expect(requests, 'FR-810 / VC-807 requests attributable to About open').toEqual([]);
    expect(values.storageReads, 'FR-810: no localStorage/sessionStorage on About open').toEqual(
      [],
    );
  });
});
