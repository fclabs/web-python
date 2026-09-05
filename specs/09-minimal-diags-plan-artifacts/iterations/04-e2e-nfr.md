# Iteration 04 — Playwright coverage and NFR gates

## Criteria

| Criterion | Command | Result |
|---|---|---|
| Build | `npm run build` | **PASS** |
| VC-901 … VC-911, VC-913 | `PW_PORT_BASE=4473 npx playwright test tests/e2e/diag-resize.spec.ts --project=chromium` | **PASS** (13 tests) |
| Layout suite (incl. rewritten VC-407 / 431 / 435) | `PW_PORT_BASE=4473 npx playwright test tests/e2e/diag-resize.spec.ts tests/e2e/layout.spec.ts --project=chromium` | **PASS** (60 tests) |
| VC-409 | `PW_PORT_BASE=4473 npx playwright test --project=chromium --grep "VC-409"` | **PASS** (3 tests) |
| VC-435 | `PW_PORT_BASE=4473 npx playwright test --project=chromium --grep "VC-435"` | **PASS** (2 tests) |
| Contrast + separator (NFR-902) | `PW_PORT_BASE=4473 npm run audit:contrast` | **PASS** (8 tests) |
| VC-912 latency + size (NFR-901 / 903 / 904) | `PW_PORT_BASE=4473 npx playwright test --project=chromium --grep "VC-912"` | **PASS** — hit 8 px; paint 11–25 ms; longest task 0 ms; delta 1.29 KiB vs `e569b81` |

Per-VC titles in `tests/e2e/diag-resize.spec.ts`:

| VC | Test title |
|---|---|
| VC-901 | header-only default hides entries and empty text |
| VC-902 | separator between console and stdin with ARIA contract |
| VC-903 | pointer drag upward clamps at 40 % / console ≥ 80 |
| VC-904 | pointer drag downward stops at header-only minimum |
| VC-905 | ArrowUp/Down steps are 16 px, Shift 48 px |
| VC-906 | resizer inert in horizontal and at 375 px |
| VC-907 | mid-range height restores on reload |
| VC-908 | oversize stored height clamps without rewrite |
| VC-909 | non-canonical / missing height yields the minimum |
| VC-910 | failed setItem shows the notice once |
| VC-911 | resize leaves editor/console/layout/theme alone; never disabled |
| VC-912 | hit target, apply-height ≤ 50 ms, ≤ 2 KB gzipped |
| VC-913 | enlarge, persist, layout and viewport round-trip |

NFR-902 contrast samples: `diag-resizer resting`, `focus ring (diag-resizer)`, `diag-resizer hover` in VC-071 (and resting/focus in VC-514 via `NON_TEXT_SAMPLES`).

## Commit-ready file list

- `tests/e2e/diag-resize.spec.ts` (new)
- `tests/e2e/baseline-build-diag-resize.json` (merge-base `e569b81`)
- `tests/e2e/layout.spec.ts` (VC-435 / VC-407 / VC-431 adaptations)
- `tests/e2e/presentation.spec.ts` (separator contrast + vertical seed in `paintEverySurface`)
- `package.json` (`audit:perf` includes VC-912)
- `specs/09-minimal-diags-plan-artifacts/CONTEXT.md`
- `specs/09-minimal-diags-plan-artifacts/iterations/04-e2e-nfr.md` (this file)

## Deviations

- No new DECISIONS entry — NFR-904 baseline recording and tab-order expectation updates follow existing patterns (D-01–D-06 unchanged).
- VC-912 size/latency live in `diag-resize.spec.ts`; contrast portion stays in `presentation.spec.ts` (VC-071) so `npm run audit:contrast` covers NFR-902 without duplicating the full palette matrix.
- VC-407 no longer asserts identical tab sequences across layouts: vertical inserts `diag-resizer` between editor and stdin (FR-913). Title updated accordingly.

## Gotchas

- Init scripts that `removeItem` the height key on every navigation break VC-907 / VC-913; clear once per context via a `sessionStorage` flag (same lesson as Iteration 3 smoke).
- Pointer-clicking layout radios before contrast sampling clears `:focus-visible`; seed `pyplay.layout.v2=vertical` in `paintEverySurface` instead.
- Worktree: always set `PW_PORT_BASE` (here `4473`) so Playwright does not attach to another checkout’s preview server.

## For the next iteration

- Hands-off: e2e coverage is in place; merge-base for NFR-904 is `e569b81`.
- Iteration 5: update `docs/architecture.md` (replace `0.66fr` narrative; document key, separator, default, bounds, clamp-without-rewrite); README only if it lists storage keys / focusable controls.
- Synthesise DECISIONS D-01–D-06 into architecture rationale or mark internal; drop plan/spec/artifact references from shipped docs.
