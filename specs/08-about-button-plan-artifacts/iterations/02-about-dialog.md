# Iteration 02 — Toolbar control + modal dialog

## Criteria

| Criterion | Command | Result |
|---|---|---|
| VC-801–806, 808, 818, 821, 823, 824 | `PW_PORT_BASE=4473 npm run build` then `npx playwright test tests/e2e/about.spec.ts` | **PASS** (11 tests) |
| `#about-commit` has no `a[href]` | Asserted inside VC-802 | **PASS** |
| Amended theme / symbols | `npx playwright test tests/e2e/theme.spec.ts tests/e2e/symbols.spec.ts` | **PASS** (70 total with about; theme+symbols green) |
| Unit suite unchanged | `npx vitest run` | **PASS** (231 tests) |
| Artifacts | `CONTEXT.md`, `DECISIONS.md` D-003, this file | **PASS** |

## Commit

- Message: `feat(about): add About toolbar control and modal dialog`
- Tip: recorded by orchestrator / `git log -1` after commit.

## Files touched

**Added**

- `src/about.ts`
- `tests/e2e/about.spec.ts`
- `specs/08-about-button-plan-artifacts/iterations/02-about-dialog.md`

**Changed**

- `index.html` — `#btn-about` + dialog/backdrop markup
- `src/main.ts` — `bindAboutControl` after theme
- `src/styles.css` — About button + modal styles
- `tests/e2e/theme.spec.ts` — VC-501 / VC-511 / VC-519
- `tests/e2e/symbols.spec.ts` — VC-301 / VC-315
- `tests/e2e/presentation.spec.ts` — CONTROLS + tab targets
- `tests/e2e/layout.spec.ts` — VC-407 enumeration
- `specs/08-about-button-plan-artifacts/CONTEXT.md`
- `specs/08-about-button-plan-artifacts/DECISIONS.md` — D-003

## Deviations

- Also amended `presentation.spec.ts` and `layout.spec.ts` (plan named them as parent/sibling toolbar lists) so later full regression is not blocked by theme-is-last assumptions.
- VC-824 uses `dispatchEvent('click')` on `#btn-run` rather than a geometric mouse click, because a pointer at Run’s centre hits `#about-backdrop` and is the FR-806 dismiss path.

## Gotchas

- After `src/` changes, always `npm run build` before Playwright (reuses preview server).
- Worktree: set `PW_PORT_BASE` (this run used `4473`).
- Playwright `click({ force: true })` still hits the topmost element at the point — does not prove FR-819.

## For the next iteration

- Module: `src/about.ts` → `bindAboutControl(button: HTMLButtonElement): void`.
- Markup: in `index.html` (not created in JS); custom overlay (D-003).
- Amended siblings: `theme.spec.ts`, `symbols.spec.ts`, `presentation.spec.ts`, `layout.spec.ts`.
- Dialog is modal; backdrop covers chrome; geometric backdrop click dismisses; synthetic chrome click swallowed.
- Offline / zero-request (VC-807) and remaining VC-812 DOM half are Iteration 3 — do not touch docs or perf budgets yet.
- Branch-point SHA still `e569b8119e6ce797d49930fddcfb9fbec5fbd578`.
