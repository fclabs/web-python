# Iteration 1 — Core module, strings and first-paint bootstrap

Branch: `feat/editor-font-size` (created from `main` @ `424e43c`). Commit: see `git log` (message
`feat(editor): apply a stored font size to the editor before first paint`; SHA reported in the handoff).

## Criteria results
1. PASS — `npx vitest run tests/unit/fontsize.test.ts`: 25 passed (VC-1313, VC-1311 write half, VC-1317).
2. PASS — `npx tsc --noEmit` clean; `npm run test:unit`: 25 files / 309 tests passed; `npm run build` succeeded.
3. PASS — throwaway Playwright script (not committed) against `vite preview --port 4373` of the fresh build:
   stored `24` -> `.cm-content`, `.cm-gutters`, `.cm-line` = `24px`; no key -> `14px`; stored `16px` (invalid) -> `14px`;
   toolbar, `#btn-run`, `#console`, `.cm-editor` = `14px` in all cases.
4. PASS — default computed sizes on `main` (built before any change): content `14px`, gutters `14px`, line `14px`,
   line-height `19.6px`; after the change at default: identical numbers.
5. PASS — artifacts exist (`CONTEXT.md`, `DECISIONS.md`, this file) and match the code.

## Files
Added: `src/fontsize.ts`, `tests/unit/fontsize.test.ts`, `specs/13-editor-font-size-plan-artifacts/{CONTEXT,DECISIONS}.md`,
this record; also committed the previously untracked `specs/13-editor-font-size.md`, `specs/13-editor-font-size-plan.md`.
Changed: `src/format.ts`, `index.html`, `src/styles.css`, `src/main.ts`. Deleted: none.

## Deviations
None. (`FONT_SIZE_ITEM` hard-codes `14` for the "(default)" suffix instead of importing `FONT_SIZE_DEFAULT`.)

## Gotchas
- Before the change `.cm-content` had no explicit font-size; it inherited `14px` from `body`, so the `14px`
  fallback reproduces the old look exactly. `.cm-editor` is deliberately left at the inherited size.
- Line-height is relative (`1.4`), so it scales with the variable (33.6px at 24).
- zsh: `echo ======` errors; quote it. Playwright config starts its own servers; the smoke used a separate vite preview.
- `applyFontSize` in `boot()` writes an explicit `14px` when nothing is stored (bootstrap sets nothing).

## For the next iteration
- Use `saveFontSize`/`applyFontSize`/`loadFontSize` from `src/fontsize.ts` and the four `format.ts` constants; skip the
  write and notice when the chosen size equals the current one (FR-1311). `main.ts` already has `storage`; boot applies
  the size right after `getWorkspaceStorage()`.
- Bootstrap sits after the diagnostics-height script in `<head>`; no markup for the button/menu exists yet.
- Old inline test names: VC-1313/1311/1317 live in `tests/unit/fontsize.test.ts`; do not duplicate them in e2e.
- Verify in Iteration 3 whether CodeMirror remeasures after a pure CSS change (line-height changes with size).
