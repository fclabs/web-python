# CONTEXT — Minimal Diagnostics Under Input

Living state after Iteration 4. Rewrite each iteration; do not append.

## Feature goal (reminder)

In `data-layout="vertical"` (≥ 900 px), diagnostics starts header-only; visitors
resize console ↔ diagnostics via `#diag-resizer`; height persists under
`pyplay.diagnostics-height.v1`. Horizontal / stacked layout unchanged.

## File map (this feature)

| Path | Role |
|---|---|
| `src/diag-resize.ts` | Pure load / save / parse / clamp / max / min-from-measurements helpers + `mountDiagResizer` controller |
| `src/format.ts` | `DIAG_RESIZER_LABEL`, `DIAG_HEIGHT_SAVE_FAILED` |
| `src/main.ts` | Calls `mountDiagResizer(...)`; `renderLayout` invokes `diagResizer.sync()` |
| `src/controls.ts` | `setInert` / `isInert` (resizer never uses HTML `disabled`) |
| `tests/unit/diag-resize.test.ts` | Unit coverage for helpers + string quotes + min-from-measurements |
| `index.html` | `#diag-resizer` DOM (FR-913); render-blocking `--diagnostics-height` bootstrap (FR-910) |
| `src/styles.css` | Vertical grid: `diagsep` track + `var(--diagnostics-height, auto)`; header-only flex collapse (D-02); `.diag-resizer` chrome |
| `src/layout.ts` | `LAYOUT_MIN_WIDTH` (900) — activity gate for the separator |
| `src/storage.ts` | Unchanged — `StorageLike` reused |
| `tests/e2e/diag-resize.spec.ts` | VC-901–VC-913 (NFR-901 / 903 / 904 in VC-912) |
| `tests/e2e/baseline-build-diag-resize.json` | Merge-base `e569b81` app-payload baseline for NFR-904 |
| `tests/e2e/layout.spec.ts` | VC-409 / VC-435 kept green; VC-407 / VC-431 / VC-435 adapted for header-only + resizer tab stop |
| `tests/e2e/presentation.spec.ts` | NFR-902 separator resting / hover / focus in VC-071 / VC-514 |
| `package.json` | `audit:perf` grep includes VC-912 |

Not yet touched: `docs/architecture.md` (Iteration 5).

## Public interfaces shipped so far

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

E2E (Iteration 4):

- Spec file: `tests/e2e/diag-resize.spec.ts`
- NFR-904 merge-base commit: `e569b81` (recorded in `baseline-build-diag-resize.json`)
- Contrast separator samples live in `presentation.spec.ts` (VC-071 / VC-514)

## Known gaps

- `docs/architecture.md` still describes the old `0.66fr` track (Iteration 5)
