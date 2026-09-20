# Frozen: Indentation-based code folding

Source: issue #40
Status: SHIPPED (implementation on branch; PR not yet merged at freeze)
Frozen: 2026-09-20
Parent: `specs/01-static-python-web-frozen.md`
Issue: https://github.com/fclabs/web-python/issues/40

This child spec uses the `15xx` identifier range.

## Purpose

Python students collapse and expand indented blocks from the editor gutter
without changing the program text. Folding follows indentation, so it still
works on incomplete code the parser cannot yet treat as a `Body`.

## Functional Requirements

**FR-1501 — Indentation fold ranges (Must)**

A line is foldable when a later non-empty line is more indented than it.
The fold starts at the end of that header line and runs through the last
non-empty line whose indent stays strictly greater. Blank and
whitespace-only lines do not end the region. A non-empty line at the same
or a smaller indent does. Nested headers are independently foldable.

This covers the usual Python blocks — `def` / `class`, `if` / `elif` /
`else`, `for` / `while`, `try` / `except` / `finally`, `with` — because
each of those introduces a deeper indent, not because the folder parses
those keywords.

**FR-1502 — Gutter controls (Must)**

The editor gutter shows a control on every foldable line. Clicking it
collapses the corresponding indented block; clicking it again expands the
block. Nested blocks fold independently of their parent.

**FR-1503 — Presentation only (Must)**

Folding does not insert, delete, or rewrite source characters. Undo and
Redo continue to reverse ordinary edits, not fold toggles. Selection,
autosave, linting, Tab indentation, delimiter pairing, and Run / Format
keep their existing behaviour. Cursor and selection offsets in the
document stay valid across fold and unfold.

**FR-1504 — Folded-region indication (Must)**

A collapsed block keeps its header line visible and replaces the hidden
lines with an ASCII `...` placeholder. The gutter marker on that line
shows the collapsed state. Clicking the placeholder expands the block.

## Business Rules

**BR-1501 — Native CodeMirror folding, indent first**

Fold state, the gutter, the placeholder, and the fold keymap come from
CodeMirror's `codeFolding`, `foldGutter`, and `foldKeymap`. The playground
registers an indent `foldService` so indentation is the default strategy
for Python. `@codemirror/lang-python`'s syntax folds remain the fallback
for constructs the indent service does not mark (delimiter-wrapped lists,
dicts, tuples, multi-line strings).

**BR-1502 — Editor-only**

Folding never touches the Pyodide worker, the stdin channel, Ruff, storage,
the network, or a visitor preference. There is no toolbar control and no
persisted fold state.

## Non-Functional Requirements

**NFR-1501 — Bounded application payload**

Against branch point `1b3da62` (`fix(ui): clarify layout controls and
contextual actions (#53)`), indentation folding adds at most 4 KiB to the
gzip-compressed first-party application payload and adds no precache URL.
The measurement excludes the byte-pinned Pyodide and Ruff vendor assets
and is recorded with the same runner-local compressor as the candidate
build.

This spec amends NFR-1301: its 3 KiB measurement remains the immutable
ship measurement for spec-13, but VC-1314-size no longer charges every
later whole-app feature to the Output branch point. Folding carries the
independently anchored NFR-1501 budget instead.

**NFR-1502 — Contrast**

Fold gutter markers and the `...` placeholder meet WCAG 2.1 AA in both
palettes: text ≥ 4.5:1, placeholder border ≥ 3:1.

## Interfaces

No public API, storage key, DOM id, worker message, network request, or
user preference is added. `src/editor.ts` installs `indentFolding()` from
`src/fold.ts` and places `foldKeymap` in the editor keymap.

## Verification Criteria

| ID | Covers | Criterion |
|---|---|---|
| **VC-1501** | FR-1501 | Unit: fold ranges for `def` / `class`, `if`/`elif`/`else`, `for`/`while`, `try`/`except`/`finally`, `with`, nested headers, and blank lines inside a block. Incomplete indented code still folds. |
| **VC-1502** | FR-1502 | Gutter controls collapse and expand the issue's `process_payment` example; the nested `if` folds independently of the function. |
| **VC-1503** | FR-1503 | Folding leaves `view.state.doc` byte-identical; one Undo after a later edit restores that edit and does not require a second Undo to "undo the fold". |
| **VC-1504** | FR-1504 | A collapsed block shows `...` on the header line and hides the folded source from the rendered lines. |
| **VC-1505** | NFR-1502 | Fold markers and the placeholder clear 4.5:1 (border 3:1) in both palettes. |
| **VC-1506** | NFR-1501 | The runner-local build is at most 4 KiB gzip above `1b3da62` and keeps the precache URL count unchanged. |

## Deliberately excluded

- Persisting which blocks are folded across reload.
- A visitor preference or toolbar control to disable folding.
- Folding as a document edit (which would dirty autosave and Undo).
- Replacing Python syntax folds; they stay as fallback when indent does not apply.
- Custom fold widgets that preview the hidden line count.
