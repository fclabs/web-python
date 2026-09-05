# Iteration 02 — Placement, tab order, and behaviour e2e

**Goal**: Prove the visual arrangement, the 900 px boundary, unchanged tab
order, and unchanged Symbols / theme behaviour from the new screen position.

**Commit message (intended)**: `test: assert toolbar right-align placement and behaviour (VC-701–708)`

## Criteria results

| Criterion | Command | Result |
|---|---|---|
| Build | `npm run build` | **PASS** — exit 0 |
| VC-701–705, VC-707–708 (all new e2e) | `PW_PORT_BASE=4300 npx playwright test tests/e2e/toolbar-align.spec.ts --project=chromium` | **PASS** — 13 passed, exit 0 |
| VC-701 (both layouts) | (included above; 2 tests named VC-701) | **PASS** |
| VC-702 | (included above) | **PASS** |
| VC-703 | (included above) | **PASS** |
| VC-704 (2 layouts × 2 palettes) | (included above; 4 tests) | **PASS** |
| VC-705 (899, 375, 900) | (included above; 3 tests) | **PASS** |
| VC-707 | (included above) | **PASS** |
| VC-708 | (included above) | **PASS** |
| Regression tab / Symbols / theme | `PW_PORT_BASE=4300 npx playwright test --project=chromium --grep "VC-052\|VC-407\|VC-301\|VC-501"` | **PASS** — 4 passed, exit 0 |

Production JS/HTML unchanged this iteration (tests + artifacts only). Iter 1 CSS
needed no fix.

## Commit-ready file list

- `tests/e2e/toolbar-align.spec.ts` — new e2e for VC-701–705, VC-707, VC-708
- `specs/07-right-align-button-plan-artifacts/CONTEXT.md` — rewritten for Iter 2
- `specs/07-right-align-button-plan-artifacts/DECISIONS.md` — D-002, D-003
- `specs/07-right-align-button-plan-artifacts/iterations/02-e2e-placement.md` (this file)

Not included: `specs/07-right-align-button.md`, `specs/07-right-align-button-plan.md`
(still untracked; leave for the human unless a later iteration says otherwise).

## Hands-off confirmation

- E2e path: `tests/e2e/toolbar-align.spec.ts`.
- Helper APIs: `openPlayground` from `tests/e2e/helpers.ts`; local
  `seedLayout` / `seedTheme` / `themeFlushMeasurement` / `visibleToolbarBoxes`
  / `sameLineGaps` / `editorDocAndUndo` (not exported to helpers.ts).
- VC-701 content-box approach: D-002 (padding + border subtraction).
- Remaining work: VC-709 NFR sweep and `docs/architecture.md` (Iteration 3).

## Deviations from the plan

None. Preferred path `tests/e2e/toolbar-align.spec.ts` used. No production
CSS/JS/HTML edits.

## Gotchas

- Fresh worktree needed `npx playwright install chromium` before headless
  shell was available (`chromium_headless_shell-1234`).
- Always set `PW_PORT_BASE` (used `4300`) in this worktree.
- VC-704 must Tab onto `#btn-run` before recording the ten stops — programmatic
  `.focus()` would skip `:focus-visible` rings (same as VC-407).
- At 899 / 375, gap checks must be same-line only (D-003) or wrap false-fails.

## For the next iteration

Iteration 3 should:

1. Read this artifact directory (`CONTEXT.md`, `DECISIONS.md`, this record).
2. Discharge VC-709: build; toolbar height / element-below top ±1 px vs
   geometry baseline at 1280×800 both layouts; `scrollWidth ≤ 375` at
   375×667 pane open and closed; `npm run audit:contrast`; `npm run
   audit:perf`; confirm `dist/` JS byte totals match the baseline table in
   `CONTEXT.md` (NFR-704).
3. Synthesise human docs into `docs/architecture.md` (visual clustering;
   no plan/spec/artifact references).
4. Rewrite `CONTEXT.md` as shipped state; write `iterations/03-nfr-and-docs.md`.
