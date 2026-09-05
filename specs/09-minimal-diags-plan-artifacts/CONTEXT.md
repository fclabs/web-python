# CONTEXT — Minimal Diagnostics Under Input

Living state after Iteration 5 (shipped). Rewrite each iteration; do not append.

## Feature goal

In `data-layout="vertical"` (≥ 900 px), diagnostics starts header-only; visitors
resize console ↔ diagnostics via `#diag-resizer`; height persists under
`pyplay.diagnostics-height.v1`. Horizontal / stacked layout keeps
`max-height: 25vh` on diagnostics. Hide/collapse of either panel is out of
scope (issue #21).

## File map (shipped)

| Path | Role |
|---|---|
| `src/diag-resize.ts` | Pure load / save / parse / clamp / max / min-from-measurements helpers + `mountDiagResizer` controller |
| `src/format.ts` | `DIAG_RESIZER_LABEL`, `DIAG_HEIGHT_SAVE_FAILED` |
| `src/main.ts` | Calls `mountDiagResizer(...)`; `renderLayout` invokes `diagResizer.sync()` |
| `src/controls.ts` | `setInert` / `isInert` (resizer never uses HTML `disabled`) |
| `tests/unit/diag-resize.test.ts` | Unit coverage for helpers + string quotes + min-from-measurements |
| `index.html` | `#diag-resizer` DOM; render-blocking `--diagnostics-height` bootstrap |
| `src/styles.css` | Vertical grid: `diagsep` track + `var(--diagnostics-height, auto)`; header-only flex collapse; `.diag-resizer` chrome |
| `src/layout.ts` | `LAYOUT_MIN_WIDTH` (900) — activity gate for the separator |
| `src/storage.ts` | Unchanged — `StorageLike` reused |
| `tests/e2e/diag-resize.spec.ts` | VC-901–VC-913 (NFR-901 / 903 / 904 in VC-912) |
| `tests/e2e/baseline-build-diag-resize.json` | Merge-base `e569b81` app-payload baseline for NFR-904 |
| `tests/e2e/layout.spec.ts` | VC-409 / VC-435 green; VC-407 / VC-431 / VC-435 adapted for header-only + resizer tab stop |
| `tests/e2e/presentation.spec.ts` | NFR-902 separator resting / hover / focus in VC-071 / VC-514 |
| `package.json` | `audit:perf` grep includes VC-912 |
| `docs/architecture.md` | Persisted-state table + diagnostics height / `#diag-resizer` narrative |

## Public interfaces

From `src/diag-resize.ts`:

- `DIAG_HEIGHT_KEY` = `'pyplay.diagnostics-height.v1'`
- `DIAG_HEIGHT_STEP` = `16`
- `DIAG_HEIGHT_STEP_LARGE` = `48`
- `DIAG_HEIGHT_MAX_RATIO` = `0.4`
- `DIAG_CONSOLE_MIN` = `80`
- `isCanonicalDiagHeight` / `loadDiagHeight` / `saveDiagHeight` / `clampDiagHeight` / `maxDiagHeight`
- `minDiagHeightFromMeasurements`
- `mountDiagResizer(options): DiagResizerHandle` — `{ sync(): void }`

From `src/format.ts`:

- `DIAG_RESIZER_LABEL` = `'Resize diagnostics panel'`
- `DIAG_HEIGHT_SAVE_FAILED` = `"Diagnostics height won't be remembered"`

DOM / CSS:

- `#diag-resizer` / `.diag-resizer` — non-panel sibling after editor, before stdin
- `--diagnostics-height` on `document.documentElement`
- Grid area `diagsep`

Documentation: `docs/architecture.md` documents the key, separator, header-only
default, bounds, clamp-without-rewrite, and that horizontal still uses `25vh`.
`README.md` was judged unchanged (no full key / focusable-control inventory).

## Known gaps

None for this feature. Final verification (full suite + verify-spec) is the
orchestrator's follow-up after this iteration commit.
