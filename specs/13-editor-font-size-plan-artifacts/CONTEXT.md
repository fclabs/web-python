# CONTEXT — Editor Font Size (spec 13)

Rewritten in place at the end of every iteration. Last updated: Iteration 2.

## Current state

Iterations 1-2 of 4 complete. The toolbar has `#btn-fontsize` (label `Font size: N`, `aria-label` `Font size: N px`) opening
`#fontsize-menu` (six `menuitemradio` items). Choosing a different size applies `--editor-font-size`, writes
`pyplay.fontsize.v1` synchronously, and shows `FONT_SIZE_SAVE_FAILED` once per load if the write fails. Equal size: no write, no
notice. Never inert. At >= 900 px the shared toolbar padding is trimmed so the button fits (D-005). State preservation,
side-effect proof, contrast/perf budgets and storage-surface tests are Iteration 3; docs Iteration 4.
Measured earlier: default computed font size of content/gutters/line `14px`, line-height `19.6px`; at `24` they scale, rest unchanged.

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
| `tests/e2e/fontsize.spec.ts` | NEW. VC-1301-1307, 1309, 1311, 1312, 1314, 1315, 1316, 1322, 1327. |
| `tests/unit/fontsize.test.ts` | NEW. VC-1313, VC-1311 (write half), VC-1317, constants/strings, `applyFontSize`. |

## Public interfaces

`src/fontsize.ts`:
```ts
export const FONT_SIZE_KEY = 'pyplay.fontsize.v1';
export const FONT_SIZES: readonly number[] = [12, 14, 16, 18, 20, 24];
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

Inline bootstrap (`index.html`): `var ALLOWED = ['12','14','16','18','20','24']`; sets the variable only when
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

- VC-1308/1310/1318/1319/1320/1321/1325/1326 not yet written/proven (Iteration 3).
- Slack at 900 px is only ~10-16 px; wider OS fonts could compress Run (D-005).
- No `view.requestMeasure()` / scroll preservation; whether CodeMirror remeasures after a CSS-only size change is
  unverified (VC-1308/VC-1325, Iteration 3).
- No contrast/perf/payload evidence yet (Iteration 3). Docs under `docs/` and `CLAUDE.md` not yet updated (Iteration 4).
