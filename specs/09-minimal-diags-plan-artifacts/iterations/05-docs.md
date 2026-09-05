# Iteration 05 — Architecture documentation

## Criteria

| Criterion | Command / check | Result |
|---|---|---|
| `docs/architecture.md` documents key, separator, default, bounds; no plan/spec filename/artifact-dir refs | Manual review of updated sections | **PASS** |
| README updated or judged unchanged | Judged unchanged (see below) | **PASS** |
| Every DECISIONS entry reflected or marked internal | D-01–D-03, D-05 in architecture; D-04, D-06 internal | **PASS** |
| `npm run build` exits 0 | `npm run build` | **PASS** (run before commit) |
| Artifacts: final CONTEXT + this record | Written under artifact directory | **PASS** |

## README judgment

**Unchanged.** `README.md` does not enumerate the full `localStorage` surface
(it only names `pyplay.workspace.v1` and `pyplay.theme.v1` in passing, already
omitting `pyplay.layout.v2`) and has no catalog of focusable controls / Tab
order beyond the layout radiogroup. Adding the diagnostics key or resizer
there would invent a new inventory style the README does not use; the
normative list lives in `docs/architecture.md`.

## DECISIONS reflection

| Entry | Disposition |
|---|---|
| D-01 — `maxDiagHeight` formula | **Reflected** — architecture: max is lesser of 40 % column height and console 80 px floor |
| D-02 — header-only CSS fallback | **Reflected** — `var(--diagnostics-height, auto)` + flex collapse of list/empty |
| D-03 — vertical grid / `diagsep` | **Reflected** — row tracks and `#diag-resizer` → `grid-area: diagsep` |
| D-04 — `mountDiagResizer` / `sync` | **Internal** — wiring entrypoint; not needed for human architecture prose |
| D-05 — min from title + padding | **Reflected** — content-derived minimum from title row + panel padding |
| D-06 — pin-to-min before max measure | **Internal** — measure-order gotcha for implementers; not visitor-facing |

No new DECISIONS entry this iteration.

## Commit-ready file list

- `docs/architecture.md`
- `specs/09-minimal-diags-plan-artifacts/CONTEXT.md`
- `specs/09-minimal-diags-plan-artifacts/iterations/05-docs.md` (this file)

## Deviations

None. Docs-only; no product code.

## Gotchas

- Shipped docs must not name the plan file, `09-minimal-diags`, or the artifact
  directory — verified with a search before commit.
- Issue #21 is named once as the out-of-scope hide/collapse boundary.

## For the next iteration

None — final iteration. Orchestrator runs Final Verification (full suite +
verify-spec).
