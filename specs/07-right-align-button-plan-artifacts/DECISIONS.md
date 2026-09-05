# DECISIONS — Spec 07 right-align toolbar

Append-only. Newest entries at the bottom.

## D-001 — Place `#btn-symbols` auto margin only inside `@media (min-width: 900px)`

- **Iteration**: 1
- **Choice**: Add `#btn-symbols { margin-inline-start: auto; }` as the first rule
  inside the existing `@media (min-width: 900px)` block in `src/styles.css`, not
  on the unscoped `.toolbar` rule and not under a new breakpoint.
- **Why**: FR-701 needs the pair at the inline-end on wide viewports; FR-705
  requires no inline-end alignment below 900 px because an auto margin applies
  per flex line and would strand the pair on a wrapped narrow line. The 900 px
  query already mirrors `LAYOUT_MIN_WIDTH` in `src/layout.ts` (CLAUDE.md
  two-breakpoints convention), so this adds no third copy.
- **Rejected**: Unscoped `.toolbar > #btn-symbols` / always-on auto margin
  (breaks FR-705). A separate `@media (min-width: 900px)` block for toolbar only
  (unnecessary duplicate query). Physical `margin-left: auto` (violates BR-702).

## D-002 — VC-701 measures toolbar content-box via padding + border subtraction

- **Iteration**: 2
- **Choice**: In `tests/e2e/toolbar-align.spec.ts`, toolbar content-box
  inline-end = `header.toolbar.getBoundingClientRect().right −
  parseFloat(paddingRight) − parseFloat(borderRightWidth)`. Compare that to
  `#btn-theme.getBoundingClientRect().right` within 1 px.
- **Why**: Spec VC-701 names the toolbar's *content-box* right edge; raw
  border-box alone would be wrong if padding or border were added later.
  Matches the padding-aware pattern layout.spec uses for `#app` content edges.
- **Rejected**: Comparing theme right to toolbar border-box right alone
  (fails the content-box wording). Using `clientWidth` + `getClientRects`
  offsets (more brittle across zoom).

## D-003 — Same-line gap walk for VC-703 / VC-705

- **Iteration**: 2
- **Choice**: Walk visible toolbar controls in DOM order; compute
  `next.left − prev.right` only when `Math.round(top)` matches (same flex
  line). Packed = `|gap − 6| ≤ 1`; oversized otherwise.
- **Why**: On wrapped narrow toolbars, consecutive DOM siblings can sit on
  different lines; a naive adjacent gap would look huge and false-fail
  FR-705. Same-line filtering matches “no inter-control gap on any line
  exceeds 6 ± 1”.
- **Rejected**: Requiring all consecutive DOM gaps ≤ 7 regardless of line
  (breaks wrap). Using `offsetLeft` without line grouping.
