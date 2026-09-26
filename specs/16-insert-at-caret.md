# Insert the symbol at the caret

Source: issue #58
Status: DRAFT — normative on merge, renamed to `16-insert-at-caret-frozen.md`
Parent: `specs/01-static-python-web-frozen.md`, `specs/03-vertical-pane-frozen.md`
Issue: https://github.com/fclabs/web-python/issues/58

This child spec uses the `16xx` identifier range.

## Purpose

The Symbols pane exists so a visitor whose keyboard buries `#`, `[`, `"` or `_`
can get those characters into their program. Today it copies the glyph and the
visitor must then focus the editor and paste — two extra steps, and on touch or
in a locked-down browser the clipboard write fails outright, at which point
FR-308 asks them to press `Ctrl/Cmd+C` themselves. Spec-03 recorded that gap as
the outstanding action **A-303** and said in as many words: *"If it cannot,
insert-at-caret is a follow-up spec, not a patch to this one."* This is that
follow-up spec.

Activating a character button now **inserts that character at the caret of the
text target the visitor was last in** — the editor, or the stdin field while a
program is waiting for input. The clipboard path is retired, not kept
alongside: one activation, one obvious outcome.

## Supersedes BR-301

Spec-03 BR-301 (*"Clipboard only, never insert-at-caret"*) and its *Deliberately
excluded* entry (*"Insert-at-caret … requires the editor mutation BR-301
forbids"*) are **superseded by BR-1601 below**, which replaces them rather than
narrowing them. The following spec-03 requirements are retired with them:

| Retired | Was | Replaced by |
|---|---|---|
| BR-301 | Clipboard only, never insert-at-caret | BR-1601 |
| FR-306 | Activation copies `value` to the clipboard | FR-1601 |
| FR-307 | `Copied V` for 2 000 ms | FR-1605 (`Inserted V`) |
| FR-308 | Denial notice + glyph selection fallback | — (no clipboard, no denial) |
| FR-313 | Missing clipboard API degrades to the fallback | — |
| FR-316 | A write in flight when the pane closes | — (insertion is synchronous) |
| BR-303 | Clipboard failure degrades the pane only | — |

The clipboard path is retired rather than kept as a secondary behaviour
(modifier-activated, or a second control) because a character palette with two
outcomes per button has to teach which is which, and the copy path's only
remaining audience — a visitor who wants the glyph somewhere outside the
playground — is served by selecting it in the editor after inserting it, or by
**Copy code** for a whole program. One activation, one outcome.

Every other spec-03 requirement — FR-301 – FR-305, FR-309 – FR-312, FR-314,
FR-315, FR-317, FR-318, BR-302, BR-304, BR-305, NFR-301 – NFR-306 — is
**unchanged and still live**, and its criteria re-run against a fresh build.

`specs/03-vertical-pane-frozen.md` and `docs/architecture.md` are amended in
the same commit; see *Documentation* below.

## What it does

- Activating a character button (pointer, `Enter`, `Space`) inserts exactly that
  row's `value` at the caret of the **current insertion target**, replacing any
  selection there, and leaves the caret immediately after the inserted text.
- The target is the text field the visitor was last in: the editor, or the
  stdin field while a program is waiting for input. It is outlined while the
  pane holds focus, so the visitor can see where the character will land.
- The insertion is **literal**: exactly the row's `value`, and nothing else. It
  does not auto-close a bracket and does not trigger completion. The editor's
  own `indentOnInput` still re-indents the line on the few tokens it reacts to,
  exactly as it does for typed input — parity, not an extra character.
- An editor insertion is a single CodeMirror transaction that never merges with
  the one before it, so `Ctrl/Cmd+Z` once removes exactly that character and
  restores the previous selection.
- The edited program is autosaved and linted exactly as it is for typed input —
  the pane creates no second path to storage and no second lint schedule.
- The pane stays open, keeps focus on the activated button, and keeps its
  roving `tabindex`, so several characters can be inserted in a row by pointer
  or by arrow-keys-and-`Enter` without leaving the pane.
- When there is **no live target** — the editor is locked by a running program
  and no read is pending, the active workspace file is binary, or there is no
  active file — every character button is inert (`aria-disabled="true"`, still
  focusable, never `disabled`) and every activation path is a no-op.
- A successful insertion paints `Inserted V` in the pane's existing
  `role="status"` region and `data-state="inserted"` on the button, reverting
  after `COPIED_MS`.
- Nothing is written to the clipboard or to the notice strip. **Copy code** and
  **Copy output** are untouched.
- The character set is unchanged: the same 29 rows, the same five groups, the
  same accessible names and tooltips.

## Functional Requirements

**FR-1601 — Insert at the caret of the editor (Must)**

A live activation whose target is the editor dispatches exactly one transaction
on the playground's `EditorView`, built from
`state.replaceSelection(value)` so that **every** selection range is replaced
and each resulting caret sits immediately after its inserted text. A collapsed
selection therefore inserts; a non-empty selection is replaced; a multi-range
selection is handled by CodeMirror's own mapping rather than by this module.
The transaction carries `userEvent: 'input.type'`, the `isolateHistory`
annotation of FR-1603, and scrolls the primary caret into view. If the
insertion point lies inside a range collapsed by spec-15's folding, that range
is opened so the inserted character is visible. No other transaction is
dispatched.

**FR-1602 — Insertion is literal (Must)**

The inserted text is exactly the row's `value` — never a matched pair, never a
completion. Spec-12's `closeBrackets()` hooks *typed* input and is deliberately
not reached by a programmatic transaction, so the pane's `(` inserts one
character where typing `(` inserts `()`. This divergence from typing is
intended: matched-pair insertion is out of scope, and a palette that silently
adds a character the visitor did not ask for cannot be used to repair one.

spec-01's `indentOnInput()` **is** reached. It is an
`EditorState.transactionFilter` gated on nothing but
`tr.docChanged && tr.isUserEvent('input.type')`
(`@codemirror/language`, `dist/index.js:1188`), which FR-1601 requires the
insertion to carry, and it never inspects how the transaction was produced. Its
Python rules
(`/^\s*([\}\]\)]|else:|elif |except |finally:|case\s+[^:]*:?)$/`,
`@codemirror/lang-python`, `dist/index.js:295`) therefore fire for an inserted
character exactly as they do for a typed one. Re-indentation is **parity, not a
defect**: it adds no character the visitor did not ask for, it only moves
leading whitespace the language mode already owns, and the filter's changes
ride in the same transaction, so FR-1603's one-activation-one-undo-step
guarantee is unaffected.

Multi-character values (`//`, `**`, `==`, `!=`, `<=`, `>=`, `...`) insert all
of their characters, in the one transaction of FR-1601.

**FR-1603 — Exactly one undo entry (Must)**

An editor insertion carries `isolateHistory` (from `@codemirror/commands`) so
that `history()` cannot merge it with the change before or after it. One
activation is one undo step: `Ctrl/Cmd+Z` immediately after it restores the
document and the selection that existed immediately before it — including the
selected text when the insertion replaced a selection. Three activations inside
history's 500 ms `newGroupDelay` are three undo steps, in reverse order.
Without the annotation `userEvent: 'input.type'` would coalesce them into one,
so FR-1601's user event and this annotation must travel together.

**FR-1604 — Every activation path is identical (Must)**

Pointer activation, `Enter` and `Space` on the focused button produce the same
insertion, the same caret, the same feedback and the same undo granularity.
There is no modifier that changes the outcome: the pane has exactly one
activation behaviour.

**FR-1605 — The insertion target (Must)**

The target is the most recently focused of exactly two elements: the editor's
content DOM and the stdin field (`#stdin-input`). Focus is tracked by
`src/main.ts`, never by the pane. Resolution rules:

- Before either has been focused, and whenever the last-focused target is not
  currently live, the target is the editor.
- The stdin field is a live target only while a read is pending — that is,
  while it is not inert (spec-01 FR-029 / FR-032). `stdinPending()` already
  focuses it, so a read in progress makes it the target without the visitor
  doing anything.
- The editor is a live target only while it is editable: no program running,
  an active workspace file, and that file editable UTF-8 text.
- Focusing anything else — a toolbar control, a symbol button, the console,
  the file-name input — does not change the target.

**FR-1606 — Insert into the stdin field (Must)**

A live activation whose target is the stdin field inserts `value` at that
field's `selectionStart`–`selectionEnd` via `setRangeText(value, start, end,
'end')`, leaving the caret after the inserted text and the field's scroll
position sane. Focus is not moved: the field keeps its selection offsets while
unfocused, which is what lets several characters be inserted in a row from the
pane. `submitStdin()` reads `#stdin-input.value` directly, so no synthetic
`input` event is required; none is dispatched. The pane never writes to the
console, the file-name input, or any other control.

**FR-1607 — Inert whenever there is no live target (Must)**

When FR-1605 resolves no live target, every character button is marked inert
with `setInert()` from `src/controls.ts`: `aria-disabled="true"`, `tabindex`
untouched (the roving model of FR-309 owns it), never the HTML `disabled`
attribute. Every activation path is guarded by `isInert()` and no-ops: no
transaction, no `setRangeText`, no autosave, no lint, no `Inserted V`. The
states that produce no live target are: a running program with no pending read;
a binary active file; no active file at all. Gaining a live target — Stop, a
pending read, selecting a `.py` file — clears inertness on every button. The
`Symbols` toggle itself is never inert (spec-03 DOM contract), so the pane can
still be opened, navigated and closed in every state, which is what keeps
spec-03 FR-310 true.

**FR-1608 — The target is visible (Must)**

While the pane is open and holds focus (`#symbol-pane:focus-within`), the
resolved target carries `data-insert-target` and renders a visible outline, so
the visitor can see where the next character will land before activating
anything. For the editor this also means its caret is rendered at the current
selection although focus is in the pane. This is presentation only: no
transaction, no `focus()` call, no change to `document.activeElement`, and
never two targets outlined at once.

**FR-1609 — Insertion feedback (Must)**

A successful insertion sets `#symbol-status`'s text to
`formatSymbolInserted(value)` (`Inserted V`) and `data-state="inserted"` on the
activated button for `COPIED_MS` (2 000 ms, the constant shared with **Copy
code** and **Copy output**). A further insertion inside that window replaces
the text, moves the state to the new button and restarts the timer.
`clearFeedback()` remains the single writer of that state and is still called
by `close()`, so closing the pane leaves nothing behind. The announcement
survives the removal of the clipboard because it is the only confirmation of
*which* glyph landed for a visitor who cannot see the target — the glyphs are
one or two characters, several of them differ by one pixel at small sizes, and
the insertion point may be off-screen.

**FR-1610 — The pane keeps focus and stays open (Must)**

An insertion does not move focus: the activated button keeps it, the pane stays
open, scrolled and navigable, and the roving `tabindex` of FR-309 is updated
only by the activation itself (the activated button becomes the single
`tabindex="0"`), never by the insertion. The pane does not focus the editor or
the stdin field, does not close itself, and adds no focus-loss, outside-click
or pointer listener — spec-03 FR-318's two dismissal paths (the toggle and
`Escape`) are still the only ones. The `focusin` listener of FR-1605 lives in
`src/main.ts`, not in `src/symbol-pane.ts`, and dismisses nothing.

**FR-1611 — Autosave and lint follow the edit (Must)**

Because FR-1601's transaction is an ordinary document change, the editor's
existing `updateListener` carries it into the workspace (`workspace.put` on the
active file), the debounced autosave of FR-002 (`pyplay.workspace.v1`, 500 ms)
and the lint schedule of FR-035. The pane calls none of those directly and adds
no second path to any of them. A `Run` immediately after an insertion executes
the inserted text (spec-01 FR-050's synchronous flush is unchanged). Stdin
insertions persist nothing: the field has never been autosaved.

**FR-1612 — The character set is unchanged (Must)**

The 29 rows, their `value`, `glyph`, `name` and group, and the five headings,
are exactly spec-03's *Character set* table. BR-302 (Python 3 tokens only; no
look-alikes) is unchanged and still grepped for by VC-325.

## Business Rules

**BR-1601 — Insert-at-caret, through one injected callback (supersedes BR-301)**

The pane's effects are now: one insertion per live activation, its own
feedback, and its own open/closed state. `SymbolPane` still holds **no
`EditorView` reference and imports nothing from `@codemirror/*`**; it receives
an `onInsert(value: string): void` callback from `src/main.ts`, which owns
target resolution and the mutation itself. The editor transaction is therefore
testable without the pane, the pane is testable without an editor, and the
pane's narrow dismissal surface (FR-318) survives by construction rather than
by enumeration.

**BR-1602 — One transaction, one isolated undo entry**

Change and selection travel in the same `view.dispatch` call — dispatching the
selection separately would produce a second history event — and that call
carries `isolateHistory`. `userEvent: 'input.type'` keeps the edit
indistinguishable from typing for every *downstream observer* (autosave, lint,
the update listener); `isolateHistory` is what stops history itself from
treating it as typing and coalescing it. Neither is optional: FR-1611 needs the
first, FR-1603 needs the second.

**BR-1603 — Reuse, don't invent**

`setInert` / `isInert` from `src/controls.ts`, `COPIED_MS` and the pane's
existing `role="status"` region are the inertness and feedback mechanisms. The
pane gains no new timer constant, no new notice channel and no `disabled`
attribute. `writeClipboard` is no longer called by this module;
`src/clipboard.ts` itself is unchanged and still serves **Copy code** and
**Copy output**.

**BR-1604 — One owner of the lock and the target**

`syncControls()` in `src/main.ts` is the only place that decides whether a live
target exists, and the only caller of `symbolPane.setLocked(...)`. It already
owns Run, Stop, Format, Reset, the editor's read-only state and the stdin
field's inertness, so the pane's inertness is derived from the same pass and
cannot drift from them. The pane does not observe `running`, does not listen to
the worker protocol, and exposes no predicate of its own for main to query.

**BR-1605 — Parent amendments**

- **spec-03** *What it does*: "Activating a button copies exactly that row's
  `value` to the clipboard … and leaves the editor buffer, caret and undo
  history unchanged" becomes FR-1601; the `Copied V` and clipboard-denial
  bullets are struck; "Enter/Space on the focused button copies" becomes
  "inserts". FR-310's bullet keeps its meaning — opening, navigating and
  closing the pane never interrupts a run, never injects a character into
  stdin *by itself* — amended by FR-1606, under which the visitor may now
  deliberately insert into a pending read.
- **spec-03** *Known limits*: **A-303** is discharged — insert-at-caret removes
  the dependency on an on-screen keyboard's paste affordance.
- **spec-01**: no change. The editor, autosave, lint, worker protocol, stdin
  channel, service worker and deployment shape are untouched; the pane now
  enters the same paths typed input already does. FR-029 / FR-032 are unchanged:
  the stdin field still accepts text only while a read is pending, and FR-1607
  makes the pane inert in exactly the states where the field is `readonly`.
- **spec-15 (copy-output)** and **Copy code**: unchanged.

## Non-Functional Requirements

**NFR-1601 — Latency**

Activation-to-inserted-character ≤ 100 ms at the 5 000-character program size
spec-01 budgets for, and no new main-thread task longer than 100 ms (spec-01
NFR-009). Insertion is synchronous — there is no promise to await, which is one
fewer failure mode than the clipboard path it replaces.

**NFR-1602 — Budget**

No new runtime asset, no new request, no new precache URL and no new storage
key. The change is expected to *reduce* the pane's share of the payload (the
clipboard-denial path and its string are removed); it must not increase the
app's gzipped payload by more than 1 KB, measured by the existing
`npm run audit:perf` gate (VC-323 / VC-326), which is what discharges this
requirement. Spec-03 NFR-305's immutable 2.18 KiB ship measurement is a
historical record and is not re-measured.

**NFR-1603 — Presentation**

Hit areas stay ≥ 32 × 32 px; glyph, heading and `Inserted V` text ≥ 4.5:1 and
pane non-text (borders, focus ring, `data-state="inserted"`, the
`data-insert-target` outline, pane edge) ≥ 3:1 in both palettes; the visible
focus ring is unchanged; at 375 × 667 with the pane open the page still does
not scroll sideways (NFR-301 – NFR-303).

**NFR-1604 — Browsers**

Every Must requirement holds on the pinned matrix of spec-03 NFR-306. Unlike
the clipboard path, insertion needs no permission, no secure-context capability
and no engine-specific read observation, so the matrix subset (VC-324) verifies
the same behaviour on every engine.

## Public interfaces / data

### User-visible strings

Live in `src/format.ts`, quoted verbatim from this spec.

| Constant | Value | Status |
|---|---|---|
| `formatSymbolInserted(value)` | `Inserted ${value}` — e.g. `Inserted **` | **New** (FR-1609) |
| `COPIED_MS` | `2000` | Existing, shared, unchanged |
| `SYMBOLS_LABEL` | `Symbols` | Existing, unchanged |
| `formatSymbolCopied(value)` | `Copied ${value}` | **Removed** with FR-307 |
| `SYMBOL_COPY_FAILED` | `Couldn't copy — select the character and press Ctrl/Cmd+C` | **Removed** with FR-308 |

`SYMBOLS` and `SYMBOL_GROUPS` in `src/symbols.ts` are unchanged; spec-03's
*Character set* table remains the normative source of all three fields.

### DOM contract

Deltas to spec-03's table; everything not listed is unchanged.

| Element | Id | Contract |
|---|---|---|
| Character button | — | `<button type="button" class="symbol" data-value="<value>" aria-label="<name>" title="<name>" tabindex="0\|-1">`. Gains `aria-disabled="true\|false"` (FR-1607) and `data-state="inserted"` during the FR-1609 window. Never `disabled`. |
| Feedback region | `symbol-status` | `role="status"`, unchanged element; now carries `formatSymbolInserted(value)` only. |
| Notice strip | `notices` | No longer written to by the pane. |
| Editor content | — | Carries `data-insert-target` while it is the resolved target and the pane holds focus (FR-1608); renders its caret in that state. CSS only. |
| Stdin field | `stdin-input` | Unchanged markup. Carries `data-insert-target` on the same terms. Its `value` is mutated by FR-1606 only while it is live. |

### Modules

- `src/symbol-pane.ts` — `SymbolPaneElements` gains `onInsert(value): void`;
  the class exposes `setLocked(locked: boolean)` for `syncControls()`.
  `writeClipboard`, `SYMBOL_COPY_FAILED`, `formatSymbolCopied`,
  `selectGlyph()`, the `activationId` guard and the `notices` dependency are
  removed. No `@codemirror/*` import is added, and no predicate is exposed for
  `main.ts` to query (BR-1604).
- `src/main.ts` — tracks the last-focused target with one `focusin` listener,
  resolves FR-1605, owns `insertAtCaret` for both targets, and calls
  `symbolPane.setLocked(...)` from `syncControls()` alongside the existing
  `setInert` calls.
- `src/editor.ts` — hosts the editor half of the insertion (it already owns
  every other `EditorView` helper: `setDoc`, `selectAll`, `revealPosition`).
- `src/format.ts` — the string table above.
- `src/styles.css` — `data-state="inserted"`, the `data-insert-target` outline
  and the caret rule. `.symbol`'s `user-select: text` Firefox workaround is
  removed with FR-308's selection fallback.
- `src/symbols.ts`, `src/clipboard.ts`, `src/controls.ts`, `src/notices.ts`,
  `src/protocol.ts`, `src/runtime.ts`, `src/worker/`, `src/stdin-*.ts`,
  `src/lint/`, `src/autosave.ts`, `src/workspace.ts`, `src/storage.ts`,
  `scripts/` — unchanged.

### Persisted state

Unchanged: still `pyplay.workspace.v1`, `pyplay.layout.v2`, `pyplay.theme.v1`
plus the one Cache Storage bucket. The pane still writes no storage key of its
own (BR-304, FR-312); inserted characters reach `pyplay.workspace.v1` only
through the editor's existing autosave path (FR-1611).

## Verification Criteria

| ID | Covers | Criterion |
|---|---|---|
| **VC-1601** | FR-1601, FR-1612 | With the caret at a known offset, activating each of the 29 buttons in turn inserts exactly that row's `value` at that offset and leaves the caret immediately after it. The document equals the concatenation of the 29 values; no other text changed. |
| **VC-1602** | FR-1601 | With `print("x")` selected, activating `#` replaces the selection with exactly `#`, leaving a cursor after it. With two ranges selected, both are replaced and both carets land correctly. |
| **VC-1603** | FR-1602 | The pane's `(` inserts exactly `(` — not `()` — while *typing* `(` in the same editor still inserts `()` (spec-12 FR-1201). `...` inserts three characters, never U+2026. On a line `indentOnInput`'s Python rules match — a dangling `else` — the pane's `:` re-indents the line to exactly the same result as typing `:` there, and that re-indentation is still one undo step. |
| **VC-1604** | FR-1604 | For a pointer click, `Enter` and `Space` on the same focused button: identical resulting document, identical caret offset, identical `Inserted V` text. |
| **VC-1605** | FR-1603, BR-1602 | One activation then `Ctrl/Cmd+Z` restores the exact prior document *and* prior selection (both the collapsed-caret and replaced-selection cases). Three activations dispatched **within 500 ms** need exactly three undos, in reverse order. |
| **VC-1606** | FR-1607, BR-1604 | Each no-live-target state — program running with no pending read; binary active file; no active file — reports `aria-disabled="true"` on every button, no `disabled` attribute, still focusable; a forced pointer click and `Enter`/`Space` each change nothing (document, caret, undo depth, `#stdin-input.value`, `#symbol-status` all unchanged). Leaving each state makes the same activation insert. |
| **VC-1607** | FR-1605, FR-1606 | With a program blocked on `input()`, the stdin field is the target: activating `_` puts `_` at the field's caret, does not touch the editor document, does not move focus out of the pane, and the value the worker receives on submit contains it. Five activations in a row accumulate in field order. |
| **VC-1608** | FR-1605 | Target resolution: after focusing the editor and then a toolbar control, the target is still the editor; after a read begins, it is the stdin field; after the read is answered, it is the editor again; on a fresh load with nothing focused, it is the editor. |
| **VC-1609** | FR-1608, NFR-1603 | With focus on a character button, exactly one element carries `data-insert-target`, it is the resolved target, it is visibly outlined at ≥ 3:1 in both palettes, and the editor's caret is rendered when the editor is the target. Moving focus out of the pane removes the attribute. |
| **VC-1610** | FR-1611 | An editor insertion is present in `localStorage['pyplay.workspace.v1']` within the autosave window and after a reload, and produces a lint diagnostic for text that warrants one — identical to *typing* the same character, for autosave and lint specifically (FR-1602 governs the editing behaviour that differs). A stdin insertion writes no storage key. |
| **VC-1611** | FR-1609 | `Inserted (` appears within 100 ms and reverts after 2 000 ms; a second insertion inside the window replaces the text, moves `data-state="inserted"` and restarts the timer; closing the pane mid-window leaves the status region empty and no `data-state` behind. |
| **VC-1612** | FR-1610, FR-318, BR-1601 | After five consecutive insertions the pane is still open and scrolled, `document.activeElement` is still the last activated button, it is the pane's only `tabindex="0"`, and arrow keys still navigate. Clicking the editor, console or background, Tabbing out, and activating Run, Stop, Clear console, Copy output, Copy code, Format or Reset still leave the pane open. A grep of `src/symbol-pane.ts` finds no `blur`, `focusout`, `pointerdown`, `mousedown` or `document`-level listener, and no `@codemirror/` import. |
| **VC-1613** | FR-1606, BR-1603 | Across a full insertion cycle the clipboard is never written (a stubbed `navigator.clipboard` records zero calls, and the pane still works with `navigator.clipboard` deleted entirely) and `#notices` stays empty. With the stdin field idle (inert) and last focused, an activation inserts into the *editor* and leaves `#stdin-input.value` empty. |
| **VC-1614** | FR-1601, FR-311, NFR-1603 | VC-1601's core insertion is re-verified in the horizontal and vertical layouts and at 701 px and 699 px; hit areas remain ≥ 32 × 32 px and the 375 px page does not scroll sideways with the pane open. |
| **VC-1615** | NFR-1601 | A `longtask` observer records no task > 100 ms across 29 insertions, and activation-to-document-change is ≤ 100 ms. |
| **VC-1616** | BR-1605 | `specs/03-vertical-pane-frozen.md` contains no live BR-301, FR-306 – FR-308, FR-313, FR-316 or BR-303 clause without a pointer to this spec, and `src/format.ts` exports neither `formatSymbolCopied` nor `SYMBOL_COPY_FAILED`. |

### Existing criteria: re-run, rewritten, retired

- **Re-run unchanged** against a fresh build: VC-301 – VC-306, VC-313, VC-315,
  VC-317 – VC-322, VC-325, VC-326, VC-329 – VC-332, and spec-01's VC-050 –
  VC-052 traversal and layout criteria.
- **Rewritten**: VC-307 (*"the editor never moves"* → the editor moves exactly
  once per activation, for all 29 values), VC-308 (`**` pastes as two
  characters → `**` inserts as two characters in one undo step), VC-314
  (Enter/Space copy → insert, folded into VC-1604), VC-316 (a copy mid-run
  interrupts nothing → a mid-run activation is inert unless a read is pending,
  and interrupts nothing either way, folded into VC-1606 / VC-1607), VC-324
  (matrix subset swaps its copy assertions for insertion ones).
- **Retired** with their requirements: VC-309, VC-310, VC-311, VC-312,
  VC-327's clipboard leg, VC-328, VC-333.

`npm run test:unit` covers the insertion helpers (selection maths,
multi-character values, replaced selection, `setRangeText` offsets) without a
browser; the rest are e2e specs in `tests/e2e/symbols.spec.ts`, each named
after its VC. The `e2e-chromium` expected-count line in `CLAUDE.md` changes
with the suite and is updated in the same commit.

## Known limits

- **No native undo for a stdin insertion.** `setRangeText` is invisible to the
  browser's own undo stack, so `Ctrl/Cmd+Z` inside `#stdin-input` will not
  remove an inserted character. `document.execCommand('insertText')` would
  preserve it but requires the field to be focused, which would defeat
  FR-1610's insert-several-in-a-row behaviour. FR-1603's guarantee is
  editor-only, and the field is cleared after every submit.
- **The target is inferred state.** With focus parked on a symbol button,
  "where will this land" is answered by FR-1608's outline rather than by a
  caret the visitor is looking at. If usage shows the outline is missed,
  naming the target in the FR-1609 announcement is the next step, not a
  second confirmation step.
- **A palette insertion is not a typed insertion** (FR-1602). A visitor who
  inserts `(` from the pane and then types `)` ends with `()`; one who types
  `(` gets `()` and may then insert a second `)`. Both produce valid Python;
  neither is silently corrected. The divergence is bracket-pairing and
  completion only — `indentOnInput` treats the two paths identically, so an
  inserted `:` after a dangling `else` re-indents the line just as a typed one
  does.

## Documentation

Part of the change, not a follow-up:

- `specs/03-vertical-pane-frozen.md` — the *Supersedes BR-301* table is
  applied: BR-301, FR-306 – FR-308, FR-313, FR-316 and BR-303 are struck with a
  pointer to this spec; *Deliberately excluded* drops its insert-at-caret
  entry; A-303 is marked discharged. Checked by VC-1616.
- `docs/architecture.md` — *Special-character pane* → *It never touches the
  editor* is replaced by *It reaches the editor through one callback*: why the
  pane still holds no `EditorView`, why the change and selection travel in one
  dispatch, why that dispatch is history-isolated, and where the target and the
  lock are decided. The *One owner of the feedback state* section keeps its
  shape with the clipboard-specific paths removed.
- `README.md` — the Symbols line, if it mentions copying.

## Out of scope

- Matched-pair insertion, snippets and triple quotes (FR-1602 is the decision,
  not an omission). Suppressing the editor's existing `indentOnInput` for a
  pane insertion is equally out of scope: FR-1602 records the parity as
  intended.
- Any change to the 29-character set or to the five groups; new categories; a
  configurable, searchable or favourited set.
- A keyboard shortcut that inserts without visiting the pane.
- Inserting into the console, the file-name input or any control other than the
  two targets of FR-1605.
- Undo inside the stdin field; a second confirmation step before inserting.
- Keeping a copy path (modifier-activated or as a second control) — decided
  against, with the reasoning recorded under *Supersedes BR-301*.
- Remembering the pane's open state across reloads; any change to lint,
  format, execution, the worker protocol, the stdin channel, the service
  worker or the deployment shape.
