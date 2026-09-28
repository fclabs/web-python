# Iteration 2 — The pane inserts into the editor

**Goal**: replace the clipboard path with an editor insertion end to end — the
pane emits `onInsert`, `src/main.ts` resolves the editor as the target, mutates
it, and drives inertness and feedback.

**Outcome**: **done.** Every scope item is implemented and all 13 spec-16
tests pass.

One Must-vs-Must conflict surfaced mid-iteration and was escalated rather than
worked around: FR-1602's "the pane's `:` does not re-indent the line" cannot
hold while FR-1601 / BR-1602 mandate `userEvent: 'input.type'`. The user chose
**Option 1 — amend FR-1602 and VC-1603** and keep the user event, so
`src/editor.ts`, `src/main.ts` and `src/symbol-pane.ts` are unchanged by that
decision and `specs/16-insert-at-caret.md` is amended in this commit. Full
write-up and evidence in *The FR-1602 amendment* below and in `DECISIONS.md`
**D-05**.

## What was built

| File | Change |
|---|---|
| `src/format.ts` | Deleted `formatSymbolCopied` and `SYMBOL_COPY_FAILED` (FR-307 / FR-308 retired). Re-pointed `COPIED_MS`'s doc comment at FR-1609. `COPIED_MS` and `SYMBOLS_LABEL` are otherwise untouched and still shared with Copy code / Copy output. |
| `src/symbol-pane.ts` | Header rewritten: BR-301 superseded by BR-1601, the pane's three effects named, the "registers no focus-loss listener, no outside-click listener and no pointer listener" paragraph kept verbatim. `SymbolPaneElements` gains `onInsert(value)` and drops `notices`. Removed the `writeClipboard` import, `selectGlyph()`, `activationId` and the async `activate()` body. `activate()` is now synchronous and `isInert()`-guarded. Added `setLocked(locked)`. Renamed `copiedButton` → `insertedButton`. Imports `isInert`/`setInert` from `./controls`. |
| `src/main.ts` | Imports `insertAtCaret`. The pane is kept in `const symbolPane` and given an `onInsert` that resolves the target and calls `insertAtCaret(view, value)`; `notices` dropped from the construction call. New `resolveInsertTarget()` immediately above `syncControls()`; `syncControls()` now ends its editor block with `symbolPane.setLocked(resolveInsertTarget() === null)`. |
| `src/styles.css` | `.symbol[data-state='copied']` → `.symbol[data-state='inserted']` (comment re-pointed at FR-1609 / NFR-1603); `.symbol`'s `user-select: text` FR-308 workaround removed. |
| `specs/16-insert-at-caret.md` | **Amended** per `DECISIONS.md` D-05 (the spec is still DRAFT; Iteration 5 freezes it). FR-1602 rewritten, VC-1603 rewritten, and the consequential text in *What it does*, *Known limits* and *Out of scope* brought into line. FR-1601, FR-1603 and BR-1602 untouched. |
| `tests/e2e/symbols.spec.ts` | New spec-16 section (from line 1212): six local helpers plus 13 tests — VC-1601, VC-1602, VC-1603, VC-1604, VC-1605, VC-1606 ×2, VC-1610, VC-1611, VC-1612 ×2, VC-1613 ×2. Three imports added (`node:fs`, `node:path`, `node:url`) plus `diagnosticEntries` and `editorSnapshot` from `./helpers`, and a `SRC_DIR` constant. No existing test was edited, deleted or skipped. |

No other file in `src/` or `tests/` was touched. `src/editor.ts` and
`src/insert.ts` are exactly as Iteration 1 left them.

## Success criteria

| # | Criterion | Command | Result |
|---|---|---|---|
| 1 | `npm run build` exits 0 | `npm run build` | **PASS** — exit 0, `✓ 56 modules transformed`, `dist/assets/index-*.js 478.88 kB │ gzip: 160.45 kB` (Iteration 1: 478.64 kB / 160.40 kB). |
| 2 | `npm run test:unit` exits 0; `tests/unit/format.test.ts` no longer references the removed strings | `npm run test:unit` | **PASS** — `Test Files 27 passed (27)`, `Tests 346 passed (346)`. No unit test ever referenced `formatSymbolCopied` or `SYMBOL_COPY_FAILED`, so no test file needed editing — verified by criterion 3's grep over `tests/` as well as `src/`. |
| 3 | `grep -n "formatSymbolCopied\|SYMBOL_COPY_FAILED" src/` returns nothing (**VC-1616**, `src/format.ts` leg) | `grep -rn "formatSymbolCopied\|SYMBOL_COPY_FAILED" src/ tests/ scripts/ docs/ README.md` | **PASS** — no output, repo-wide. |
| 4 | `grep -n "clipboard\|writeClipboard\|Notices\|@codemirror/" src/symbol-pane.ts` returns nothing (**VC-1612**, **VC-1613**, **BR-1601**) | that grep | **PASS** — no output. (The module header says "copy-only" and "the CodeMirror packages" precisely so the gate stays clean.) |
| 5 | The new VC-1601 – VC-1606 and VC-1610 – VC-1613 tests pass | `PW_PORT_BASE=4273 npx playwright test --project=chromium tests/e2e/symbols.spec.ts` | **PASS** — all 13 new tests green; `31 passed, 12 failed`, every failure clipboard-era or pre-existing (list below). |
| 5a | **VC-1601** 29 buttons in order | in the run above | **PASS** — caret at offset 1 in `ab\n`; after each activation the document is `a<concat so far>b\n` and the selection is collapsed at `1 + concat.length`; the final document is `a` + the 29 values + `b\n`. |
| 5b | **VC-1603** (amended) `(` is literal while typing still pairs; `...` is three characters; the pane's `:` re-indents identically to typing, in one undo step | in the run above | **PASS** — `(` inserts one character while typing `(` yields `()`; `...` inserts three characters; on `if x:\n    pass\n    else\n` with the caret at the end of line 3 both the pane's `:` and a typed `:` produce `if x:\n    pass\nelse:\n`, and one `Ctrl/Cmd+Z` after the pane's takes the document all the way back. |
| 5c | **VC-1605** three activations within 500 ms need three undos, in reverse; one undo restores document *and* selection | in the run above | **PASS** — the three activations are dispatched from one `page.evaluate` (a single task, so the 500 ms `newGroupDelay` cannot be missed) and undo walks `x = 1#_|` → `x = 1#_` → `x = 1#` → `x = 1`. The collapsed-caret and replaced-selection cases both restore the full `editorSnapshot` (text + anchor + head). |
| 5d | **VC-1606** running / binary / no-active-file legs | in the run above | **PASS** — two tests. Each state reports `aria-disabled="true"` on all 29 buttons, no `disabled` attribute, exactly one `tabindex="0"`, and a button still takes focus. A forced click plus `Enter` and `Space` leave the `editorSnapshot`, `#symbol-status` and the `data-state` set byte-identical. Leaving each state makes the same activation insert. Undo depth is shown to be unchanged by undoing the *first live* insertion back to the exact document that existed during the locked state. |
| 5e | **VC-1612** five insertions, focus, tab stop, arrows, source grep | in the run above | **PASS** — two tests. After five insertions the pane is visible, `aria-expanded="true"`, `scrollTop > 0` and unchanged by a sixth insertion, `document.activeElement` is the last activated button, it is the pane's only `tabindex="0"`, and `expectPaneNavigable()` confirms arrow navigation. The source grep rejects `blur`, `focusout`, `pointerdown`, `mousedown`, `document.addEventListener`, `window.addEventListener` and `@codemirror/`, and requires the FR-318 paragraph to still be present. |
| 6 | Legacy clipboard-era tests are expected to fail and are neither deleted nor skipped | full chromium run | **PASS** — none touched; exact list below. |
| 7 | Artifacts written | — | **PASS** — `CONTEXT.md` rewritten, `DECISIONS.md` **D-05** appended, this record. |

Full-suite reference run:
`PW_PORT_BASE=4273 npx playwright test --project=chromium` → **`312 passed,
2 skipped, 25 failed (5.2m)`** (Iteration 1 baseline: `323 passed, 2 skipped,
6 failed`).

## The FR-1602 amendment (`DECISIONS.md` D-05 — resolved, Option 1)

`indentOnInput()` is an `EditorState.transactionFilter` gated solely on
`tr.isUserEvent("input.type")`; it never inspects how the transaction was
produced. FR-1601 and BR-1602 both *require* the insertion to carry that user
event, so the pane's transaction is re-indented exactly as typed input is
wherever Python's `indentOnInput` rules match
(`/^\s*([\}\]\)]|else:|elif |except |finally:|case\s+[^:]*:?)$/`).

Reproduced on `if x:\n    pass\n    else\n`, caret at end of line 3: both the
pane's `:` and a typed `:` produce `if x:\n    pass\nelse:\n`. FR-1602 says the
pane's must not.

Consequently the plan's VC-1603 sentence — "its `:` on an `if x` line does not
re-indent, while *typing* the same characters in the same editor still does
both" — is unsatisfiable by **any** implementation, because `if x` matches none
of those rules and so typing does not re-indent it either.

`closeBrackets()` is unaffected: it hooks real input handlers, so the pane's
`(` is genuinely literal. FR-1603 is also unaffected: a transaction filter's
extra changes ride in the same transaction, so one activation is still one undo
step (VC-1605 proves it).

Two ways out were put to the user: amend FR-1602 / VC-1603, or drop
`userEvent: 'input.type'` from `symbolInsertion` (an Iteration 1 change, and a
Must-level deviation from FR-1601 / BR-1602 in its own right).

**The user chose Option 1.** `specs/16-insert-at-caret.md` is amended in this
commit: FR-1602's literalness guarantee now covers bracket-pairing and
completion only, and a second paragraph records `indentOnInput` as reached —
with both file:line citations — and re-indentation as *intended parity with
typing*. VC-1603 is rewritten to assert the reachable legs plus the positive
parity case. *What it does*, *Known limits* and *Out of scope* follow. No
production code changed as a result.

Nothing was relaxed, skipped or asserted loosely at any point. Before the
decision VC-1603 asserted only the legs that held and named the un-assertable
one in the test body; it now asserts the amended criterion in full.

**Iteration 5 must not re-litigate this** — the amendment is already in the
tree and is the text to freeze. `docs/architecture.md` still needs the parity
note; that is Iteration 5's documentation pass.

## Legacy failures for Iteration 4

Everything below fails **because** the clipboard path was removed, and is
Iteration 4's to migrate. Line numbers are as committed here.

### `tests/e2e/symbols.spec.ts`

| VC | Line | Test |
|---|---|---|
| VC-307 | 586 | every value lands on the clipboard, and the editor never moves |
| VC-308 | 623 | the copied `**` pastes as exactly two characters |
| VC-309 | 639 | `Copied (` appears at once and reverts after the window |
| VC-310 | 660 | a second copy replaces the text and restarts the timer |
| VC-311 | 685 | a denied write notifies, selects the glyph and degrades nothing |
| VC-312 | 729 | with no clipboard API at all the pane falls back and Run still works |
| VC-328 | 759 | a denial after a success leaves no stale feedback |
| VC-314 | 970 | Enter and Space both copy the focused character |
| VC-316 | 1062 | copying mid-run interrupts neither the run nor its output |
| **VC-317** | **1113** | copying while a read is pending injects nothing into stdin |
| **VC-320** | **1172** | opening and copying persists nothing, and a reload closes the pane |

Two corrections to the plan's predicted list:

- **VC-333** (line 804, "a pane closed mid-write produces no feedback at all")
  now **passes** — insertion is synchronous, so there is no in-flight write to
  close over, and `close()` → `clearFeedback()` satisfies it. The plan expected
  it to fail. It is still *retired* by the spec; Iteration 4 should delete it
  rather than migrate it.
- **VC-317** and **VC-320** were not on the plan's list but do fail: both call
  `symbolButton(...).click()` and then assert `Copied V`. VC-317 additionally
  times out because the button is `aria-disabled` during a pending read
  (Iteration 3 makes stdin a live target, which will unblock the click but not
  the `Copied ,` assertion). VC-320's storage assertion is still meaningful and
  should survive migration with `Inserted _` in place of `Copied _`.

### Outside `symbols.spec.ts` — also Iteration 4 (it owns the audit gates)

| Spec | Line | Test | Why |
|---|---|---|---|
| `perf.spec.ts` | 348 | VC-323 (NFR-304, NFR-305) | waits for `#symbol-status` to read `Copied #`. |
| `presentation.spec.ts` | 456 ×2, 475 ×2, 571 ×2, 591 ×2 | VC-051 / VC-071 / VC-514 contrast, light + dark + both forced modes | line 210 drives a copy and waits for `Copied "`; the samplers at lines 248, 505 and 613 select `.symbol[data-state="copied"]`. Renaming the state to `inserted` and the expected text to `Inserted "` is the whole fix. |

`npm run audit:perf` and `npm run audit:contrast` were therefore **not run** as
gates this iteration — they cover exactly the tests above and would report the
same known-cause failures. Iteration 4 runs them after migrating.

### Pre-existing, not this spec's (verified at `376d8dc` in Iteration 1)

`completion.spec.ts:47` VC-608/VC-1103 · `layout.spec.ts:991` VC-431 ·
`layout.spec.ts:1272` VC-407 · `presentation.spec.ts:723` VC-052 ·
`symbols.spec.ts:890` VC-315. `perf.spec.ts:753` VC-814 was on that list but
**passed** on this run, so treat it as flaky rather than fixed.

## Hands off

### `resolveInsertTarget()` and where Iteration 3 plugs in

`src/main.ts`, declared immediately above `syncControls()` inside `boot()`:

```ts
function resolveInsertTarget(): 'editor' | 'stdin' | null {
  // Iteration 3: `if (!isInert(stdinInput)) return 'stdin';` goes here,
  // ahead of the editor, gated on the last-focused record.
  const active = workspace.activeFile;
  const bytes = active === null ? null : workspace.get(active);
  if (running || active === null || bytes === null || !isText(bytes)) return null;
  return 'editor';
}
```

The stub comment is the first line of the body — Iteration 3 extends this one
function and does not restructure anything. Note that `stdinInput` is declared
*below* `syncControls()` in the file (it is a `const` in the same `boot()`
scope), which is fine: `resolveInsertTarget` is a hoisted function declaration
and is only ever called after boot completes.

### Which `syncControls()` locals the resolution reuses

`running` (the module-level `let` at `src/main.ts:101`), `active`
(`workspace.activeFile`) and `bytes` (`workspace.get(active)`), fed through
`isText(bytes)` — the same three facts `syncControls()` uses for
`setEditorReadOnly(view, running || (bytes !== null && !isText(bytes)))`.

They are **recomputed** inside `resolveInsertTarget()` rather than passed in,
because `onInsert` also calls it and the plan fixes the signature as
`resolveInsertTarget(): 'editor' | 'stdin' | null`. Same sources, same values,
one pass apart — they cannot drift. Note the resolution is deliberately
*stricter* than `setEditorReadOnly`: no active file leaves the editor writable
but is **not** a live insertion target (FR-1605, FR-1607).

### The `onInsert` / `setLocked` contract

```ts
// src/symbol-pane.ts
interface SymbolPaneElements { …; onInsert(value: string): void }
class SymbolPane { …; setLocked(locked: boolean): void }
```

- `onInsert(value)` is called by `activate()` **only** when
  `isInert(button)` is false, before any feedback is written. The pane does not
  inspect the result, has no idea what a target is, and exposes no predicate
  for `main.ts` to query (BR-1601, BR-1604).
- `setLocked(locked)` calls `setInert(button, locked)` on all 29 buttons. It
  never touches `tabIndex` (FR-309's roving model owns it) and never writes
  `disabled`.
- **`syncControls()` is the sole caller of `setLocked`** — one line, at the end
  of its editor block. Do not add a second caller in Iteration 3; extend
  `resolveInsertTarget()` instead and `syncControls()` picks it up.
- `clearFeedback()` remains the single writer of `#symbol-status` and of
  `data-state="inserted"`, and is still called by `close()`.

### Other notes for Iteration 3

- `src/insert.ts`'s `insertIntoField` still has **no importer**; Vite
  tree-shakes it. Wiring it in is the first bundle growth of this spec.
- `stdinInput` is `need<HTMLInputElement>('stdin-input')` at roughly
  `src/main.ts:691`, and `isInert(stdinInput)` is already exactly "no read is
  pending" (`stdinPending()` / `stdinIdle()` are its only writers).
- The e2e helpers `focusEditor`, `setSelection`, `insertedButtons`,
  `buttonStates`, `expectPaneLocked` and `expectInertActivationsDoNothing` are
  local to `tests/e2e/symbols.spec.ts`'s spec-16 section and are the right
  place to add the stdin legs of VC-1606, VC-1607, VC-1608 and VC-1613.
- `symbolStatus()` and `symbolButton()` (defined around line 544, in the
  clipboard-era section) are reused by the spec-16 tests. If Iteration 4 moves
  or deletes that section, keep those two helpers.

## Deviations from the plan

1. **`specs/16-insert-at-caret.md` was amended**, which was not in Iteration
   2's scope. It became necessary mid-iteration; binding rule 11 was followed
   (stop, report, do not commit), the user chose Option 1, and the amendment
   was made under that instruction. See *The FR-1602 amendment* and
   `DECISIONS.md` D-05. No production code changed because of it.
2. **VC-1602's multi-range leg is asserted as unreachable rather than
   exercised.** The playground never enables
   `EditorState.allowMultipleSelections`, so a two-range selection cannot exist
   in the app at all. The test asserts `selection.ranges.length === 1` with a
   comment, and the real multi-range coverage stays in
   `tests/unit/insert.test.ts` (`DECISIONS.md` D-04).
3. **VC-1610's lint leg uses `**`, not `(`.** Typing `(` auto-closes to `()`
   (FR-1602), which is *valid* Python and produces no diagnostic, so `(` cannot
   compare the insert and type paths on the same document. `**` inserts and
   types identically and is a syntax error either way.
4. **VC-1612's "still scrolled" is asserted as `scrollTop > 0` and unchanged by
   a further insertion**, rather than equal to a value sampled before the five
   activations. Activating `...` (the last button of the last group) scrolls
   the pane by design — that *is* "the pane is still open and scrolled"; an
   equality against the pre-activation scrollTop would have been asserting the
   opposite of the criterion.
5. **`tests/unit/format.test.ts` was not edited** — it never referenced the two
   deleted strings. Verified by a repo-wide grep (criterion 3).
6. **`npm run audit:perf` / `npm run audit:contrast` were not run.** They gate
   exactly the `perf.spec.ts:348` and `presentation.spec.ts` contrast tests
   listed above, whose failure cause is known and is Iteration 4's. Running
   them would add no information and their output is recorded there instead.
