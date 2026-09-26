# Iteration 1 — The insertion primitives

**Goal**: pure, unit-tested helpers that produce an editor insertion and a
text-field insertion, with nothing yet wired to the pane.

**Outcome**: done. No shipped behaviour changed.

## What was built

| File | Change |
|---|---|
| `src/editor.ts` | Added `symbolInsertion()` and `insertAtCaret()` (end of file). Imports extended with `isolateHistory`, `foldedRanges`, `unfoldEffect`, `type StateEffect`, `type TransactionSpec`. |
| `src/insert.ts` | New module, exporting `insertIntoField()` only. |
| `src/format.ts` | Added `formatSymbolInserted()` beside `COPIED_MS`, with an FR-1609 comment. |
| `tests/unit/insert.test.ts` | New — 17 tests across four `describe` blocks named for VC-1601, VC-1602 (×2) and VC-1606. |

Nothing else in `src/` or `tests/` was touched. `src/insert.ts` has no importer
yet, so Vite tree-shakes it; the bundle is byte-comparable to the previous
build.

## Success criteria

| # | Criterion | Command | Result |
|---|---|---|---|
| 1 | `npm run build` exits 0 (`tsc --noEmit` clean, strict) | `npm run build` | **PASS** — exit 0; `✓ 56 modules transformed`, `dist/assets/index-BgEVtigw.js 478.64 kB │ gzip: 160.40 kB`. |
| 2 | `npm run test:unit` exits 0 and `insert.test.ts` runs the listed cases | `npm run test:unit` | **PASS** — exit 0, `Test Files 27 passed (27)`, `Tests 346 passed (346)`. Narrowed: `npx vitest run tests/unit/insert.test.ts` → `Tests 17 passed (17)`. |
| 3 | The chromium project shows no regression | `PW_PORT_BASE=4273 npx playwright test --project=chromium` | **PASS with a correction** — `323 passed, 2 skipped, 6 failed (3.7m)`. All six failures are **pre-existing**; see *Deviation 1*. The plan's `94 passed, 1 skipped` figure is stale. |
| 4a | `grep -n "isolateHistory" src/editor.ts` finds the annotation on the insertion spec | `grep -n "isolateHistory" src/editor.ts` | **PASS** — `26:  isolateHistory,` (import) and `314:    annotations: isolateHistory.of('full'),` (on the spec returned by `symbolInsertion`). |
| 4b | Exactly one dispatch of the change in `insertAtCaret` | `awk '/^export function insertAtCaret/,/^}/' src/editor.ts \| grep -n dispatch` | **PASS** — two lines: `view.dispatch({ effects: unfold })` (effects only, conditional) and `view.dispatch(symbolInsertion(view.state, value))` (the one change dispatch). |
| 5 | Artifacts written; `CONTEXT.md` matches the code; the module decision is in `DECISIONS.md` | — | **PASS** — `CONTEXT.md` (six sections), `DECISIONS.md` (D-01 – D-04), this record. |

Partial evidence recorded for **VC-1601**, **VC-1602** (including all seven
multi-character values), **VC-1603** (the helper contains no bracket-pairing or
re-indentation logic at all — literalness is structural), **VC-1606**.

## Hands off

### Exact exported signatures and their files

```ts
// src/editor.ts
export function symbolInsertion(state: EditorState, value: string): TransactionSpec;
export function insertAtCaret(view: EditorView, value: string): void;

// src/insert.ts                      <- new module, see DECISIONS.md D-01
export function insertIntoField(field: HTMLInputElement, value: string): void;

// src/format.ts
export function formatSymbolInserted(value: string): string;   // `Inserted ${value}`
```

`symbolInsertion` returns
`{ ...state.replaceSelection(value), userEvent: 'input.type',
annotations: isolateHistory.of('full'), scrollIntoView: true }` — change and
selection in the one spec (BR-1602).

`insertAtCaret(view, value)` does **not** call `view.focus()` (FR-1610), and
resolves its fold from `view.state.selection.main.head`.

`insertIntoField` uses `selectionStart ?? value.length` /
`selectionEnd ?? value.length` and `setRangeText(value, start, end, 'end')`.
It dispatches no synthetic `input` event and never calls `focus()`.

### Unfolding: a **preceding** dispatch, not the same one

`insertAtCaret` collects `unfoldEffect`s from
`foldedRanges(view.state).between(head, head, …)` and, **only when that yields
at least one range**, dispatches them in a transaction carrying no document
change and no selection — which `history()` does not record, so FR-1603's
one-activation-one-undo guarantee is untouched. The insertion is then the one
and only dispatch of the change. Rationale (upstream `foldState` maps its
ranges through `tr.changes` before applying effects, so a same-transaction
unfold would silently miss) is in `DECISIONS.md` **D-02**.

Iterations 2–4: when asserting "one transaction per activation", expect **two
dispatches on a folded caret** and one otherwise. Undo depth is one either way.

### Still-live clipboard strings — Iteration 2 removes them

`formatSymbolCopied` (`src/format.ts:82`) and `SYMBOL_COPY_FAILED`
(`src/format.ts:87`) are still exported and each still has **exactly one
caller**, both in `src/symbol-pane.ts`:

- `src/symbol-pane.ts:17` — the shared import
- `src/symbol-pane.ts:220` — `this.status.textContent = formatSymbolCopied(value)`
- `src/symbol-pane.ts:227` — `this.notices.show(SYMBOL_COPY_FAILED)`

No test references either string. Removing them is Iteration 2's first move and
discharges VC-1616's `src/format.ts` leg.

### Other notes for Iteration 2

- `src/insert.ts` is currently dead code by design; the bundle will only grow
  once `src/main.ts` imports it in Iteration 3.
- `StateEffect` is imported as a **type** in `src/editor.ts`
  (`verbatimModuleSyntax`), and the effects array needs its explicit
  annotation — `const unfold: StateEffect<unknown>[] = []` — because a `const`
  empty array infers `never[]` under strict TypeScript.

## Deviations from the plan

1. **The `94 passed, 1 skipped` figure in the success criteria is unreachable
   and was replaced by a like-for-like baseline comparison.** The chromium
   project on this branch point reports `323 passed, 2 skipped` plus six
   failures. To prove the six are not this iteration's doing, a throwaway git
   worktree was created at `376d8dc` (the branch point, before any change
   here), built with `npm run build`, and the five affected specs were run with
   `PW_PORT_BASE=4373`: **the identical six failed there**, with the same test
   titles and line numbers.

   | Spec | Test |
   |---|---|
   | `tests/e2e/completion.spec.ts:47` | VC-608 / VC-1103 |
   | `tests/e2e/layout.spec.ts:991` | VC-431 |
   | `tests/e2e/layout.spec.ts:1272` | VC-407 |
   | `tests/e2e/perf.spec.ts:753` | VC-814 |
   | `tests/e2e/presentation.spec.ts:723` | VC-052 |
   | `tests/e2e/symbols.spec.ts:882` | VC-315 |

   Nothing was relaxed or skipped to reach this conclusion. The worktree was
   removed afterwards. Iteration 4 owns the corrected expected-count line in
   `CLAUDE.md` and `docs/ci.md`, and must decide whether these six are
   environmental or a genuine pre-existing regression on `main` — VC-315 sits
   in `symbols.spec.ts` and VC-052 / VC-407 are traversal criteria this spec's
   FR-1607 touches, so they are worth a second look there.

2. **Two small mechanical additions the plan did not spell out**, both forced by
   the strict TypeScript config: the explicit `StateEffect<unknown>[]`
   annotation above, and `EditorState.allowMultipleSelections.of(true)` in the
   unit test's state factory so VC-1602's two-range case retains both ranges
   (`DECISIONS.md` **D-04**). Neither changes production behaviour.

No other deviation. `src/symbol-pane.ts`, `src/main.ts` and `src/styles.css`
were deliberately left alone.
