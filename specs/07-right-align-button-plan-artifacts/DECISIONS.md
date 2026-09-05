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
