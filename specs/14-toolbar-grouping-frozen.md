# Spec 14 — Contextual controls and layout icons (issue #50)

Status: normative. The issue's follow-up design clarification extends its initial
CSS-only scope to icon controls and contextual placement. Runtime, persistence,
offline, inert-but-focusable controls and performance contracts remain unchanged.

## Requirements

- **FR-1401 — Groups:** The main toolbar contains Run/Stop, Reset,
  layout/Files/Output, and Symbols/theme/About, in that order. Same-line gaps
  within groups are 6 ± 1 px; boundaries after Stop, Reset and Output are
  16 ± 1 px. At ≥ 900 px the Output→Symbols boundary may grow with the existing
  auto margin, and About stays flush with the content inline-end.
- **FR-1402 — Presentation:** Run retains its primary accent and visible text.
  Stop, Reset, Files, Output, Symbols, Clear console, Copy code and Format use
  consistent inline SVG icons with existing palette tokens, accessible names
  and title tooltips. Icons are decorative to assistive technology. Hit targets
  are at least 32 × 32 px. At 375 px controls wrap without overlap or horizontal
  page overflow. Run and Stop stay together with long filenames (ellipsis allowed).
- **FR-1403 — Stability:** Loading percentages keep their reserved width. Loading,
  ready and running states must not overlap controls. Existing action labels and
  handlers remain; Copy's success feedback remains accessible and visibly changes
  to a checkmark. Labels and tooltips come from `src/format.ts`.
- **FR-1404 — Layout icons:** The first radio depicts stacked panels and is named
  `Stacked`; the second depicts side-by-side panels and is named `Side by side`.
  Names also appear as title tooltips. The internal values remain `horizontal`
  and `vertical`, respectively, with no storage migration. The narrow hint reads
  `Side-by-side layout needs a window at least 900 px wide`. Checked state,
  roving tab stop, arrow/Home/End behavior and the 900 px override are unchanged.
- **FR-1405 — Context:** Clear console belongs in a `Console` panel heading;
  Copy code and Format belong beside the active filename in the editor heading.
  Reset stays in the global toolbar because it resets the entire workspace.
  Actions move in the DOM with their panels; no CSS reordering or positive
  tabindex is used. The main toolbar has nine tab stops. After the optional
  Symbols pane, traversal reaches Clear console, the console resizer when
  visible, Copy code, Format, then the editor and existing subsequent controls.
  Hidden Output also hides its Clear action; editor actions remain available.

## Intentional specification amendments

FR-703/FR-705/FR-706 and VC-703/VC-705 now use FR-1401's explicit group gaps.
FR-704/VC-704, parent VC-052, Symbols VC-315 and layout VC-407/VC-431 use FR-1405's
contextual tab order. BR-407's former no-console-tab-stop assumption is amended:
Clear is the only Console action, followed by editor actions in the stable panel
DOM order in both layouts. Panel headings name each action's context; hidden
Output removes its action from traversal. No layout-dependent focus reordering
is introduced.
FR-401/VC-401 use FR-1404's icons and accessible names; stored layout semantics
and IDs are unchanged. FR-1313/VC-1301 preserve Files→Output→Symbols placement.
FR-407/VC-408 continue to protect panel extents, flex ratios and minimum heights;
header-content styling may change without changing those panel contracts.
All contrast thresholds and performance budgets remain unchanged. Production
HTML omits explanatory HTML comments while source files retain them; no
additional icon assets or network requests are introduced.

## Verification

| ID | Requirements | Check |
| --- | --- | --- |
| VC-1401 | FR-1401, FR-1402 | Both themes at 375/899/900/1280 px: exact group gaps, bounds, Run/Stop adjacency and no horizontal overflow. |
| VC-1402 | FR-1402, FR-1403 | Both themes: delayed loading, ready and running a long-named file; geometry, tab order and visible focus. |
| VC-1403 | FR-1402, FR-1404, FR-1405 | Correct icons, names, tooltips and minimum targets; contextual action placement, clipboard feedback, layout selection and hidden Output behavior. |

Run existing layout/geometry, contrast, clipboard, format, console, runtime,
offline and performance checks against a fresh build. Record unavailable matrix
engines and pre-existing failures without calling them passes.
