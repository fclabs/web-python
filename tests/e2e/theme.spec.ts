/**
 * Iteration 1 — load-time color mode (no toolbar control yet).
 *
 * VC-504 (FR-505) — absent key → System under each OS.
 * VC-505 (FR-506, FR-515) — stored light/dark override OS; data-theme set.
 * VC-507 (FR-508, BR-503) — forced wins for chrome + editor.
 * VC-509 (FR-510, BR-502) — no prefers-color-scheme change listener.
 * VC-521 (FR-515) — first paint already matches the resolved palette.
 * VC-522 (FR-516, BR-506) — used color-scheme equals the effective palette.
 */
import { expect, test, type Page } from '@playwright/test';
import { openPlayground } from './helpers';

const THEME_KEY = 'pyplay.theme.v1';
const LIGHT_BG = 'rgb(255, 255, 255)';
const DARK_BG = 'rgb(20, 22, 26)';

async function seedTheme(page: Page, value: string | null): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    },
    { key: THEME_KEY, value },
  );
}

/** Body background and document theme/color-scheme after the editor mounts. */
async function themeSnapshot(page: Page): Promise<{
  dataTheme: string | undefined;
  colorScheme: string;
  bodyBg: string;
  editorDark: boolean;
}> {
  return page.evaluate(() => {
    const content = document.querySelector('.cm-content') as
      | (HTMLElement & {
          cmView?: { view: { state: { facet: (f: unknown) => unknown }; constructor: { darkTheme: unknown } } };
          cmTile?: { view: { state: { facet: (f: unknown) => unknown }; constructor: { darkTheme: unknown } } };
        })
      | null;
    const view = content?.cmTile?.view ?? content?.cmView?.view;
    if (!view) throw new Error('CodeMirror view not found');
    const editorDark = !!view.state.facet(view.constructor.darkTheme);
    return {
      dataTheme: document.documentElement.dataset.theme,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      editorDark,
    };
  });
}

/** Install a counter for prefers-color-scheme change / addListener registrations. */
async function watchSchemeListeners(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __schemeChangeListeners: number };
    w.__schemeChangeListeners = 0;
    const original = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      const mql = original(query);
      if (!query.includes('prefers-color-scheme')) return mql;
      const addEventListener = mql.addEventListener.bind(mql);
      mql.addEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === 'change') w.__schemeChangeListeners += 1;
        return (addEventListener as Function).call(mql, type, ...rest);
      }) as MediaQueryList['addEventListener'];
      const legacy = (
        mql as MediaQueryList & { addListener?: (cb: EventListener) => void }
      ).addListener?.bind(mql);
      if (legacy) {
        (
          mql as MediaQueryList & { addListener: (cb: EventListener) => void }
        ).addListener = (cb: EventListener) => {
          w.__schemeChangeListeners += 1;
          legacy(cb);
        };
      }
      return mql;
    }) as typeof window.matchMedia;
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`OS ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(`VC-504 (FR-505): absent key resolves to System — ${scheme}`, async ({ page }) => {
      await seedTheme(page, null);
      await openPlayground(page);
      const snap = await themeSnapshot(page);
      expect(snap.dataTheme).toBe('system');
      expect(snap.bodyBg).toBe(scheme === 'dark' ? DARK_BG : LIGHT_BG);
      expect(snap.editorDark).toBe(scheme === 'dark');
      expect(snap.colorScheme).toBe(scheme);
    });

    test(`VC-522 (FR-516): color-scheme matches effective under System — ${scheme}`, async ({
      page,
    }) => {
      await seedTheme(page, 'system');
      await openPlayground(page);
      const snap = await themeSnapshot(page);
      expect(snap.dataTheme).toBe('system');
      expect(snap.colorScheme).toBe(scheme);
    });
  });
}

test.describe('forced light under OS dark', () => {
  test.use({ colorScheme: 'dark' });

  test('VC-505 (FR-506, FR-515): stored light overrides OS dark', async ({ page }) => {
    await seedTheme(page, 'light');
    await openPlayground(page);
    const snap = await themeSnapshot(page);
    expect(snap.dataTheme).toBe('light');
    expect(snap.bodyBg).toBe(LIGHT_BG);
    expect(snap.editorDark).toBe(false);
    expect(snap.colorScheme).toBe('light');
  });

  test('VC-507 (FR-508, BR-503): forced light wins for chrome and editor', async ({ page }) => {
    await seedTheme(page, 'light');
    await openPlayground(page);
    const snap = await themeSnapshot(page);
    expect(snap.bodyBg).toBe(LIGHT_BG);
    expect(snap.editorDark).toBe(false);
  });

  test('VC-521 (FR-515): first paint is light before the module can flash dark', async ({
    page,
  }) => {
    await seedTheme(page, 'light');
    await page.goto('/');
    const early = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      colorScheme: document.documentElement.style.colorScheme,
    }));
    expect(early.theme).toBe('light');
    expect(early.colorScheme).toBe('light');
    await page.waitForFunction(
      () => getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)',
    );
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(LIGHT_BG);
    expect(bg).not.toBe(DARK_BG);
  });
});

test.describe('forced dark under OS light', () => {
  test.use({ colorScheme: 'light' });

  test('VC-505 (FR-506, FR-515): stored dark overrides OS light', async ({ page }) => {
    await seedTheme(page, 'dark');
    await openPlayground(page);
    const snap = await themeSnapshot(page);
    expect(snap.dataTheme).toBe('dark');
    expect(snap.bodyBg).toBe(DARK_BG);
    expect(snap.editorDark).toBe(true);
    expect(snap.colorScheme).toBe('dark');
  });

  test('VC-507 (FR-508, BR-503): forced dark wins for chrome and editor', async ({ page }) => {
    await seedTheme(page, 'dark');
    await openPlayground(page);
    const snap = await themeSnapshot(page);
    expect(snap.bodyBg).toBe(DARK_BG);
    expect(snap.editorDark).toBe(true);
  });

  test('VC-521 (FR-515): first paint is dark with data-theme set', async ({ page }) => {
    await seedTheme(page, 'dark');
    await page.goto('/');
    // Bootstrap runs in <head> before stylesheets; dataset must already be set.
    const early = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      colorScheme: document.documentElement.style.colorScheme,
    }));
    expect(early.theme).toBe('dark');
    expect(early.colorScheme).toBe('dark');
    await page.waitForSelector('.cm-content');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(DARK_BG);
  });
});

test.describe('VC-521 system under OS dark', () => {
  test.use({ colorScheme: 'dark' });

  test('VC-521 (FR-515): absent key → data-theme=system and dark first paint', async ({
    page,
  }) => {
    await seedTheme(page, null);
    await page.goto('/');
    const early = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      colorScheme: document.documentElement.style.colorScheme,
    }));
    expect(early.theme).toBe('system');
    expect(early.colorScheme).toBe('dark');
    await page.waitForSelector('body');
    // Wait until CSS custom properties are applied.
    await page.waitForFunction(
      () => getComputedStyle(document.body).backgroundColor === 'rgb(20, 22, 26)',
    );
  });
});

test.describe('forced modes — color-scheme (VC-522)', () => {
  test.use({ colorScheme: 'dark' });

  test('VC-522 (FR-516): forced light color-scheme is light under OS dark', async ({ page }) => {
    await seedTheme(page, 'light');
    await openPlayground(page);
    const scheme = await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    );
    expect(scheme).toBe('light');
  });
});

test.describe('forced dark color-scheme under OS light', () => {
  test.use({ colorScheme: 'light' });

  test('VC-522 (FR-516): forced dark color-scheme is dark under OS light', async ({ page }) => {
    await seedTheme(page, 'dark');
    await openPlayground(page);
    const scheme = await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    );
    expect(scheme).toBe('dark');
  });
});

test('VC-509 (FR-510, BR-502): no prefers-color-scheme change listener updates chrome/editor', async ({
  page,
}) => {
  await watchSchemeListeners(page);
  await seedTheme(page, null);
  await openPlayground(page);
  const count = await page.evaluate(
    () => (window as unknown as { __schemeChangeListeners: number }).__schemeChangeListeners,
  );
  expect(count).toBe(0);
});
