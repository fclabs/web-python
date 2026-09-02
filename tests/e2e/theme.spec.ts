/**
 * Color mode — load-time (Iteration 1) and toolbar control (Iteration 2).
 *
 * VC-504 (FR-505) — absent key → System under each OS.
 * VC-505 (FR-506, FR-515) — stored light/dark override OS; data-theme set.
 * VC-507 (FR-508, BR-503) — forced wins for chrome + editor.
 * VC-509 (FR-510, BR-502) — no prefers-color-scheme change listener.
 * VC-521 (FR-515) — first paint already matches the resolved palette.
 * VC-522 (FR-516, BR-506) — used color-scheme equals the effective palette.
 * VC-501 (FR-501) — `#btn-theme` last, after Symbols.
 * VC-502 (FR-502, FR-512) — full cycle + storage.
 * VC-503 (FR-503, FR-504) — glyph / title / accessible name.
 * VC-511 (FR-513) — tab after Symbols; focus ring; Enter/Space.
 * VC-512 (FR-514, FR-516) — data-theme + colorScheme after each cycle.
 * VC-517 (BR-501) — only theme key added; program key untouched.
 * VC-518 (BR-503) — chrome `--bg` agrees with editor dark flag.
 * VC-519 — Symbols still opens; theme follows it.
 */
import { expect, test, type Page } from '@playwright/test';
import { openPlayground, PROGRAM_KEY } from './helpers';

const THEME_KEY = 'pyplay.theme.v1';
const LIGHT_BG = 'rgb(255, 255, 255)';
const DARK_BG = 'rgb(20, 22, 26)';

const MODE = {
  light: { glyph: '\u2600', label: 'Light', name: 'Color mode: Light' },
  dark: { glyph: '\u263D', label: 'Dark', name: 'Color mode: Dark' },
  system: { glyph: 'S', label: 'System', name: 'Color mode: System' },
} as const;

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
  cssBg: string;
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
      cssBg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      editorDark,
    };
  });
}

async function controlChrome(page: Page): Promise<{
  text: string;
  title: string | null;
  ariaLabel: string | null;
  accessibleName: string;
}> {
  const btn = page.locator('#btn-theme');
  return {
    text: (await btn.innerText()).trim(),
    title: await btn.getAttribute('title'),
    ariaLabel: await btn.getAttribute('aria-label'),
    accessibleName: (await btn.getAttribute('aria-label')) ?? '',
  };
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

/* -------------------------------------------------------------------------
   Iteration 2 — toolbar control, cycle, persistence
   ------------------------------------------------------------------------- */

test('VC-501 (FR-501): #btn-theme is last and immediately after Symbols', async ({ page }) => {
  await openPlayground(page);
  const placement = await page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll('.toolbar > button'));
    const symbols = document.getElementById('btn-symbols');
    const theme = document.getElementById('btn-theme');
    return {
      present: !!theme,
      isLast: controls[controls.length - 1] === theme,
      afterSymbols: symbols?.nextElementSibling === theme,
    };
  });
  expect(placement.present).toBe(true);
  expect(placement.isLast).toBe(true);
  expect(placement.afterSymbols).toBe(true);
});

test.describe('cycle under OS light', () => {
  test.use({ colorScheme: 'light' });

  test('VC-502 (FR-502, FR-512, BR-501): full cycle updates chrome, editor, and storage', async ({
    page,
  }) => {
    await seedTheme(page, 'light');
    await openPlayground(page);
    const btn = page.locator('#btn-theme');

    await btn.click();
    let snap = await themeSnapshot(page);
    expect(snap.dataTheme).toBe('dark');
    expect(snap.bodyBg).toBe(DARK_BG);
    expect(snap.editorDark).toBe(true);
    expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('dark');

    await btn.click();
    snap = await themeSnapshot(page);
    expect(snap.dataTheme).toBe('system');
    expect(snap.bodyBg).toBe(LIGHT_BG);
    expect(snap.editorDark).toBe(false);
    expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('system');

    await btn.click();
    snap = await themeSnapshot(page);
    expect(snap.dataTheme).toBe('light');
    expect(snap.bodyBg).toBe(LIGHT_BG);
    expect(snap.editorDark).toBe(false);
    expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('light');
  });

  test('VC-503 (FR-503, FR-504): glyph, title, and accessible name match Mode table', async ({
    page,
  }) => {
    await seedTheme(page, 'light');
    await openPlayground(page);
    const btn = page.locator('#btn-theme');

    for (const pref of ['light', 'dark', 'system'] as const) {
      const chrome = await controlChrome(page);
      const expected = MODE[pref];
      expect(chrome.text, pref).toBe(expected.glyph);
      expect(chrome.title, pref).toBe(expected.label);
      expect(chrome.ariaLabel, pref).toBe(expected.name);
      expect(chrome.accessibleName, pref).toBe(expected.name);
      // No adjacent mode-name text beside the glyph.
      const siblingText = await page.evaluate(() => {
        const el = document.getElementById('btn-theme')!;
        const next = el.nextSibling;
        return next?.nodeType === Node.TEXT_NODE ? (next.textContent ?? '').trim() : '';
      });
      expect(siblingText).toBe('');
      if (pref !== 'system') await btn.click();
    }
  });

  test('VC-511 (FR-513): Tab after Symbols; focus ring; Enter and Space cycle', async ({
    page,
  }) => {
    await seedTheme(page, 'light');
    await openPlayground(page);

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    let landed = false;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => document.activeElement?.id ?? '');
      if (id === 'btn-symbols') {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => document.activeElement?.id)).toBe('btn-theme');
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);

    const ring = await page.evaluate(() => {
      const el = document.getElementById('btn-theme')!;
      const style = getComputedStyle(el);
      const width = Number.parseFloat(style.outlineWidth || '0');
      return style.outlineStyle !== 'none' && width >= 1 && style.outlineColor !== 'transparent';
    });
    expect(ring).toBe(true);

    await page.keyboard.press('Enter');
    expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('dark');
    expect((await controlChrome(page)).text).toBe(MODE.dark.glyph);

    await page.locator('#btn-theme').focus();
    await page.keyboard.press('Space');
    expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('system');
    expect((await controlChrome(page)).text).toBe(MODE.system.glyph);
  });

  test('VC-512 (FR-514, FR-516, BR-506): data-theme and color-scheme after each cycle', async ({
    page,
  }) => {
    await seedTheme(page, 'light');
    await openPlayground(page);
    const btn = page.locator('#btn-theme');

    const expectPair = async (pref: string, effective: string) => {
      const snap = await themeSnapshot(page);
      expect(snap.dataTheme).toBe(pref);
      expect(snap.colorScheme).toBe(effective);
    };

    await expectPair('light', 'light');
    await btn.click();
    await expectPair('dark', 'dark');
    await btn.click();
    await expectPair('system', 'light');
    await btn.click();
    await expectPair('light', 'light');
  });

  test('VC-517 (BR-501): only pyplay.theme.v1 is written; program key untouched', async ({
    page,
  }) => {
    await seedTheme(page, 'light');
    await page.addInitScript(
      ({ key, value }) => {
        window.localStorage.setItem(key, value);
      },
      { key: PROGRAM_KEY, value: 'print(1)\n' },
    );
    await openPlayground(page);

    const beforeProgram = await page.evaluate((k) => localStorage.getItem(k), PROGRAM_KEY);
    const btn = page.locator('#btn-theme');
    await btn.click();
    await btn.click();
    await btn.click();

    const after = await page.evaluate(async () => ({
      local: Object.keys(window.localStorage).sort(),
      theme: window.localStorage.getItem('pyplay.theme.v1'),
      program: window.localStorage.getItem('pyplay.program.v1'),
      session: Object.keys(window.sessionStorage),
      cookies: document.cookie,
      databases: (await indexedDB.databases?.())?.map((db) => db.name ?? '') ?? [],
    }));

    expect(after.local.filter((k) => k.startsWith('pyplay.theme'))).toEqual([THEME_KEY]);
    expect(after.theme).toBe('light');
    expect(after.program).toBe(beforeProgram);
    expect(after.session).toEqual([]);
    expect(after.cookies).toBe('');
    expect(after.databases).toEqual([]);
  });

  test('VC-518 (BR-503): chrome --bg agrees with editor dark flag for each preference', async ({
    page,
  }) => {
    await seedTheme(page, 'light');
    await openPlayground(page);
    const btn = page.locator('#btn-theme');

    for (const pref of ['light', 'dark', 'system'] as const) {
      const snap = await themeSnapshot(page);
      expect(snap.dataTheme).toBe(pref);
      if (snap.editorDark) {
        expect(snap.bodyBg).toBe(DARK_BG);
        expect(snap.cssBg === '#14161a' || snap.bodyBg === DARK_BG).toBe(true);
      } else {
        expect(snap.bodyBg).toBe(LIGHT_BG);
      }
      if (pref !== 'system') await btn.click();
    }
  });
});

test('VC-519: Symbols still opens and #btn-theme follows it', async ({ page }) => {
  await openPlayground(page);

  const order = await page.evaluate(() => {
    const symbols = document.getElementById('btn-symbols')!;
    const theme = document.getElementById('btn-theme');
    return {
      after: symbols.nextElementSibling === theme,
      last: document.querySelector('.toolbar > button:last-of-type') === theme,
    };
  });
  expect(order.after).toBe(true);
  expect(order.last).toBe(true);

  await page.getByRole('button', { name: 'Symbols' }).click();
  await expect(page.locator('#symbol-pane')).toBeVisible();
  await expect(page.locator('#btn-symbols')).toHaveAttribute('aria-expanded', 'true');
});
