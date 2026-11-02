# CONTEXT — Editor Font Size (spec 13)

Rewritten in place at the end of every iteration. Last updated: Iteration 4 (final; the shipped system).

## Current state

All four iterations complete. The toolbar has `#btn-fontsize` (label `Font size: N`, `aria-label` `Font size: N px`) opening
`#fontsize-menu` (nine `menuitemradio` items). Choosing a different size applies `--editor-font-size`, writes
`pyplay.fontsize.v1` synchronously, and shows `FONT_SIZE_SAVE_FAILED` once per load if the write fails. Equal size: no write, no
notice. Never inert. At >= 900 px the shared toolbar padding is trimmed so the button fits (D-005). Docs shipped in
`docs/architecture.md` (section *Editor font size*, *Storage surface* = six things, *Toolbar presentation clustering*) and `CLAUDE.md`
(five localStorage keys; font-size bootstrap). VC-1324 (acceptance) is in `tests/e2e/fontsize.spec.ts`. The spec is NOT frozen
(a separate `/freeze-spec` step after merge). Sibling specs 05/08/09 were not edited (repo practice records amendments in the amending
spec; the spec header already names them).
Measured: default computed font size of content/gutters/line `14px`, line-height `19.6px`; at `36` they scale, rest unchanged.

## File map

| Path | Role |
|---|---|
| `src/fontsize.ts` | NEW. Key, presets, validator, load/save, apply. DOM-free except `applyFontSize`. |
| `src/format.ts` | + `FONT_SIZE_LABEL`, `FONT_SIZE_NAME`, `FONT_SIZE_ITEM`, `FONT_SIZE_SAVE_FAILED` (before "Mode table labels"). |
| `index.html` | + second inline `<script>` in `<head>`, directly after the diagnostics-height script, before `</head>`. |
| `src/styles.css` | `.cm-editor .cm-content` and `.cm-editor .cm-gutters` get `font-size: var(--editor-font-size, 14px)`. |
| `src/main.ts` | `boot()` calls `applyFontSize(loadFontSize(storage))` right after `getWorkspaceStorage()`. |
| `src/fontsize-menu.ts` | NEW (It. 2). Menu DOM, open/close, focus, keys, positioning. No EditorView/storage. |
| `index.html` (It. 2) | `#btn-fontsize` after `#btn-symbols`; `<div id="fontsize-menu" class="fontsize-menu" role="menu" hidden>` right after `</header>`. |
| `src/main.ts` (It. 2) | `mountFontSizeMenu` before the theme binding; `onSelect` = apply + save + once-flag `fontSizeSaveWarned`. |
| `src/styles.css` (It. 2) | `#btn-fontsize`, `.fontsize-menu`, `.fontsize-item` (+ `[aria-checked='true']::before` check); >= 900 px toolbar trim in the existing media block. |
| `tests/e2e/fontsize.spec.ts` | NEW. VC-1301-1307, 1309, 1311, 1312, 1314-1316, 1322, 1327 (It. 2); VC-1308, 1310, 1318, 1319, 1321 (x2 palettes), 1325, 1326 (It. 3); VC-1324 (It. 4). VC-1319 self-skips outside Chromium (spec: measured in Chromium). |
| `tests/e2e/symbols.spec.ts` | VC-301 / VC-315 amended for `#btn-fontsize` (adjacency, expected stops, tab budget 21 -> 22) (It. 4). |
| `docs/architecture.md`, `CLAUDE.md` | Shipped docs (It. 4). |
| `tests/e2e/privacy.spec.ts` | VC-058 accepts the five documented localStorage keys incl. `pyplay.fontsize.v1`. |
| `package.json` | `audit:contrast` grep gained `\|VC-1321`. |
| `tests/e2e/baseline-build-about.json`, `CONTRIBUTING.md` | VC-814 pin moved e569b81 -> 424e43c (separate commit 8329112, D-008). |
| `tests/unit/fontsize.test.ts` | NEW. VC-1313, VC-1311 (write half), VC-1317, constants/strings, `applyFontSize`. |

## Public interfaces

`src/fontsize.ts`:
```ts
export const FONT_SIZE_KEY = 'pyplay.fontsize.v1';
export const FONT_SIZES: readonly number[] = [12, 14, 16, 18, 20, 24, 28, 32, 36];
export const FONT_SIZE_DEFAULT = 14;
export function isFontSize(raw: string): boolean;            // canonical string only (BR-1303)
export function loadFontSize(storage: StorageLike | null): number;   // never writes, never throws
export function saveFontSize(storage: StorageLike | null, size: number): boolean; // false on null/throw/non-preset
export function applyFontSize(size: number): void;           // documentElement.style --editor-font-size = `${size}px`
```
`StorageLike` comes from `src/storage.ts`. `saveFontSize` does NOT skip an unchanged value — the caller
(Iteration 2) must skip the write and the notice when the size equals the current one (FR-1311).

`src/format.ts`: `FONT_SIZE_LABEL(n)` -> `Font size: N`; `FONT_SIZE_NAME(n)` -> `Font size: N px`;
`FONT_SIZE_ITEM(n)` -> `N px` / `14 px (default)`; `FONT_SIZE_SAVE_FAILED` = `Font size won't be remembered`.
(`FONT_SIZE_ITEM` hard-codes 14 rather than importing `FONT_SIZE_DEFAULT`, to keep `format.ts` import-free.)

CSS: variable `--editor-font-size` (value `Npx`) on `document.documentElement`; fallback `14px` in the two rules.
Never set on `.cm-editor` (tooltips must stay fixed, FR-1309).

Inline bootstrap (`index.html`): `var ALLOWED = ['12','14','16','18','20','24','28','32','36']`; sets the variable only when
`ALLOWED.indexOf(raw) !== -1`; try/catch around storage.

`src/fontsize-menu.ts`:
```ts
export interface FontSizeMenuOptions { button: HTMLButtonElement; menu: HTMLElement; initial: number; onSelect: (size: number) => void }
export function mountFontSizeMenu(options: FontSizeMenuOptions): void
```
DOM ids: `btn-fontsize`, `fontsize-menu`; items are `div.fontsize-item[role=menuitemradio][data-size]`.
Esc: window-capture keydown listener, only while open, `stopImmediatePropagation` (before About's document-capture handler).
Outside click: document-capture `click`. Tab: close + focus button, default Tab proceeds. ArrowDown on the button opens;
Enter/Space open through the native click. Items are divs (no native activation).

## Conventions & invariants

- Allow-list lives twice (BR-1304): `FONT_SIZES` and the `ALLOWED` literal in `index.html`; VC-1317 guards it
  (see D-001). Changing one means changing both.
- Applying a size is a CSS-variable write only — no `EditorView` reference, no transaction (BR-1305).
- Non-canonical stored values are left in place; only a visitor selection overwrites (BR-1303, FR-1313).
- The control never uses `disabled`/`aria-disabled`/`setInert` (FR-1315, BR-1306); strings only from `format.ts`.
- Menu is `position: fixed`, placed by JS (below button, clamp, flip above; D-003). With About open (modal) only ArrowDown opens it.
- >= 900 px toolbar spacing trim (D-005): do not widen the gap (VC-702/703 6 px) and re-measure 900 px light/dark/pre-ready if a toolbar control changes.
- Known env issue: macOS `Control+m` in layout VC-407/VC-431 and presentation VC-052 (CodeMirror uses Shift-Alt-m on Mac).
- Cite FR/BR/NFR/VC in comments for non-obvious lines.
- `applyFontSize` at boot sets an explicit `14px` when nothing is stored; harmless and idempotent.

## Commands

```bash
npm run build && npx playwright test tests/e2e/fontsize.spec.ts
```

```bash
npx vitest run tests/unit/fontsize.test.ts
npx tsc --noEmit && npm run test:unit && npm run build
# Playwright serves the BUILT dist: rebuild after src/ changes. Throwaway checks: `npx vite preview --port <spare> --strictPort`.
```
zsh gotcha: `echo ======` fails ("= not found"); quote it.

## Known gaps

- Matrix: `test:matrix` projects only run `matrix.spec.ts` (`testMatch`), so `--grep "VC-13"` finds no tests; fontsize.spec.ts was run
  across the six launchable projects with a throwaway config (not committed). Edge 141/140 cannot launch here (documented).
- VC-1319 skips in Gecko/WebKit by design (NFR-1301 is Chromium-only).
- macOS only: `Control+m` (CodeMirror binds Shift-Alt-m) breaks layout VC-407/VC-431, presentation VC-052, symbols VC-315, completion VC-608;
  VC-315 and VC-608 verified green with `Shift+Alt+m` temporarily. Pass-expected on Linux CI.
- VC-1206 is skipped on darwin (brackets baseline records only linux-x64); pre-existing, CI records its own.
- Slack at 900 px toolbar is only ~10-16 px; wider OS fonts could compress Run (D-005).
- No `requestMeasure`/scroll restoration exists or is needed (D-006).
- Measured: apply latency 11-24 ms (<= 50); app gzip delta +1459 B vs 424e43c (<= 2048 / VC-814 4096), 13 precache URLs unchanged.
