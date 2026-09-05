# CONTEXT — Minimal Diagnostics Under Input

Living state after Iteration 1. Rewrite each iteration; do not append.

## Feature goal (reminder)

In `data-layout="vertical"` (≥ 900 px), diagnostics starts header-only; visitors
resize console ↔ diagnostics via `#diag-resizer`; height persists under
`pyplay.diagnostics-height.v1`. Horizontal / stacked layout unchanged.

## File map (this feature)

| Path | Role |
|---|---|
| `src/diag-resize.ts` | Pure load / save / parse / clamp / max helpers + constants (Iteration 1) |
| `src/format.ts` | Adds `DIAG_RESIZER_LABEL`, `DIAG_HEIGHT_SAVE_FAILED` |
| `tests/unit/diag-resize.test.ts` | Unit coverage for helpers + string quotes (VC-909 core) |
| `src/layout.ts` | Unchanged — pattern reference for StorageLike load/save |
| `src/storage.ts` | Unchanged — `StorageLike` / `getLocalStorage` reused |

Not yet touched (later iterations): `index.html`, `src/styles.css`, `src/main.ts`,
`src/file-pane.ts` (pattern only), e2e specs, `docs/architecture.md`.

## Public interfaces shipped so far

From `src/diag-resize.ts`:

- `DIAG_HEIGHT_KEY` = `'pyplay.diagnostics-height.v1'`
- `DIAG_HEIGHT_STEP` = `16`
- `DIAG_HEIGHT_STEP_LARGE` = `48`
- `DIAG_HEIGHT_MAX_RATIO` = `0.4`
- `DIAG_CONSOLE_MIN` = `80`
- `isCanonicalDiagHeight(raw: string): boolean`
- `loadDiagHeight(storage: StorageLike | null): number | null`
- `saveDiagHeight(storage: StorageLike | null, height: number): boolean`
- `clampDiagHeight(height: number, bounds: { min: number; max: number }): number`
- `maxDiagHeight(rightColumnHeight: number, consoleMin?: number): number`

From `src/format.ts`:

- `DIAG_RESIZER_LABEL` = `'Resize diagnostics panel'`
- `DIAG_HEIGHT_SAVE_FAILED` = `"Diagnostics height won't be remembered"`

## Known gaps

- No DOM `#diag-resizer`, no CSS `--diagnostics-height`, no first-paint bootstrap
- No pointer / keyboard wiring, no `setInert`, no Notices integration
- Header-only default grid still uses legacy `0.66fr` diagnostics track
- No Playwright / contrast / perf coverage yet
