# Iteration 03 — NFR sweep and architecture documentation

**Goal**: Discharge VC-709 end-to-end, and synthesise human-facing architecture
notes from the artifacts so a reader understands the visual clustering without
reading the plan.

**Commit message (intended)**: `docs: record toolbar presentation clustering in architecture`

## Criteria results

| Criterion | Command | Result |
|---|---|---|
| Build | `npm run build` | **PASS** — exit 0 |
| NFR-701 geometry (horizontal via VC-408) | `PW_PORT_BASE=4300 npx playwright test --project=chromium --grep "VC-408\|VC-050"` | **PASS** — VC-408 at 1280×800 and 375×667, exit 0 |
| NFR-701 toolbar height both layouts | One-shot Chromium measure vs `baseline-geometry.json` `1280x800.stack.toolbarHeight` (31) | **PASS** — horizontal and vertical both `toolbarHeight` 32 (±1 of baseline) |
| NFR-702 scroll (pane open/closed) | Same grep run: VC-050 pane closed + open; plus measure `scrollWidth` at 375×667 | **PASS** — `scrollWidth` 375 ≤ 375 both pane states |
| NFR-703 contrast | `PW_PORT_BASE=4400 npm run audit:contrast` | **PASS** — 8 passed, exit 0 |
| NFR-704 perf budgets | `PW_PORT_BASE=4400 npm run audit:perf` | **PASS** — 4 passed, 1 skipped (VC-623), exit 0 |
| NFR-704 JS byte count unchanged | `wc -c dist/assets/index-*.js dist/assets/pyodide.worker-*.js dist/sw.js` | **PASS** — sum **469127** identical to Iter 2 baseline |
| Architecture docs | Inspect `docs/architecture.md` | **PASS** — *Toolbar presentation clustering* present; no plan / spec-07 path / artifact-dir references |
| Artifacts | This file + rewritten `CONTEXT.md` + D-004 | **PASS** |

## DECISIONS coverage in shipped docs

| Decision | In architecture prose? | Notes |
|---|---|---|
| D-001 (auto margin only inside `@media (min-width: 900px)`) | **Yes** — explains ≥ 900 px split and why below 900 packs without auto margin |
| D-002 (VC-701 content-box padding/border subtraction) | **Internal** — e2e measurement detail; not visitor-facing architecture |
| D-003 (same-line gap walk for VC-703/705) | **Internal** — e2e measurement detail; not visitor-facing architecture |
| D-004 (subsection placement under layout control) | **Yes** — the subsection lives where D-004 placed it |

## Commit-ready file list

- `docs/architecture.md` — *Toolbar presentation clustering* subsection
- `specs/07-right-align-button-plan-artifacts/CONTEXT.md` — rewritten as shipped state
- `specs/07-right-align-button-plan-artifacts/DECISIONS.md` — D-004
- `specs/07-right-align-button-plan-artifacts/iterations/03-nfr-and-docs.md` (this file)

No production CSS/JS/HTML changes this iteration.

## Deviations from the plan

None. Geometry/scroll discharged via existing VC-408 / VC-050 plus a one-shot
toolbar-height check for vertical (VC-408 covers stacked only). No CSS/test
fixes required — NFRs were already green.

## Gotchas

- Parallel Playwright runs on the same `PW_PORT_BASE` collide (`Port 4300 is
  already in use`); use a free base (e.g. `4400`) or serialise audits.
- VC-623 remains skipped in `audit:perf` (pre-existing; not introduced here).

## For the next iteration

None — this is the final iteration. Final Verification follows at the
orchestrator (full suite + verify-spec).
