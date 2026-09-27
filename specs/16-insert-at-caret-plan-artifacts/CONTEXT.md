# CONTEXT — insert-at-caret (spec 16)

State of the codebase as of Iteration 4 (`04-suite-migration`).

## 1. Where the work stands

Iteration 4 of 5 is **complete and committed**. The feature is whole and the
suite describes it: a live activation inserts at the editor caret or into a
pending stdin field, the resolved target is outlined while the pane holds
focus, every clipboard-era criterion has been rewritten or retired, and the
audit gates are green.

**Nothing behavioural is left.** Iteration 5 is documentation only:

- `specs/03-vertical-pane-frozen.md` — apply the *Supersedes BR-301* table
  (BR-301, FR-306 – FR-308, FR-313, FR-316, BR-303 struck with a pointer here;
  A-303 discharged; *Deliberately excluded* drops its insert-at-caret entry).
- `specs/16-insert-at-caret.md` — the two sentences known to be wrong (D-07's
  FR-1607 enumeration, D-08's FR-1606 premise), **D-09's correction to the
  *Existing criteria* list (VC-317 is rewritten, not re-run)**, then freeze as
  `16-insert-at-caret-frozen.md`.
- `docs/architecture.md` — *It never touches the editor* → *It reaches the
  editor through one callback*; the `indentOnInput` parity note (D-05); where
  the target and the lock are decided; the D-08 engine note.
- `README.md` — the Symbols line, if it mentions copying.
- VC-1616's greps.

## 2. File map

| File | State after Iteration 4 |
|---|---|
| `src/editor.ts` | Unchanged since Iteration 1: `symbolInsertion()`, `insertAtCaret()`. |
| `src/insert.ts` | Unchanged since Iteration 1: `insertIntoField()`. |
| `src/format.ts` | Unchanged since Iteration 2. `COPIED_MS`, `formatSymbolInserted`, `SYMBOLS_LABEL`. Exports neither `formatSymbolCopied` nor `SYMBOL_COPY_FAILED` (half of VC-1616 already holds). |
| `src/symbol-pane.ts` | Unchanged since Iteration 2 — and must stay free of `clipboard`, `Notices`, `@codemirror/`, `focusin`, `focusout`, `data-insert-target` and any `document`-level listener, all of which VC-1612 greps for. |
| `src/main.ts`, `src/styles.css` | Unchanged since Iteration 3. |
| `tests/e2e/symbols.spec.ts` | **Rewritten in place.** VC-307, VC-308, VC-316, VC-317, VC-320 migrated; VC-309 – VC-312, VC-314, VC-328, VC-333 deleted; VC-1614 (×3) and VC-1615 added. New helpers: `trackDocChanges()`, `expectCoreInsertion()`, `expectHitAreas()`. `copiedButtons()` and `denyClipboard()` are gone. |
| `tests/e2e/matrix.spec.ts` | **VC-324 migrated** to insertion; the Chromium `clipboard-write` grant and the `context` / `browserName` fixtures removed. |
| `tests/e2e/perf.spec.ts` | **VC-323** waits for `Inserted #`. |
| `tests/e2e/presentation.spec.ts` | **Migrated**: `data-state="inserted"`, `Inserted #`, and `measureInsertTargetOutlines()` feeding VC-071 / VC-514 in both palettes. `paintEverySurface()` parks the caret and activates `#`. |
| `tests/e2e/helpers.ts` | VC-327's doc comment cites BR-1601; its clipboard leg is recorded as retired. |
| `tests/unit/*` | **Unchanged** — `symbols.test.ts` and `toolbar-align.test.ts` name no retired VC and assert no copy behaviour. |
| `CLAUDE.md`, `docs/ci.md` | **Updated** with the true expected-count figures and the local-failure table. |
| `specs/03-vertical-pane-frozen.md`, `docs/architecture.md`, `README.md` | Unchanged (Iteration 5). |

## 3. Public interfaces

Unchanged since Iteration 3.

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

// src/main.ts (module-internal, inside boot())
let  lastFocusedTarget: 'editor' | 'stdin';
let  stdinCaret: number | null;                     // DECISIONS D-08
let  lockedTarget: 'editor' | 'stdin' | null;
function resolveInsertTarget(): 'editor' | 'stdin' | null;
function markInsertTarget(target: 'editor' | 'stdin' | null): void;   // FR-1608
function paneHoldsFocus(node: EventTarget | null): boolean;
function syncInsertTargetOutline(): void;
```

`resolveInsertTarget()`: `'stdin'` when the last-focused target is the field
**and** the field is not inert (a read is pending); otherwise `'editor'` when
the editor is editable; otherwise `null`. The full table is in
`iterations/03-stdin-target.md`.

The CSS that paints FR-1608, and that the contrast gate now samples:

```css
.cm-editor .cm-content[data-insert-target],
.stdin-input[data-insert-target] { outline: 2px dashed var(--focus); outline-offset: -2px; }

.cm-editor:not(.cm-focused):has(.cm-content[data-insert-target]) .cm-cursor { display: block; }
```

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
PW_PORT_BASE=4273 npm run audit:perf
PW_PORT_BASE=4273 npm run audit:contrast
PW_PORT_BASE=4273 MATRIX=1 npm run test:matrix
```

E2E specs run against the **built** site: run `npm run build` after any `src/`
change or Playwright reuses the previous build. Playwright's `webServer` block
rebuilds and starts three servers each run; leaving `npx vite preview --port
4273`, `node scripts/serve-plain.mjs 4274` and `node scripts/serve-deploy.mjs
4275` running makes repeated runs much faster (`reuseExistingServer` is on
outside CI).

### Expected results

| Command | Here (macOS) | On the CI runner |
|---|---|---|
| `npx playwright test --project=chromium` | `339 passed, 6 failed, 2 skipped` | `342 passed, 5 skipped` |
| `npm run audit:contrast` | `11 passed` | `11 passed` |
| `npm run audit:perf` | `9 passed, 1 failed, 1 skipped` (VC-814) | `10 passed, 1 skipped` |
| `MATRIX=1 npm run test:matrix` | `6 passed, 2 failed, 24 skipped` | local only |

The six local failures and the two matrix failures are all pre-existing and all
evidenced in `iterations/04-suite-migration.md` §3 – §4 and `DECISIONS.md`
**D-12**. None is a threshold to relax.

## 5. Conventions in force

- Every non-obvious line cites its requirement (`FR-`/`BR-`/`NFR-`/`VC-`);
  every test is named after the VC it discharges.
- User-visible strings live in `src/format.ts`, verbatim from the spec.
- Never the `disabled` attribute on a conditionally-inert control —
  `setInert()` / `isInert()` from `src/controls.ts`, and **every** activation
  path guarded.
- `syncControls()` is the sole caller of `symbolPane.setLocked` (BR-1604), and
  is driven by the `focusin` listener and by `stdinPending()` / `stdinIdle()`
  as well as by the control passes (**D-06**).
- Every focus listener for this feature lives in `src/main.ts`, never in
  `src/symbol-pane.ts` (FR-1610, BR-1601), and dismisses nothing.
- Never relax a threshold or skip an assertion to make a gate green.
- Artifacts are committed with the code they describe.

## 6. Known gaps

**Documentation only.** Everything in §1's Iteration 5 list, and nothing else:

- `specs/03-vertical-pane-frozen.md` is unamended and VC-1616 is undischarged.
- `docs/architecture.md` still describes a pane that never touches the editor,
  and carries neither the `indentOnInput` parity note (**D-05**) nor the
  Chromium selection note (**D-08**).
- `specs/16-insert-at-caret.md` is still DRAFT and still contains the two
  sentences **D-07** and **D-08** contradict, plus the *Existing criteria* list
  that **D-09** corrects.
- `README.md` has not been checked for a "copies to the clipboard" claim.

Outside this spec, and recorded so they are not mistaken for it: the six
local-only test failures (**D-12**) and VC-432's 1280 × 720 column-share band,
which fails identically against a rebuilt `376d8dc`.
