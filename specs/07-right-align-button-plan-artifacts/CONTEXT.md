# CONTEXT — Spec 07 right-align toolbar (living)

Last updated: Iteration 1 (CSS rule and logical-property gate)

## Purpose of this change

At viewports ≥ 900 px, `header.toolbar` visually splits into a leading action
cluster (`#btn-run` … `#btn-files`) and an inline-end presentation pair
(`#btn-symbols`, `#btn-theme`) by giving `#btn-symbols` `margin-inline-start:
auto` inside the existing `@media (min-width: 900px)` block. Below 900 px the
row packs as before. DOM order, tab order, behaviours, and `#btn-files`
placement are unchanged. No JavaScript.

## File map (relevant)

| Path | Role |
|---|---|
| `src/styles.css` | **Changed (Iter 1).** Inside `@media (min-width: 900px)` (opens ~line 955), new rule `#btn-symbols { margin-inline-start: auto; }` with FR-701 / FR-705 / BR-702 comment. Unscoped `.toolbar` (~line 133) still only `display: flex; flex-wrap: wrap; gap: 6px` — no auto margin there. No `#btn-files` rule added. |
| `tests/unit/toolbar-align.test.ts` | **New (Iter 1).** VC-706 grep-style gate: reads `src/styles.css`, extracts `#btn-symbols` body from the min-width 900 block, asserts `margin-inline-start` present and no `margin-left` / `margin-right` / `left:` / `right:`; also asserts the unscoped prefix has no `#btn-symbols` auto-margin rule. |
| `index.html` | Untouched (BR-701). Toolbar DOM order unchanged. |
| `src/*.ts` | Untouched this iteration. |
| `docs/architecture.md` | Still describes toolbar as a packed flex row; update deferred to Iteration 3. |
| `tests/e2e/*` | No toolbar-align e2e yet — Iteration 2. |

## Public interfaces / shipped surface

- **CSS selector**: `#btn-symbols` under `@media (min-width: 900px)` only.
- **Property**: `margin-inline-start: auto` (logical; BR-702).
- **Flex assumption**: `.toolbar` remains `display: flex; flex-wrap: wrap; gap: 6px`, so the auto margin collects free space on the flex line between `#btn-files` and `#btn-symbols`; `#btn-theme` follows immediately after `#btn-symbols` in DOM order and rides with it.
- **Breakpoint**: reuses the existing 900 px media query (`LAYOUT_MIN_WIDTH` twin in `src/layout.ts`). No third copy, no `max-width` mirror.
- **Unit test path**: `tests/unit/toolbar-align.test.ts` (VC-706).

## Known gaps (for later iterations)

- Geometry / placement e2e not written: VC-701, VC-702, VC-703, VC-705.
- Tab-order e2e not written: VC-704 (must match FR-704’s ten stops).
- Behaviour-from-new-position e2e not written: VC-707, VC-708.
- NFR sweep not run: VC-709 (geometry baseline, scrollWidth, contrast, perf / JS byte count).
- `docs/architecture.md` not yet updated to describe visual clustering.
- Manual / Playwright visual confirmation deferred to Iteration 2 (plan: unit + file inspection suffice for Iter 1).

## Confirmed non-goals (do not regress)

- Do not move `#btn-files` to the inline-end cluster.
- Do not reorder or re-parent toolbar DOM; do not touch `index.html` or `src/format.ts`.
- Do not add physical `margin-left` / `margin-right` / `left` / `right` on the align rule.
- Do not put the auto margin on the unscoped `.toolbar` block (would break FR-705 wrap).
- Do not change palette tokens, theme/symbols behaviour, or hit-area sizes.
