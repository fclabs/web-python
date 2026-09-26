# CONTEXT — insert-at-caret (spec 16)

State of the codebase as of Iteration 3 (`03-stdin-target`).

## 1. Where the work stands

Iteration 3 of 5 is **complete and committed**. The feature is functionally
whole: a live activation inserts at the editor caret or into a pending stdin
field, whichever is resolved, and the resolved target is outlined while the
pane holds focus.

What is left is not behaviour:

- **Iteration 4** — migrate the clipboard-era e2e suite (11 tests in
  `tests/e2e/symbols.spec.ts` still assert `Copied V`, plus `perf.spec.ts`
  VC-323 and the `presentation.spec.ts` contrast samplers), add VC-1614 and
  VC-1615, and run the `audit:perf` / `audit:contrast` / matrix gates.
- **Iteration 5** — the spec amendments (`03-vertical-pane-frozen.md`, freezing
  spec 16) and the shipped documentation.

Two decisions this iteration are Iteration 5's to reflect in the spec text:
**D-07** (a state FR-1607's enumeration does not cover) and **D-08** (FR-1606's
"the field keeps its selection offsets while unfocused" is false in Chromium).

## 2. File map

| File | State after Iteration 3 |
|---|---|
| `src/editor.ts` | Unchanged since Iteration 1: `symbolInsertion()`, `insertAtCaret()`. |
| `src/insert.ts` | Unchanged since Iteration 1: `insertIntoField()`. **Now imported by `src/main.ts`** — the spec's first bundle growth (≈ +0.07 kB gzipped, all of it `main.ts`). |
| `src/format.ts` | Unchanged since Iteration 2. `COPIED_MS`, `formatSymbolInserted`, `SYMBOLS_LABEL`. |
| `src/symbol-pane.ts` | **Unchanged since Iteration 2** — and must stay free of `focusin` / `focusout` / `data-insert-target` (FR-1610, BR-1601), which is grepped for. |
| `src/main.ts` | **Changed.** Imports `insertIntoField`. `symbolPaneEl` hoisted. `onInsert`'s `'stdin'` branch. `lastFocusedTarget`, `stdinCaret`, `lockedTarget`. `resolveInsertTarget()` completed. `markInsertTarget` / `paneHoldsFocus` / `syncInsertTargetOutline` plus the `focusin` and `focusout` listeners. `syncControls()` records `lockedTarget` and syncs the outline; `stdinPending()` / `stdinIdle()` call it. |
| `src/styles.css` | **Changed.** Two rules after `.symbol[data-state='inserted']`: the `[data-insert-target]` outline and the unfocused-caret rule. |
| `tests/e2e/symbols.spec.ts` | **Extended** with an Iteration 3 section: VC-1607, VC-1608, VC-1609 (light, dark and the stdin-field variant) and VC-1613's idle-field leg. Imports `failures` / `measureContrast` from `./contrast`. Every clipboard-era test is still untouched. |
| `tests/unit/*` | Unchanged. |
| `specs/16-insert-at-caret.md` | Unchanged since Iteration 2's FR-1602 / VC-1603 amendment (still DRAFT). |
| `specs/03-vertical-pane-frozen.md`, `docs/`, `README.md`, `CLAUDE.md` | Unchanged (Iterations 4 – 5). |

## 3. Public interfaces

```ts
// src/editor.ts        (Iteration 1, unchanged)
export function symbolInsertion(state: EditorState, value: string): TransactionSpec;
export function insertAtCaret(view: EditorView, value: string): void;

// src/insert.ts        (Iteration 1, unchanged)
export function insertIntoField(field: HTMLInputElement, value: string): void;

// src/format.ts
export const COPIED_MS = 2000;
export function formatSymbolInserted(value: string): string;   // `Inserted ${value}`
export const SYMBOLS_LABEL = 'Symbols';

// src/symbol-pane.ts   (Iteration 2, unchanged)
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
let  lastFocusedTarget: 'editor' | 'stdin';         // written only by `focusin`
let  stdinCaret: number | null;                     // FR-1606, DECISIONS D-08
let  lockedTarget: 'editor' | 'stdin' | null;       // what syncControls() locked against
function resolveInsertTarget(): 'editor' | 'stdin' | null;
function markInsertTarget(target: 'editor' | 'stdin' | null): void;   // FR-1608
function paneHoldsFocus(node: EventTarget | null): boolean;
function syncInsertTargetOutline(): void;
```

`resolveInsertTarget()`: `'stdin'` when the last-focused target is the field
**and** the field is not inert (a read is pending); otherwise `'editor'` when
the editor is editable (not running, an active file, that file text);
otherwise `null`. The full table is in `iterations/03-stdin-target.md`.

`data-insert-target` is written only by `markInsertTarget()`, on exactly one of
`view.contentDOM` and `#stdin-input`, while `symbolPane.isOpen` and
`#symbol-pane` contains `document.activeElement`. The CSS that paints it:

```css
.cm-editor .cm-content[data-insert-target],
.stdin-input[data-insert-target] { outline: 2px dashed var(--focus); outline-offset: -2px; }

.cm-editor:not(.cm-focused):has(.cm-content[data-insert-target]) .cm-cursor { display: block; }
```

`submitStdin()` still reads `stdinInput.value` directly; no synthetic `input`
event is dispatched anywhere.

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
  path guarded.
- `syncControls()` is the sole caller of `symbolPane.setLocked` (BR-1604). It
  is now also invoked from the `focusin` listener (only when the resolution
  changed — the pass re-renders the Files tree) and from `stdinPending()` /
  `stdinIdle()`. See **D-06**.
- Every focus listener for this feature lives in `src/main.ts`, never in
  `src/symbol-pane.ts` (FR-1610, BR-1601), and dismisses nothing.
- `src/symbol-pane.ts` must stay free of `clipboard`, `writeClipboard`,
  `Notices`, `@codemirror/`, `focusin`, `focusout` and `data-insert-target`.
- Never relax a threshold or skip an assertion to make a gate green.
- Artifacts are committed with the code they describe.

## 6. Known gaps

- **The clipboard-era suite is still in the tree and still fails.** Exactly 11
  tests in `tests/e2e/symbols.spec.ts` (VC-307, VC-308, VC-309, VC-310,
  VC-311, VC-312, VC-328, VC-314, VC-316, VC-317, VC-320), VC-323 in
  `tests/e2e/perf.spec.ts` and 8 contrast tests in
  `tests/e2e/presentation.spec.ts`. `iterations/02-editor-insert.md` →
  *Legacy failures for Iteration 4* has the line numbers; VC-317 in particular
  is now contradicted by FR-1606 and should be inverted, not repaired.
  VC-333 passes but is still retired by the spec.
- **`symbols.spec.ts:891` VC-315 fails and pre-dates this branch**, with
  `completion.spec.ts:47` VC-608/VC-1103, `layout.spec.ts:991` VC-431,
  `layout.spec.ts:1272` VC-407 and `presentation.spec.ts:723` VC-052.
  `perf.spec.ts:753` VC-814 is flaky. Not this spec's to fix.
- **`audit:contrast` and `audit:perf` have not been green since Iteration 2**,
  for the clipboard-era reasons above only. Iteration 4 owns both gates. The
  new `[data-insert-target]` outline is measured in both palettes by VC-1609
  and clears 3:1.
- **`CLAUDE.md`'s `94 passed, 1 skipped` line is stale.** Iteration 4.
- **Two spec sentences are now known to be wrong** and are Iteration 5's:
  FR-1607's enumeration of the no-target states (**D-07**) and FR-1606's claim
  that an unfocused field keeps its selection offsets (**D-08**).
- **Docs are untouched** — `docs/architecture.md` still needs the
  `indentOnInput` parity note (D-05), the target/lock ownership section and the
  D-08 engine note (Iteration 5).
