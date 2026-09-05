# CONTEXT — Spec 07 right-align toolbar (shipped)

Last updated: Iteration 3 (NFR sweep and architecture documentation)

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
| `src/styles.css` | Inside `@media (min-width: 900px)`, `#btn-symbols { margin-inline-start: auto; }` (Iter 1). |
| `tests/unit/toolbar-align.test.ts` | VC-706 grep-style gate (Iter 1). |
| `tests/e2e/toolbar-align.spec.ts` | Playwright discharges VC-701–705, VC-707, VC-708 (Iter 2). |
| `docs/architecture.md` | Subsection *Toolbar presentation clustering* under the layout control (Iter 3). |
| `index.html` | Untouched (BR-701). |
| `src/*.ts` | Untouched. |

## Public interfaces / shipped surface

- **CSS selector**: `#btn-symbols` under `@media (min-width: 900px)` only.
- **Property**: `margin-inline-start: auto` (logical; BR-702).
- **Flex assumption**: `.toolbar` remains `display: flex; flex-wrap: wrap; gap: 6px`.
- **Breakpoint**: existing 900 px media query / `LAYOUT_MIN_WIDTH`.
- **Unit test path**: `tests/unit/toolbar-align.test.ts` (VC-706).
- **E2e test path**: `tests/e2e/toolbar-align.spec.ts` (VC-701–705, VC-707–708).
- **Human docs**: `docs/architecture.md` → *Toolbar presentation clustering*.

## `dist/` JS byte baseline (NFR-704 / VC-709)

Verified identical after Iter 3 `npm run build`:

| File | Bytes |
|---|---|
| `dist/assets/index-C3k5xgdz.js` | 453495 |
| `dist/assets/pyodide.worker-DDH34hLP.js` | 10527 |
| `dist/sw.js` | 5105 |
| **Sum (those three)** | **469127** |

## Known gaps

None remaining for this change. Permanent non-goals are listed below.

## Confirmed non-goals (do not regress)

- Do not move `#btn-files` to the inline-end cluster.
- Do not reorder or re-parent toolbar DOM; do not touch `index.html` or `src/format.ts`.
- Do not add physical `margin-left` / `margin-right` / `left` / `right` on the align rule.
- Do not put the auto margin on the unscoped `.toolbar` block (would break FR-705 wrap).
- Do not change palette tokens, theme/symbols behaviour, or hit-area sizes.
