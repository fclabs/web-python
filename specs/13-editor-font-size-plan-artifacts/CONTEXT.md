# CONTEXT — Editor Font Size (spec 13)

Rewritten in place at the end of every iteration. Last updated: Iteration 1.

## Current state

Iteration 1 of 4 complete (core module, strings, first-paint bootstrap). Branch `feat/editor-font-size`
(from `main` at `424e43c`). There is **no UI yet**: no button, no menu. A stored size is validated,
applied through `--editor-font-size` before first paint (inline script) and again on boot (`main.ts`), and
read by the editor content and gutter CSS rules. Nothing writes the key yet (`saveFontSize` exists, unused).

Measured (Chromium, built dist): at default, computed font-size of `.cm-content`, `.cm-gutters`, `.cm-line`,
`.cm-editor`, toolbar, `#btn-run`, `#console` is `14px`, line-height `19.6px` — identical to `main`.
With stored `24`: content/gutters/line `24px` (line-height `33.6px`); `.cm-editor`, toolbar, console stay `14px`.

## File map

| Path | Role |
|---|---|
| `src/fontsize.ts` | NEW. Key, presets, validator, load/save, apply. DOM-free except `applyFontSize`. |
| `src/format.ts` | + `FONT_SIZE_LABEL`, `FONT_SIZE_NAME`, `FONT_SIZE_ITEM`, `FONT_SIZE_SAVE_FAILED` (before "Mode table labels"). |
| `index.html` | + second inline `<script>` in `<head>`, directly after the diagnostics-height script, before `</head>`. |
| `src/styles.css` | `.cm-editor .cm-content` and `.cm-editor .cm-gutters` get `font-size: var(--editor-font-size, 14px)`. |
| `src/main.ts` | `boot()` calls `applyFontSize(loadFontSize(storage))` right after `getWorkspaceStorage()`. |
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

## Conventions & invariants

- Allow-list lives twice (BR-1304): `FONT_SIZES` and the `ALLOWED` literal in `index.html`; VC-1317 guards it
  (see D-001). Changing one means changing both.
- Applying a size is a CSS-variable write only — no `EditorView` reference, no transaction (BR-1305).
- Non-canonical stored values are left in place; only a visitor selection overwrites (BR-1303, FR-1313).
- Control (Iteration 2) must never use `disabled`/`setInert` (FR-1315, BR-1306); strings only from `format.ts`.
- Cite FR/BR/NFR/VC in comments for non-obvious lines.
- `applyFontSize` at boot sets an explicit `14px` when nothing is stored; harmless and idempotent.

## Commands

```bash
npx vitest run tests/unit/fontsize.test.ts
npx tsc --noEmit && npm run test:unit && npm run build
# Playwright serves the BUILT dist: rebuild after src/ changes. Throwaway checks: `npx vite preview --port <spare> --strictPort`.
```
zsh gotcha: `echo ======` fails ("= not found"); quote it.

## Known gaps

- No button, menu, label, selection handling, persistence on selection or notice (Iteration 2).
- No e2e tests yet; VC-1309/VC-1312 only smoke-checked by a throwaway script (formal in Iterations 2/3).
- No `view.requestMeasure()` / scroll preservation; whether CodeMirror remeasures after a CSS-only size change is
  unverified (VC-1308/VC-1325, Iteration 3).
- No contrast/perf/payload evidence yet (Iteration 3). Docs under `docs/` and `CLAUDE.md` not yet updated (Iteration 4).
