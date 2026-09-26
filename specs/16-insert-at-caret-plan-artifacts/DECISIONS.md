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
