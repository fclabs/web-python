# Spec 14 — Toolbar visual grouping (issue #50)

Status: normative. This CSS-only amendment preserves the existing DOM, labels,
activation behavior, inert-but-focusable controls, runtime, offline and performance
contracts. No navigation or new controls are introduced.

## Requirements

- **FR-1401 — Groups:** Run/Stop, Clear console, Copy code/Format/Reset,
  layout/Files/Output, and Symbols/theme/About remain contiguous in DOM order.
  Same-line gaps within groups are 6 ± 1 px; the boundaries before Clear console,
  Copy code, layout and Symbols are 16 ± 1 px. At ≥ 900 px the Output→Symbols
  boundary may grow with the existing auto margin, and About stays flush with
  the toolbar content inline-end. Below 900 px no auto margin applies.
- **FR-1402 — Presentation:** Run retains the existing primary accent tokens.
  Secondary controls and keyboard focus retain their existing theme tokens.
  Controls may wrap below 900 px; at 375 px every control remains fully visible,
  without overlap or horizontal page overflow. Run and Stop stay on the same row,
  including with a long runnable filename; the filename may ellipsize.
- **FR-1403 — Stability:** Loading percentages keep their reserved width. Loading,
  ready and running states must not overlap controls. All existing labels,
  tooltips, DOM and tab order are unchanged. No new user-visible strings are
  needed; `src/format.ts` retains the existing centralized Run label contracts.

## Intentional specification amendments

FR-703/FR-706 and VC-703 previously required exactly one oversized gap;
FR-705/VC-705 required all narrow gaps to be packed. They now require the four
explicit boundaries in FR-1401, with the trailing auto margin only at ≥ 900 px.
FR-1313 and VC-1301 retain Output's placement and trailing utility alignment.
All geometry, contrast and performance tolerances remain unchanged.

## Verification

| ID | Requirements | Check |
| --- | --- | --- |
| VC-1401 | FR-1401, FR-1402 | At 375, 899, 900 and 1280 px, in light and dark, check exact same-line group gaps, control bounds, Run/Stop adjacency and no horizontal overflow. |
| VC-1402 | FR-1402, FR-1403 | At 375 and desktop widths, both themes, delay Python loading, then reach ready and run a long-named Python file; repeat geometry checks and keyboard traversal with visible focus. |

Also run VC-012 (progress stability), VC-701–708 (alignment, order and behavior),
existing geometry and contrast checks and the repository required checks against
a fresh build. Browser-matrix unavailability must be reported, never called a pass.
