# DECISIONS — insert-at-caret (spec 16)

Append-only. One entry per non-obvious choice, newest last.

---

## D-01 — `insertIntoField` lives in a new `src/insert.ts`

*Iteration 1.* **Flagged in the plan as a spec ambiguity; resolved as the
plan's stated default.*

The spec's *Modules* table gives `src/editor.ts` "the editor half" and says
`src/main.ts` "owns `insertAtCaret` for both targets", but its *Verification
Criteria* require `npm run test:unit` to cover "`setRangeText` offsets"
"without a browser". `src/main.ts` is the Vite entry point: it boots the
worker, the workspace and the service worker on import, and is not unit tested.
Putting the field helper there would make that criterion unreachable.

Putting it in `src/editor.ts` was considered and rejected: that module imports
the whole CodeMirror stack, and the stdin field has nothing to do with an
`EditorView`.

**Decision.** `src/insert.ts` exports `insertIntoField(field, value)` and
imports nothing. `symbolInsertion` / `insertAtCaret` stay in `src/editor.ts`
as the spec says. `src/main.ts` composes both (Iterations 2 and 3).

**Consequence.** The spec's *Modules* table gains a `src/insert.ts` row —
Iteration 5 amends the spec text when it freezes the file. Nothing else in the
spec changes.

---

## D-02 — The unfold rides in its own preceding transaction, not the insertion

*Iteration 1.*

FR-1601 says the insertion is "exactly one transaction" and "no other
transaction is dispatched", while also requiring a fold covering the insertion
point to be opened. Folding upstream (`foldState` in `@codemirror/language`)
maps its stored ranges through `tr.changes` **before** it applies the
transaction's effects, so an `unfoldEffect` carrying pre-change offsets in the
same transaction as the insertion would no longer match the mapped range and
would silently fail to unfold.

**Decision.** `insertAtCaret` dispatches the unfold effects first, in a
transaction that carries **no document change and no selection** — which
`history()` does not record, so it creates no undo entry and FR-1603's
one-activation-one-undo guarantee is intact. The plan explicitly permits "one
preceding unfold dispatch". The transaction is dispatched only when
`foldedRanges(state).between(head, head, …)` actually yields a range, so the
common case is exactly one dispatch in total.

---

## D-03 — `isolateHistory.of('full')`

*Iteration 1.*

`isolateHistory` accepts `'before' | 'after' | 'full'`. FR-1603 requires that
`history()` merge the insertion with neither the change before it **nor** the
one after it, which is `'full'`; `'before'` alone would let the *next* typed
character coalesce into the insertion's undo step.

---

## D-04 — `EditorState.allowMultipleSelections` is enabled in the unit test only

*Iteration 1.*

VC-1602's two-range case needs a state that retains both ranges. A bare
`EditorState.create` keeps only the main range unless the facet is on, and the
playground's editor does not enable it (no `allowMultipleSelections` anywhere
in `src/`). The facet is therefore set in the test's local state, with a
comment saying why. No production code changed: FR-1601 delegates multi-range
mapping to CodeMirror's own `replaceSelection`, which is what the test
exercises.

---

## D-05 — FR-1602's "no re-indent" clause is dropped; re-indentation is parity with typing

*Iteration 2.* **Escalated to the user and RESOLVED — Option 1 chosen.** The
spec amendment is already applied to `specs/16-insert-at-caret.md`; Iteration 5
freezes that text and must not re-litigate it.

FR-1602 states that "spec-12's `closeBrackets()` and spec-01's
`indentOnInput()` hook *typed* input and are deliberately not reached by a
programmatic transaction, so … the pane's `:` does not re-indent the line."

Half of that premise is false. `closeBrackets()` really does hook input
handlers, so the pane's `(` inserts one character — verified. But
`indentOnInput()` is an `EditorState.transactionFilter`
(`@codemirror/language`, `dist/index.js:1186`) whose only gate is

```js
if (!tr.docChanged || !tr.isUserEvent("input.type") && !tr.isUserEvent("input.complete"))
  return tr;
```

It never looks at how the transaction was produced. FR-1601 and BR-1602 both
*require* the insertion to carry `userEvent: 'input.type'`, so the pane's
transaction passes that gate and is re-indented exactly as typed input is.

Observed, on `if x:\n    pass\n    else\n` with the caret at the end of line 3:

| Path | Result |
|---|---|
| Pane `:` | `if x:\n    pass\nelse:\n` — **re-indented** |
| Typing `:` | `if x:\n    pass\nelse:\n` — identical |

Python's `indentOnInput` rules are
`/^\s*([\}\]\)]|else:|elif |except |finally:|case\s+[^:]*:?)$/`, so `if x` +
`:` re-indents under *neither* path. That is why the plan's VC-1603 wording
("its `:` on an `if x` line does not re-indent, while *typing* the same
characters in the same editor still does both") is not satisfiable by any
implementation: there is no `:` case where typing re-indents and the pane does
not.

**Options put to the user:**

1. **Amend FR-1602 / VC-1603** to scope the literalness guarantee to
   bracket-pairing and completion, and record re-indentation as intended
   parity with typing. Changes no code; FR-1601, BR-1602 and FR-1611 all stay
   intact. It narrows the spec's stated promise.
2. **Change `symbolInsertion`** (Iteration 1's `src/editor.ts`) to stop
   carrying `userEvent: 'input.type'`. That satisfies FR-1602 but contradicts
   FR-1601's explicit wording and BR-1602's "indistinguishable from typing for
   every downstream observer". Autosave and lint (FR-1611) key off
   `docChanged`, not the user event, so they would be unaffected — this was
   checked, not assumed — but it is an Iteration 1 change and a Must-level
   spec deviation of its own.

**Decision — the user chose Option 1.** `userEvent: 'input.type'` stays;
`src/editor.ts`, `src/main.ts` and `src/symbol-pane.ts` are untouched by this
decision.

Applied in the same commit, to `specs/16-insert-at-caret.md` (still DRAFT):

- **FR-1602** rewritten. The literalness guarantee now covers bracket-pairing
  and completion only. A second paragraph records `indentOnInput` as reached,
  cites both file:line facts above, and states the parity rationale: it adds no
  character the visitor did not ask for, it only moves leading whitespace the
  language mode already owns, and the filter's changes ride in the insertion's
  own transaction so FR-1603 is unaffected. The surviving rationale
  (matched-pair insertion is out of scope; a palette that silently adds a
  character cannot be used to repair one) and the multi-character-values
  sentence are kept verbatim.
- **VC-1603** rewritten to assert only what is true and reachable: `(` is
  literal while typing `(` still pairs; `...` is three characters; and on a
  dangling `else` — a shape the Python regex genuinely matches — the pane's `:`
  re-indents to exactly the same result as typing `:` there, in one undo step.
  The unsatisfiable "`:` on an `if x` line does not re-indent, while typing
  still does both" leg is dropped.
- *What it does*, *Known limits* and *Out of scope* brought into line.
  FR-1601, FR-1603 and BR-1602 are untouched.

**Consequences.**

- FR-1602's promise is narrower than it was drafted: the pane diverges from
  typing on bracket-pairing and completion, and matches it on indentation.
- `docs/architecture.md` must carry the re-indentation parity note — **Iteration
  5**, with the rest of the documentation pass.
- **Iteration 5 must not re-litigate this.** The spec amendment is already in
  the tree; Iteration 5 freezes it as-is.

---

## D-06 — `syncControls()` is now also driven by focus and by the stdin read state

*Iteration 3.*

FR-1607's lock is `symbolPane.setLocked(resolveInsertTarget() === null)` and
BR-1604 makes `syncControls()` its **only** caller. From this iteration the
resolution depends on two facts `syncControls()` was never re-run for:

- the last-focused target (`focusin`), and
- whether a read is pending (`stdinPending()` / `stdinIdle()`).

Without a re-run the lock would go stale — a program blocked on `input()`
would keep the buttons inert from the moment the run started, and every
activation path would no-op although FR-1607 says a pending read is a live
target.

**Decision.** `syncControls()` is called from the `focusin` listener and at the
end of `stdinPending()` and `stdinIdle()`. `setLocked` still has exactly one
caller, so BR-1604 is intact; nothing else about the pass changed. The call is
cheap (attribute writes that `setInert` skips when unchanged) and cannot
recurse: `setInert` moves no focus and fires no focus event.

---

## D-07 — The editor is the fallback target even while a read is pending

*Iteration 3.* **A known divergence between FR-1605 and FR-1607 — recorded,
not resolved. Iteration 5 owns the spec text.**

The plan fixes the resolution as: *the last-focused target when it is live;
otherwise the editor when it is live; otherwise `null`* — which is FR-1605's
own wording ("whenever the last-focused target is not currently live, the
target is the editor"). That is what is implemented.

It has one reachable consequence FR-1607 does not list. While a program is
blocked on `input()` the visitor can click into the editor (read-only, but
still focusable). The record then says `editor`, the editor is not live
because a program is running, and the fallback is the editor, so the
resolution is `null` and the pane locks — although a read *is* pending, which
FR-1607's enumeration ("a running program with **no** pending read; a binary
active file; no active file") does not treat as a no-target state.

Resolving it would mean a second fallback (`otherwise the stdin field when it
is live`), which contradicts FR-1605's single stated fallback and is outside
this iteration's scope. Implemented as the plan specifies; flagged here so
Iteration 5 can either amend FR-1607's enumeration or add the second fallback
deliberately. No verification criterion exercises the state.

---

## D-08 — The stdin caret is remembered, because Chromium discards an unfocused field's selection

*Iteration 3.* **A deviation from FR-1606's stated premise, forced by the
engine. Implemented in `src/main.ts` only; `src/insert.ts` is unchanged.**

FR-1606 says "Focus is not moved: the field keeps its selection offsets while
unfocused, which is what lets several characters be inserted in a row from the
pane." Chromium does not. Measured directly (`chromium` via Playwright, an
`<input>` and a `<button>` on a bare page):

| step | `value` | `selectionStart` |
|---|---|---|
| focus the field, `setRangeText('abc', 0, 0, 'end')` | `abc` | 3 |
| click the button (field blurs) | `abc` | 3 |
| `setRangeText('X', 3, 3, 'end')` while unfocused | `abcX` | 4 |
| **click the button again** | `abcX` | **0** |

A selection written programmatically while the field is unfocused survives
until the next pointer-down elsewhere on the page, which discards it. The pane
is activated by exactly such a pointer-down, so from the *second* activation
onwards `insertIntoField` read offset 0 and the characters accumulated in
reverse: VC-1607 observed `...%|#_` where it required `_#|%...`.

**Decision.** `src/main.ts` keeps `stdinCaret: number | null` — the caret the
*pane* last left in the field — and restores it immediately before the
insertion, but only while the field does not have focus. It is set to
`stdinInput.selectionStart` after each pane insertion, and cleared whenever the
visitor takes the caret back (`focusin` on the field) or the field is reset
(`stdinIdle()`). When it is `null` the field's own offsets are used exactly as
FR-1606 describes, so a visitor who clicks into the field to position the caret
and then activates the pane still gets the insertion at their caret.

`src/insert.ts` is untouched: `insertIntoField` still reads
`selectionStart`/`selectionEnd` and its unit tests still describe the
platform-correct behaviour. The workaround is one restore call at the one call
site that needs it.

**Consequence.** FR-1606's parenthetical premise is wrong about at least one
engine. **Iteration 5** should amend that sentence to say the *module* keeps
the offsets rather than the field, and `docs/architecture.md` should carry the
engine note beside the existing WebKit ones. NFR-1604's pinned matrix is
Iteration 4's to run; the restore is unconditional, so an engine that does
preserve the selection is restored to the same offset and behaves identically.
