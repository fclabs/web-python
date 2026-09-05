# CONTEXT — Spec 07 right-align toolbar (living)

Last updated: Iteration 2 (placement, tab order, and behaviour e2e)

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
| `src/styles.css` | **Unchanged this iteration.** Inside `@media (min-width: 900px)`, `#btn-symbols { margin-inline-start: auto; }` (Iter 1). |
| `tests/unit/toolbar-align.test.ts` | **Unchanged.** VC-706 grep-style gate (Iter 1). |
| `tests/e2e/toolbar-align.spec.ts` | **New (Iter 2).** Playwright discharges VC-701–705, VC-707, VC-708. Helpers local to the file: layout/theme seeding, content-box flush measurement (D-002), same-line gap walk, editor undo/doc snapshot. |
| `index.html` | Untouched (BR-701). |
| `src/*.ts` | Untouched. |
| `docs/architecture.md` | Still describes toolbar as a packed flex row; update deferred to Iteration 3. |
| `tests/e2e/helpers.ts` | Used via `openPlayground` only; no new shared helpers this iteration. |

## Public interfaces / shipped surface

- **CSS selector**: `#btn-symbols` under `@media (min-width: 900px)` only.
- **Property**: `margin-inline-start: auto` (logical; BR-702).
- **Flex assumption**: `.toolbar` remains `display: flex; flex-wrap: wrap; gap: 6px`.
- **Breakpoint**: existing 900 px media query / `LAYOUT_MIN_WIDTH`.
- **Unit test path**: `tests/unit/toolbar-align.test.ts` (VC-706).
- **E2e test path**: `tests/e2e/toolbar-align.spec.ts` (VC-701–705, VC-707–708).
- **VC-701 measurement**: `#btn-theme` border-box `right` vs toolbar content-box
  right = `getBoundingClientRect().right − paddingRight − borderRightWidth`
  (D-002). Toolbar currently has no padding/border, so content-box ≈ border-box.
- **VC-703 / VC-705 gap rule**: same-line pairs (shared `Math.round(top)`);
  packed = `|gap − 6| ≤ 1`; oversized = not packed. Exactly one oversized gap
  at 1280×800, between `#btn-files` and `#btn-symbols`.

## Iter-1 / Iter-2 `dist/` JS byte baseline (for NFR-704 / VC-709)

Recorded after `npm run build` on this worktree (Iter 2, CSS already present):

| File | Bytes |
|---|---|
| `dist/assets/index-C3k5xgdz.js` | 453495 |
| `dist/assets/pyodide.worker-DDH34hLP.js` | 10527 |
| `dist/sw.js` | 5105 |
| **Sum (those three)** | **469127** |

Hash suffixes may change if CSS/asset fingerprinting shifts; compare **byte
counts of JS bundles**, not filenames. Iter 3 should prove JS byte count is
identical to this baseline (NFR-704: 0 bytes of new JS).

## Known gaps (for later iterations)

- NFR sweep not run: VC-709 (geometry baseline ±1 px, scrollWidth ≤ 375,
  `npm run audit:contrast`, `npm run audit:perf`, JS bytes vs baseline above).
- `docs/architecture.md` not yet updated to describe visual clustering.

## Confirmed non-goals (do not regress)

- Do not move `#btn-files` to the inline-end cluster.
- Do not reorder or re-parent toolbar DOM; do not touch `index.html` or `src/format.ts`.
- Do not add physical `margin-left` / `margin-right` / `left` / `right` on the align rule.
- Do not put the auto margin on the unscoped `.toolbar` block (would break FR-705 wrap).
- Do not change palette tokens, theme/symbols behaviour, or hit-area sizes.
