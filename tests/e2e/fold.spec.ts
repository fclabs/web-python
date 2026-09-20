/**
 * spec-15 — indentation-based code folding.
 *
 * VC-1502 – VC-1506 against the built site. VC-1501 is the unit suite.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { failures, measureContrast, type Sample } from './contrast';
import { editorSnapshot, editorText, openPlayground, setProgram } from './helpers';

const PAYMENT = [
  'def process_payment(payment):',
  '    validate(payment)',
  '',
  '    if payment.approved:',
  '        notify_customer(payment)',
  '        save_transaction(payment)',
  '',
  '    return payment',
].join('\n');

function foldControls(page: Page, open: boolean) {
  const label = open ? 'Fold indented block' : 'Unfold indented block';
  return page.locator(`.cm-foldGutter span[aria-label="${label}"]`);
}

test('VC-1502 (FR-1502): gutter controls fold nested blocks independently', async ({ page }) => {
  await openPlayground(page);
  await setProgram(page, PAYMENT);
  await expect(foldControls(page, true)).toHaveCount(2);

  await foldControls(page, true).nth(1).click();
  await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
  expect(await editorText(page)).toContain('def process_payment(payment):');
  expect(await editorText(page)).toContain('validate(payment)');
  expect(await editorText(page)).toContain('return payment');
  expect(await editorText(page)).not.toContain('notify_customer(payment)');
  expect((await editorSnapshot(page)).text).toBe(PAYMENT);

  await foldControls(page, true).first().click();
  await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
  expect(await editorText(page)).toContain('def process_payment(payment):');
  expect(await editorText(page)).toContain('...');
  expect(await editorText(page)).not.toContain('validate(payment)');
  expect((await editorSnapshot(page)).text).toBe(PAYMENT);

  await foldControls(page, false).filter({ visible: true }).click();
  expect(await editorText(page)).toContain('validate(payment)');
  expect(await editorText(page)).not.toContain('notify_customer(payment)');
});

test('VC-1503 (FR-1503): folding does not change the source or steal Undo', async ({ page }) => {
  await openPlayground(page);
  await setProgram(page, PAYMENT);
  await foldControls(page, true).first().click();
  expect((await editorSnapshot(page)).text).toBe(PAYMENT);

  await page.locator('.cm-content').click();
  await page.keyboard.press('Home');
  await page.keyboard.type('# ');
  const edited = `# ${PAYMENT}`;
  expect((await editorSnapshot(page)).text).toBe(edited);

  await page.keyboard.press('ControlOrMeta+z');
  expect((await editorSnapshot(page)).text).toBe(PAYMENT);
});

test('VC-1504 (FR-1504): a collapsed block shows ... and hides the body', async ({ page }) => {
  await openPlayground(page);
  await setProgram(page, 'def f():\n    return 1\n');
  await foldControls(page, true).click();
  await expect(page.locator('.cm-foldPlaceholder')).toHaveText('...');
  expect(await editorText(page)).toContain('def f():');
  expect(await editorText(page)).toContain('...');
  expect(await editorText(page)).not.toContain('return 1');
  expect((await editorSnapshot(page)).text).toContain('return 1');

  await page.locator('.cm-foldPlaceholder').click();
  expect(await editorText(page)).toContain('return 1');
  await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(0);
});

const FOLD_TEXT: Sample[] = [
  {
    label: 'fold gutter marker',
    selector: '.cm-foldGutter span[aria-label="Fold indented block"]',
    prop: 'color',
  },
];

const FOLDED_TEXT: Sample[] = [
  { label: 'fold placeholder', selector: '.cm-foldPlaceholder', prop: 'color' },
  {
    label: 'unfold gutter marker',
    selector: '.cm-foldGutter span[aria-label="Unfold indented block"]',
    prop: 'color',
  },
];

const FOLDED_NON_TEXT: Sample[] = [
  { label: 'fold placeholder border', selector: '.cm-foldPlaceholder', prop: 'borderTopColor' },
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} palette`, () => {
    test.use({ colorScheme: scheme });

    test(`VC-1505 (NFR-1502): fold marker and placeholder contrast — ${scheme}`, async ({
      page,
    }) => {
      await openPlayground(page);
      await setProgram(page, 'def f():\n    return 1\n');
      await expect(foldControls(page, true)).toHaveCount(1);

      const text = await measureContrast(page, FOLD_TEXT);
      await foldControls(page, true).click();
      text.push(...(await measureContrast(page, FOLDED_TEXT)));
      const nonText = await measureContrast(page, FOLDED_NON_TEXT);

      expect(failures(text, 4.5)).toEqual([]);
      expect(failures(nonText, 3)).toEqual([]);
    });
  });
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(repoRoot, 'dist');
const FOLD_BASELINE_PATH =
  process.env.PYPLAY_BASELINE_FOLD ?? join(repoRoot, 'tests', 'e2e', 'baseline-build-fold.json');

interface BaselineBuild {
  commit: string;
  manifestUrlCount: number;
  gzippedApp?: number;
  gzippedBy?: string;
  gzippedAppBy?: Record<string, number>;
}

const foldBaseline = JSON.parse(readFileSync(FOLD_BASELINE_PATH, 'utf8')) as BaselineBuild;
const compressor = `${process.platform}-${process.arch} zlib ${process.versions.zlib}`;
const foldBaselineApp =
  foldBaseline.gzippedAppBy?.[compressor] ??
  (foldBaseline.gzippedBy === compressor ? foldBaseline.gzippedApp : undefined);
const FOLD_SIZE_BUDGET_BYTES = 4 * 1024;

if (process.env.PYPLAY_BASELINE_FOLD !== undefined && foldBaselineApp === undefined) {
  throw new Error(
    `${FOLD_BASELINE_PATH} records no app size for "${compressor}" (gzipped by ` +
      `"${foldBaseline.gzippedBy}")`,
  );
}

const uncoveredFoldCompressor =
  `no ${foldBaseline.commit} baseline for "${compressor}" — have: ` +
  `${Object.keys(foldBaseline.gzippedAppBy ?? {}).join(', ')}. Record with: ` +
  `node scripts/record-baselines.mjs ${foldBaseline.commit} --build <out.json>`;

const isVendored = (url: string): boolean =>
  url.startsWith('/pyodide/') || url.startsWith('/ruff/');

test('VC-1506 (NFR-1501): folding adds ≤ 4 KiB gzip and no asset', async () => {
  test.skip(foldBaselineApp === undefined, uncoveredFoldCompressor);

  const manifest = JSON.parse(readFileSync(join(dist, 'precache-manifest.json'), 'utf8')) as {
    urls: string[];
  };
  let gzippedApp = 0;
  for (const url of [...manifest.urls, '/index.html']) {
    if (url === '/' || isVendored(url)) continue;
    gzippedApp += gzipSync(readFileSync(join(dist, url.replace(/^\//, ''))), { level: 9 }).length;
  }

  const delta = gzippedApp - foldBaselineApp!;
  expect(
    delta,
    `NFR-1501 app size delta vs ${foldBaseline.commit}: ${delta} B gzipped ` +
      `(budget ${FOLD_SIZE_BUDGET_BYTES} B, compressor "${compressor}")`,
  ).toBeLessThanOrEqual(FOLD_SIZE_BUDGET_BYTES);
  expect(manifest.urls).toHaveLength(foldBaseline.manifestUrlCount);

  console.log(
    [
      'VC-1506 measurements:',
      `  NFR-1501 app delta vs ${foldBaseline.commit} ${delta} B (<= ${FOLD_SIZE_BUDGET_BYTES})`,
      `  NFR-1501 precache URL count           ${manifest.urls.length} (unchanged)`,
    ].join('\n'),
  );
});
