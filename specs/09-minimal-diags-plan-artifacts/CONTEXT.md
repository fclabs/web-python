# CONTEXT — Minimal Diagnostics Under Input

Living state after Iteration 2. Rewrite each iteration; do not append.

## Feature goal (reminder)

In `data-layout="vertical"` (≥ 900 px), diagnostics starts header-only; visitors
resize console ↔ diagnostics via `#diag-resizer`; height persists under
`pyplay.diagnostics-height.v1`. Horizontal / stacked layout unchanged.

## File map (this feature)

| Path | Role |
|---|---|
| `src/diag-resize.ts` | Pure load / save / parse / clamp / max helpers + constants (Iteration 1) |
| `src/format.ts` | `DIAG_RESIZER_LABEL`, `DIAG_HEIGHT_SAVE_FAILED` |
| `tests/unit/diag-resize.test.ts` | Unit coverage for helpers + string quotes (VC-909 core) |
| `index.html` | `#diag-resizer` DOM (FR-913); render-blocking `--diagnostics-height` bootstrap (FR-910) |
| `src/styles.css` | Vertical grid: `diagsep` track + `var(--diagnostics-height, auto)`; header-only flex collapse (D-02); `.diag-resizer` chrome |
| `src/layout.ts` | Unchanged — pattern reference for StorageLike load/save |
| `src/storage.ts` | Unchanged — `StorageLike` / `getLocalStorage` reused |

Not yet touched (later iterations): `src/main.ts` (resize controller / `setInert` /
Notices), pointer/keyboard persistence, e2e specs, `docs/architecture.md`.

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

DOM / CSS (Iteration 2):

- `#diag-resizer` / `.diag-resizer` — non-panel sibling after editor, before stdin;
  `role="separator"`, `aria-orientation="horizontal"`, label matching
  `DIAG_RESIZER_LABEL`, placeholder `aria-valuemin` / `max` / `now`, `tabindex="0"`
- CSS custom property `--diagnostics-height` on `document.documentElement` (bootstrap
  sets `Npx` when the stored value is canonical)
- Grid area name for the separator track: `diagsep`

## Known gaps

- No pointer / keyboard wiring, no `setInert`, no Notices integration (Iteration 3)
- `aria-valuemin` / `max` / `now` are placeholders until the controller measures
- Resizer visibility is CSS-only (`display: none` outside vertical ≥ 900); Iteration 3
  must call `setInert()` per FR-906
- No Playwright / contrast / perf coverage yet (Iteration 4)
- `docs/architecture.md` still describes the old `0.66fr` track (Iteration 5)
