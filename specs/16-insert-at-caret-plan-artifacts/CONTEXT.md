# CONTEXT — insert-at-caret (spec 16)

State of the codebase as of Iteration 2 (`02-editor-insert`).

## 1. Where the work stands

Iteration 2 of 5 is **complete and committed**. One Must-vs-Must conflict was
escalated mid-iteration and resolved by the user as **Option 1 — amend FR-1602
and VC-1603**, so `specs/16-insert-at-caret.md` is amended in the same commit
and no production code changed because of it. See `DECISIONS.md` **D-05** and
`iterations/02-editor-insert.md` → *The FR-1602 amendment*.

The clipboard path is **gone**. Activating a live character button now inserts
that row's `value` at the editor caret, through `onInsert` → `main.ts` →
`insertAtCaret(view, value)`. The pane drives its own `Inserted V` feedback and
`syncControls()` drives its inertness.

Remaining iterations: 3 (stdin target + `data-insert-target` outline),
4 (suite migration + audit gates), 5 (spec amendments + docs).

## 2. File map

| File | State after Iteration 2 |
|---|---|
| `src/editor.ts` | Unchanged since Iteration 1: `symbolInsertion()`, `insertAtCaret()`. |
| `src/insert.ts` | Unchanged since Iteration 1: `insertIntoField()`. **Still has no importer** — Iteration 3 wires it. |
| `src/format.ts` | **Changed.** `formatSymbolCopied` and `SYMBOL_COPY_FAILED` deleted (FR-307 / FR-308 retired). `COPIED_MS`, `formatSymbolInserted`, `SYMBOLS_LABEL` remain; `COPIED_MS`'s doc comment now cites FR-1609. |
| `src/symbol-pane.ts` | **Rewritten around insertion.** Header records that BR-301 is superseded by BR-1601. `SymbolPaneElements` gains `onInsert(value)` and drops `notices`. `writeClipboard`, `selectGlyph()`, `activationId` and the async `activate()` body are gone. New public `setLocked(locked)`. Imports `isInert`/`setInert` from `./controls`. |
| `src/main.ts` | **Changed.** Imports `insertAtCaret`. `const symbolPane = new SymbolPane({… onInsert})` (was `new SymbolPane(…)` discarded). New `resolveInsertTarget()` above `syncControls()`; `syncControls()` ends its editor block with `symbolPane.setLocked(resolveInsertTarget() === null)`. |
| `src/styles.css` | **Changed.** `.symbol[data-state='copied']` → `[data-state='inserted']`; `.symbol`'s `user-select: text` FR-308 workaround removed. |
| `tests/e2e/symbols.spec.ts` | **Extended** with a spec-16 section: VC-1601 – VC-1606, VC-1610 – VC-1613 (13 new tests). Every clipboard-era test is left exactly as it was — Iteration 4 migrates them. |
| `tests/unit/*` | Unchanged. Nothing referenced the two deleted strings. |
| `specs/16-insert-at-caret.md` | **Amended** (still DRAFT). FR-1602 and VC-1603 rewritten per D-05; *What it does*, *Known limits* and *Out of scope* follow. FR-1601, FR-1603, BR-1602 untouched. Iteration 5 freezes this text and must not re-litigate it. |
| `specs/03-vertical-pane-frozen.md`, `docs/`, `README.md`, `CLAUDE.md` | Unchanged (Iterations 4 – 5). |

## 3. Public interfaces

```ts
// src/editor.ts        (Iteration 1, unchanged)
export function symbolInsertion(state: EditorState, value: string): TransactionSpec;
export function insertAtCaret(view: EditorView, value: string): void;

// src/insert.ts        (Iteration 1, unchanged; still no importer)
export function insertIntoField(field: HTMLInputElement, value: string): void;

// src/format.ts
export const COPIED_MS = 2000;
export function formatSymbolInserted(value: string): string;   // `Inserted ${value}`
export const SYMBOLS_LABEL = 'Symbols';

// src/symbol-pane.ts
export interface SymbolPaneElements {
  toggle: HTMLButtonElement;
  pane: HTMLElement;
  status: HTMLElement;
  onInsert(value: string): void;      // FR-1601 / BR-1601
}
export class SymbolPane {
  get isOpen(): boolean;
  open(): void;
  close(): void;
  setLocked(locked: boolean): void;   // FR-1607 / BR-1604 — syncControls() only
}

// src/main.ts (module-internal, inside boot())
function resolveInsertTarget(): 'editor' | 'stdin' | null;
```

`activate(button)` is synchronous: `isInert(button)` → return; else
`onInsert(value)`, `clearFeedback()`, `status.textContent =
formatSymbolInserted(value)`, `button.dataset.state = 'inserted'`, `COPIED_MS`
revert timer. `clearFeedback()` is still the single writer and is still called
by `close()`.

`resolveInsertTarget()` reads `workspace.activeFile`, `workspace.get(active)`
and the `running` flag — the same three facts `syncControls()` feeds to
`setEditorReadOnly` — and returns `null` when `running || active === null ||
bytes === null || !isText(bytes)`, otherwise `'editor'`. The `'stdin'` arm is a
documented stub at the top of the function body for Iteration 3.

## 4. Commands

Run every command from
`/Users/fede/orca/workspaces/web-python/insert-the-symbol-at-the-caret-when-a-symbols-pa`.
This is a **git worktree**, so `PW_PORT_BASE=4273` is mandatory for every
Playwright run.

```bash
npm ci
npm run build                                   # vendor + tsc --noEmit + vite build
npm run test:unit                               # vitest run
PW_PORT_BASE=4273 npx playwright test --project=chromium
PW_PORT_BASE=4273 npx playwright test --project=chromium tests/e2e/symbols.spec.ts
PW_PORT_BASE=4273 npm run audit:perf
PW_PORT_BASE=4273 npm run audit:contrast
```

E2E specs run against the **built** site: run `npm run build` after any `src/`
change or Playwright reuses the previous build.

## 5. Conventions in force

- Every non-obvious line cites its requirement (`FR-`/`BR-`/`NFR-`/`VC-`);
  every test is named after the VC it discharges.
- User-visible strings live in `src/format.ts`, verbatim from the spec.
- Never the `disabled` attribute on a conditionally-inert control —
  `setInert()` / `isInert()` from `src/controls.ts`, and **every** activation
  path guarded. `SymbolPane.activate()` is guarded by `isInert(button)`.
- `syncControls()` is the sole caller of `symbolPane.setLocked` (BR-1604).
- `src/symbol-pane.ts` must stay free of `clipboard`, `writeClipboard`,
  `Notices` and `@codemirror/` — asserted by VC-1612 and by a grep gate.
- Never relax a threshold or skip an assertion to make a gate green.
- Artifacts are committed with the code they describe.

## 6. Known gaps

- **`indentOnInput` re-indents a pane insertion, by design now.** It is an
  `EditorState.transactionFilter` keyed on `tr.isUserEvent('input.type')`
  (`@codemirror/language`, `dist/index.js:1188`), not on the DOM input path, so
  FR-1601's transaction reaches it. On the Python line shapes its rules match
  (`else`, `elif `, `except `, `finally:`, `case …`, a closing bracket) the
  pane's `:` re-indents exactly as typing does. FR-1602 now records this as
  intended parity (`DECISIONS.md` **D-05**). **Open follow-up:**
  `docs/architecture.md` still needs the parity note — Iteration 5.
- **No stdin target and no `data-insert-target` outline** (FR-1605, FR-1606,
  FR-1608 — Iteration 3). `insertIntoField` still has no importer, and
  `resolveInsertTarget()` never returns `'stdin'`.
- **The clipboard-era suite is still in the tree and now fails.** 11 tests in
  `tests/e2e/symbols.spec.ts`, VC-323 in `tests/e2e/perf.spec.ts` and 8
  contrast tests in `tests/e2e/presentation.spec.ts`. Exact list in
  `iterations/02-editor-insert.md` → *Legacy failures for Iteration 4*.
- **Six chromium e2e failures pre-date this branch** (Iteration 1 verified them
  at `376d8dc` in a throwaway worktree): `completion.spec.ts:47` VC-608/VC-1103;
  `layout.spec.ts:991` VC-431; `layout.spec.ts:1272` VC-407; `perf.spec.ts:753`
  VC-814 (flaky — it passed on the Iteration 2 run); `presentation.spec.ts:723`
  VC-052; `symbols.spec.ts:890` VC-315. Not this spec's to fix.
- **`CLAUDE.md`'s `94 passed, 1 skipped` line is stale.** Iteration 4 owns the
  corrected figure.
- Docs and spec amendments are untouched (Iteration 5).
