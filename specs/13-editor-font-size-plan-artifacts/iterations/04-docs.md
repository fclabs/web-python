# Iteration 4 — Documentation, matrix and acceptance

Branch `feat/editor-font-size`. Commit `docs(editor): document the font size control and storage key` (SHA: `git log -1`).

## Criteria results
1. PASS - `docs/architecture.md`: new *Editor font size* section, *Storage surface* "six things" + `pyplay.fontsize.v1` row + paragraph,
   *Toolbar presentation clustering* order `... #btn-symbols -> #btn-fontsize -> #btn-theme -> #btn-about`. `CLAUDE.md`: five
   localStorage keys + Cache Storage bucket, font-size bootstrap bullet. `grep -rn "plan-artifacts\|13-editor-font-size" docs CLAUDE.md`: no output.
2. PASS (vacuous) - the new docs quote no shell command (only file names, keys, selectors, CSS), so there is nothing to run. Commands
   used for verification are listed below.
3. PASS for Chromium, matrix with notes:
   - `npm run build && npx playwright test tests/e2e/fontsize.spec.ts`: 37 passed, 0 skipped.
   - `MATRIX=1 npm run test:matrix -- --grep "VC-13"` -> "No tests found": the matrix projects have `testMatch: matrix.spec.ts`. Instead a
     throwaway copy of the config (testMatch -> fontsize.spec.ts, deleted, not committed) ran fontsize.spec.ts in chrome-141, chrome-140,
     firefox-145, firefox-144, safari-26.1, safari-26.0 (`npx playwright install firefox webkit` first): 218 passed, 4 skipped. The 4 skips are
     VC-1319 in the Gecko/WebKit projects (spec: NFR-1301 "in Chromium"; test self-skips). edge-141/edge-140 cannot launch (Edge not installed;
     documented in *Browser matrix*). `chromium` default project: VC-1319 runs and passes.
   - First matrix run found 2 real test fragilities, fixed in tests only (no threshold touched): VC-1308 precondition (line 80 first visible)
     got 79 in Gecko/WebKit due to sub-pixel scrollTop (+1 px); VC-1325 typed `x` at doc start in real Chrome (re-set caret + 2 frames).
4. PASS - VC-1324 is its own test in `tests/e2e/fontsize.spec.ts` (keyboard to 20, reload, label/size, choose 14 by menu, reload; outside-pane sizes and program text unchanged).
5. Acceptance sequence:
   - `npx tsc --noEmit` PASS. `npm run test:unit` PASS (25 files, 309 tests). `npm run build` PASS (13 precache URLs).
   - `npx playwright test`: 313 passed, 5 failed, 34 skipped. Failures (all `Control+m`, macOS-only): layout VC-407, VC-431; presentation VC-052;
     symbols VC-315; completion VC-608. VC-315 and VC-608 confirmed green with `Shift+Alt+m` swapped in temporarily (reverted); VC-608 also fails on the
     previous commit. Skips: 32 matrix-project tests (`matrix.spec.ts` without MATRIX=1: VC-055, VC-324, VC-432, VC-516 x 8 projects), VC-059 (six-minute),
     VC-1206 (no darwin baseline). 34 total.
   - `npm run audit:perf`: 7 passed, 1 skipped (VC-1206). VC-814 delta 1459 B <= 4096. `npm run audit:contrast`: 10 passed.
   - `npx playwright test --grep "VC-13"`: 37 passed, none skipped; VC-1313/1317 are unit tests, VC-1320 is audit:perf, VC-1323 is the matrix run above.

## Regressions found and fixed (test-only, from Iteration 2)
VC-301 (`symbols.spec.ts`) asserted Symbols is followed by `#btn-theme`; VC-315 expected tab stops without `#btn-fontsize` and a tab budget of 21.
Amended to the new order and a budget of 22 (a count of stops, not a time/size threshold). Iteration 2 had not run symbols.spec.ts.

## DECISIONS judgements
D-001 documented (unit-test guard). D-002 documented (menu module holds no editor/storage). D-003 documented (positioning). D-004 documented (Esc, divs, sibling
placement, About-modal ArrowDown). D-005 documented (spacing trim). D-006 documented (no measure/scroll code). D-007 internal (spec VC wording only).
D-008 internal/already shipped (CONTRIBUTING pin table in its own commit). D-009 internal (test + audit grep).

## Baselines
No re-record: the geometry baselines still matched (no skip in layout.spec.ts) and the About pin moved earlier.

## Files
Changed: `docs/architecture.md`, `CLAUDE.md`, `tests/e2e/fontsize.spec.ts` (+VC-1324, 2 stability fixes), `tests/e2e/symbols.spec.ts`, `CONTEXT.md`, this record.
Sibling specs 05/08/09 not edited (amendments are recorded in the amending spec; spec 13's header names them).

## Open items for the PR
- `test:matrix -- --grep "VC-13"` cannot select fontsize.spec.ts as `playwright.config.ts` limits matrix projects to `matrix.spec.ts`; consider adding it
  to the matrix `testMatch` (config change deliberately not made here).
- VC-1319 skips outside Chromium by spec; VC-1323's "no skips" is satisfied in Chromium only for that test.
- Edge 141/140 not run; macOS `Control+m` failures (5) expected green on Linux CI.
- Spec 13 is not frozen; run `/freeze-spec` after merge. Toolbar slack at 900 px is ~10-16 px.
