# CONTEXT — Minimal Diagnostics Under Input

Living state after Iteration 3. Rewrite each iteration; do not append.

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

Not yet touched (later iterations): Playwright e2e suite / contrast / perf
(Iteration 4); `docs/architecture.md` (Iteration 5).

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
- `minDiagHeightFromMeasurements({ titleHeight, panelPaddingTop, panelPaddingBottom }): number`
- `mountDiagResizer(options): DiagResizerHandle` — `{ sync(): void }`
- `DiagResizerOptions` / `DiagResizerHandle` / `DiagResizerNotices`

From `src/format.ts`:

- `DIAG_RESIZER_LABEL` = `'Resize diagnostics panel'`
- `DIAG_HEIGHT_SAVE_FAILED` = `"Diagnostics height won't be remembered"`

DOM / CSS:

- `#diag-resizer` / `.diag-resizer` — non-panel sibling after editor, before stdin
- `--diagnostics-height` on `document.documentElement`
- Grid area `diagsep`

Controller behaviour (Iteration 3):

- Active only when effective layout is `vertical` and viewport ≥ 900; otherwise
  `hidden` + `setInert(true)` (never `disabled`)
- Applies height via `--diagnostics-height` + `aria-valuemin` / `max` / `now`
- Pointer: upward grows, downward shrinks; persist on pointerup/cancel only
- Keyboard: ArrowUp/Down ±16, Shift ±48; persist when height changes
- Viewport / layout clamp: in-memory + aria only — no storage rewrite
- Persist failure: keep height; `DIAG_HEIGHT_SAVE_FAILED` at most once per load

## Known gaps

- No Playwright / contrast / perf coverage yet (Iteration 4)
- `docs/architecture.md` still describes the old `0.66fr` track (Iteration 5)
