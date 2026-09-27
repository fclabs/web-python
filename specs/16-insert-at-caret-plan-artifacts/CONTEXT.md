# CONTEXT — insert-at-caret (spec 16)

State of the codebase as of Iteration 5 (`05-docs`), the final iteration.

## 1. Where the work stands

**Shipped and complete.** All five iterations are committed. Activating a
character button in the Symbols pane inserts that character at the caret of the
current insertion target — the editor, or the stdin field while a program is
waiting for input — in one history-isolated transaction (editor) or one
`setRangeText` call (field). The clipboard path the pane shipped with in
spec-03 is gone: `src/format.ts` exports neither `formatSymbolCopied` nor
`SYMBOL_COPY_FAILED`, and the pane writes to neither the clipboard nor the
notice strip.

The specs and the shipped documentation now describe that system:

- `specs/16-insert-at-caret-frozen.md` — **SHIPPED / frozen** (renamed from
  `16-insert-at-caret.md` with `git mv`).
- `specs/03-vertical-pane-frozen.md` — BR-301, FR-306 – FR-308, FR-313, FR-316
  and BR-303 struck, each carrying a pointer to the frozen spec-16; A-303
  discharged; *Deliberately excluded* no longer excludes insert-at-caret;
  *What it does*, the string table, the DOM contract, *Reused interfaces*,
  *Key decisions* and *Known limits* all reconciled. VC-1616 is discharged.
- `docs/architecture.md` — *It never touches the editor* is replaced by
  *It reaches the editor through one callback*.
- `README.md` — neither the intro nor the *Special characters* row claims the
  pane copies.
- `docs/ci.md`, `CLAUDE.md` — expected-count figures consistent; no new job or
  gate.

## 2. File map

| File | State |
|---|---|
| `src/editor.ts` | `symbolInsertion()`, `insertAtCaret()` — unchanged since Iteration 1. |
| `src/insert.ts` | `insertIntoField()` — unchanged since Iteration 1; imports nothing. |
| `src/format.ts` | `COPIED_MS`, `formatSymbolInserted`, `SYMBOLS_LABEL`. No clipboard strings. |
| `src/symbol-pane.ts` | Free of `clipboard`, `Notices`, `@codemirror/`, `focusin`, `focusout`, `data-insert-target` and any `document`-level listener — all grepped for by VC-1612. |
| `src/main.ts` | Owns the last-focused record, `resolveInsertTarget()`, `markInsertTarget()`, the remembered stdin caret, and the single `setLocked` call inside `syncControls()`. |
| `src/styles.css` | `data-state="inserted"`, the `data-insert-target` outline, the unfocused-caret rule. No `.symbol { user-select: text }`. |
| `tests/e2e/symbols.spec.ts` | The spec-16 criteria plus the migrated VC-307, VC-308, VC-316, VC-317, VC-320. |
| `tests/e2e/matrix.spec.ts`, `perf.spec.ts`, `presentation.spec.ts`, `helpers.ts` | Migrated to insertion; `presentation.spec.ts` feeds both `data-insert-target` outlines into the contrast gate. |
| `tests/unit/*` | Unchanged since Iteration 1 added the insertion-primitive tests. |
| Specs and docs | As in §1. |

## 3. Public interfaces

```ts
// src/editor.ts
export function symbolInsertion(state: EditorState, value: string): TransactionSpec;
export function insertAtCaret(view: EditorView, value: string): void;

// src/insert.ts
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
```

`resolveInsertTarget()` (module-internal to `src/main.ts`): `'stdin'` when the
last-focused target is the field **and** the field is not inert (a read is
pending); otherwise `'editor'` when the editor is editable; otherwise `null`,
which locks every character button.

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
PW_PORT_BASE=4273 npm run audit:contrast
PW_PORT_BASE=4273 npm run audit:perf
PW_PORT_BASE=4273 MATRIX=1 npm run test:matrix
```

E2E specs run against the **built** site: run `npm run build` after any `src/`
change or Playwright serves the previous build.

### Expected results

| Command | Here (macOS) | On the CI runner |
|---|---|---|
| `npx playwright test --project=chromium` | `339 passed, 6 failed, 2 skipped` | `342 passed, 5 skipped` |
| `npm run test:unit` | `346 passed` | same |
| `npm run audit:contrast` | `11 passed` | `11 passed` |
| `npm run audit:perf` | `9 passed, 1 failed, 1 skipped` (VC-814) | `10 passed, 1 skipped` |
| `MATRIX=1 npm run test:matrix` | `6 passed, 2 failed, 24 skipped` | local only |

The six local chromium failures are the five `Control+m` / `Shift-Alt-m`
macOS keybinding divergences plus VC-814's stale spec-08 size budget; all
pre-date this branch and are documented in `docs/ci.md` and in `DECISIONS.md`
**D-12**. None is a threshold to relax.

## 5. Conventions in force

- Every non-obvious line cites its requirement (`FR-`/`BR-`/`NFR-`/`VC-`);
  every test is named after the VC it discharges.
- User-visible strings live in `src/format.ts`, verbatim from the spec.
- Never the `disabled` attribute on a conditionally-inert control —
  `setInert()` / `isInert()` from `src/controls.ts`, every activation path
  guarded.
- `syncControls()` is the sole caller of `symbolPane.setLocked` (BR-1604), and
  is driven by the `focusin` listener and by `stdinPending()` / `stdinIdle()`
  as well as by the control passes (**D-06**).
- Every focus listener for this feature lives in `src/main.ts`, never in
  `src/symbol-pane.ts` (FR-1610, BR-1601), and dismisses nothing.
- Never relax a threshold or skip an assertion to make a gate green.

## 6. Known gaps

**None.** The only limits left are the frozen spec's own *Known limits*, which
are deliberate:

- A stdin insertion has no native undo (`setRangeText` is invisible to the
  browser's undo stack; the field is cleared on every submit).
- The target is inferred state: with focus parked on a symbol button, "where
  will this land" is answered by the FR-1608 outline rather than by a caret the
  visitor is looking at.
- A palette insertion is not a typed insertion: no auto-close and no
  completion, though `indentOnInput` treats the two paths identically.

Recorded outside this spec so they are not mistaken for it: the six local-only
test failures (**D-12**) and VC-432's 1280 × 720 column-share band, which fails
identically against a rebuilt `376d8dc`.
