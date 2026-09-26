# CONTEXT — insert-at-caret (spec 16)

State of the codebase as of Iteration 1 (`01-primitives`).

## 1. Where the work stands

Iteration 1 of 5 is complete. The **insertion primitives exist and are unit
tested, but nothing is wired to them**: `src/symbol-pane.ts` is untouched and
still writes the activated glyph to the clipboard (spec-03 FR-306 – FR-308).
No shipped behaviour changed in this iteration; `src/insert.ts` has no importer
yet, so Vite tree-shakes it out of the bundle.

Remaining iterations: 2 (pane inserts into the editor), 3 (stdin target +
`data-insert-target` outline), 4 (suite migration + audit gates), 5 (spec
amendments + docs).

## 2. File map

Files this spec touches, and their state now.

| File | State after Iteration 1 |
|---|---|
| `src/editor.ts` | **Changed.** Gains `symbolInsertion()` and `insertAtCaret()` at the end of the file, plus `isolateHistory` (`@codemirror/commands`), `foldedRanges` / `unfoldEffect` (`@codemirror/language`) and the `StateEffect` / `TransactionSpec` types (`@codemirror/state`) on the existing imports. Everything else unchanged. |
| `src/insert.ts` | **New.** Holds `insertIntoField()` only. Imports nothing. |
| `src/format.ts` | **Changed.** Gains `formatSymbolInserted()` between `COPIED_MS` and `SYMBOLS_LABEL`. `formatSymbolCopied` and `SYMBOL_COPY_FAILED` are deliberately still present (Iteration 2 removes them). |
| `tests/unit/insert.test.ts` | **New.** 17 tests. |
| `src/symbol-pane.ts` | Unchanged — still clipboard-based. Sole caller of `formatSymbolCopied` (line 220) and `SYMBOL_COPY_FAILED` (line 227). |
| `src/main.ts` | Unchanged — no target resolution, no `onInsert`, constructs and discards the `SymbolPane`. |
| `src/styles.css` | Unchanged — still `.symbol[data-state='copied']`, still the `user-select: text` Firefox workaround. |
| `src/controls.ts`, `src/symbols.ts`, `src/clipboard.ts`, `src/notices.ts`, `src/fold.ts` | Unchanged. |
| `tests/e2e/symbols.spec.ts` | Unchanged — every test still asserts the clipboard behaviour. |
| `specs/03-vertical-pane-frozen.md`, `docs/architecture.md`, `README.md`, `docs/ci.md`, `CLAUDE.md` | Unchanged. |

## 3. Public interfaces

Exactly as committed.

```ts
// src/editor.ts
export function symbolInsertion(state: EditorState, value: string): TransactionSpec;
export function insertAtCaret(view: EditorView, value: string): void;

// src/insert.ts
export function insertIntoField(field: HTMLInputElement, value: string): void;

// src/format.ts
export function formatSymbolInserted(value: string): string;   // `Inserted ${value}`
export const COPIED_MS = 2000;                                 // unchanged, shared
export const SYMBOLS_LABEL = 'Symbols';                        // unchanged
export function formatSymbolCopied(value: string): string;     // to be removed, Iteration 2
export const SYMBOL_COPY_FAILED: string;                       // to be removed, Iteration 2
```

`symbolInsertion` returns `{ ...state.replaceSelection(value), userEvent:
'input.type', annotations: isolateHistory.of('full'), scrollIntoView: true }`.
Change and selection travel in the one spec (BR-1602).

`insertAtCaret` unfolds first (effects-only transaction, only when a folded
range covers the primary head), then dispatches the insertion **once**. It does
not call `view.focus()`.

`insertIntoField` resolves `selectionStart ?? value.length` and
`selectionEnd ?? value.length` and calls `setRangeText(value, start, end,
'end')`. No synthetic `input` event, no `focus()`.

## 4. Commands

Run every command from
`/Users/fede/orca/workspaces/web-python/insert-the-symbol-at-the-caret-when-a-symbols-pa`.
This is a **git worktree**, so `PW_PORT_BASE=4273` is mandatory for every
Playwright run — without it the suite silently serves the other checkout's
build.

```bash
npm ci
npm run build                                   # vendor + tsc --noEmit + vite build
npm run test:unit                               # vitest run
npx vitest run tests/unit/insert.test.ts
PW_PORT_BASE=4273 npx playwright test --project=chromium
PW_PORT_BASE=4273 npx playwright test --project=chromium tests/e2e/symbols.spec.ts
PW_PORT_BASE=4273 npm run audit:perf
PW_PORT_BASE=4273 npm run audit:contrast
PW_PORT_BASE=4273 MATRIX=1 npm run test:matrix  # local only
```

E2E specs run against the **built** site: run `npm run build` after any `src/`
change or Playwright reuses the previous build.

## 5. Conventions in force

- Every non-obvious line cites its requirement (`FR-`/`BR-`/`NFR-`/`VC-`);
  tests are named after the VC they discharge (`tests/unit/insert.test.ts`
  uses `describe('VC-1601: …')` blocks).
- User-visible strings live in `src/format.ts`, verbatim from the spec.
- Never the `disabled` attribute on a conditionally-inert control — `setInert()`
  / `isInert()` from `src/controls.ts`, and every activation path guarded.
- TypeScript strict, with `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax`. An empty array literal needs an explicit type
  annotation (`const unfold: StateEffect<unknown>[] = []`).
- Never relax a threshold or skip an assertion to make a gate green.
- Artifacts are committed with the code they describe.

## 6. Known gaps

- **The pane still copies.** `src/symbol-pane.ts`, `src/styles.css` and
  `src/main.ts` are untouched; nothing calls the new primitives (Iteration 2).
- **No stdin target and no `data-insert-target` outline** (FR-1605, FR-1608 —
  Iteration 3). `insertIntoField` exists but has no caller.
- **`formatSymbolCopied` / `SYMBOL_COPY_FAILED` are still exported**, each with
  exactly one caller in `src/symbol-pane.ts`. VC-1616 fails until Iteration 2.
- **The e2e suite is still clipboard-era.** Iteration 4 migrates it.
- **Six chromium e2e failures pre-date this branch.** Verified by building and
  running the same five specs from `376d8dc` (the branch point) in a throwaway
  worktree: the identical six fail there. They are environmental, not caused by
  this work, and not this spec's to fix:
  `completion.spec.ts:47` VC-608/VC-1103; `layout.spec.ts:991` VC-431;
  `layout.spec.ts:1272` VC-407; `perf.spec.ts:753` VC-814;
  `presentation.spec.ts:723` VC-052; `symbols.spec.ts:882` VC-315.
  Iterations 2–4 must compare against this list, not against zero.
- **`CLAUDE.md`'s `94 passed, 1 skipped` line is stale.** The chromium project
  actually reports `323 passed, 2 skipped` (+ the six above) on this machine.
  Iteration 4 owns the corrected figure.
- Docs and spec amendments are untouched (Iteration 5).
