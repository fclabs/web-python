# Iteration 5 — amending the specs and shipping the documentation

No production code changed. This iteration is spec text, shipped
documentation and artifacts only.

## 1. What changed

### `specs/03-vertical-pane-frozen.md`

Every clause the frozen spec-16 retires is struck in place and carries a
pointer to `specs/16-insert-at-caret-frozen.md`; nothing was deleted, so the
record of what the pane used to do survives. The plan named seven headline
clauses; the reconciliation touched thirteen places, because the retired
requirements are cited well outside their own clauses:

| Where | What it said | Now |
|---|---|---|
| Header | — | `Amended by: specs/16-insert-at-caret-frozen.md` |
| *Purpose* | clicking copies to the clipboard | inserts at the caret of the last-used text target |
| *What it does* | FR-306, FR-307, FR-308, FR-316 bullets | struck, each with the superseding requirement named |
| *What it does* | "Enter/Space … copies" | "inserts" (FR-1604) |
| *What it does* | FR-310's bullet | kept, amended by FR-1606: the pane injects nothing into stdin *by itself*, but the visitor may now insert into a pending read |
| *Character set* preamble | "`value` is what FR-306 puts on the clipboard" | what FR-1601 inserts at the caret |
| *User-visible strings* | `formatSymbolCopied`, `SYMBOL_COPY_FAILED` rows | struck; `formatSymbolInserted` named as the successor |
| *User-visible strings* | the FR-307 revert window | FR-1609's, same `COPIED_MS` |
| *DOM contract* | feedback region "carries the FR-307 text" | FR-1609's `Inserted V` |
| *DOM contract* | notice strip "reused for FR-308" | struck — the pane no longer writes there |
| *Reused interfaces* | `writeClipboard`, `Notices.show` | struck; `src/clipboard.ts` itself unchanged and still serving Copy code / Copy output |
| *Key decisions* | BR-301, BR-303, the Firefox `user-select: text` rationale | struck (the CSS was removed with the selection fallback) |
| *Known limits* | NFR-306's Chromium-only clipboard-read note | struck — every engine now verifies the same way |
| *Known limits* | "A-303 is still outstanding" | **A-303 is discharged**, with the reason |
| *Deliberately excluded* | "Insert-at-caret … requires the editor mutation BR-301 forbids" | insert-at-caret removed from the exclusion; matched pairs, snippets and triple quotes stay excluded |

### `specs/16-insert-at-caret-frozen.md`

`git mv` from `16-insert-at-caret.md`, so the history follows the file. Status
flipped from DRAFT to SHIPPED with a freeze date. Four text amendments:

- **Modules** gains the `src/insert.ts` row and the reason the field helper is
  neither in `src/editor.ts` nor in `src/main.ts`.
- **FR-1607** enumerates a fourth no-live-target state (below).
- **FR-1606** no longer claims the field itself retains its selection offsets
  while unfocused.
- **Existing criteria** moves VC-317 from *re-run unchanged* to *rewritten*.

spec-01, spec-12 and spec-15 are **unchanged**, as the frozen spec says they
are: the pane enters the same editor, autosave and lint paths typed input
already used; the stdin field still accepts text only while a read is pending;
`closeBrackets()` and both Copy actions are untouched.

### Shipped documentation

- `docs/architecture.md` — *It never touches the editor* is replaced by
  *It reaches the editor through one callback*, and *One owner of the feedback
  state* keeps its shape with the clipboard paths removed. The new section
  covers the injected `onInsert` callback, the two owners in `src/main.ts`
  (`resolveInsertTarget()` and `syncControls()`), why change and selection ride
  in one dispatch, why that dispatch needs both `userEvent: 'input.type'` and
  `isolateHistory`, the preceding unfold dispatch, the `indentOnInput` parity,
  the two operational limits, and the Chromium selection note.
- `README.md` — the intro line and the *Special characters* row describe
  insertion at the caret. The keyboard table and the roving-focus note were
  checked and are still accurate.
- `docs/ci.md` — the expected counts agree in both places
  (`342 passed, 5 skipped` on the runner, `339 passed, 6 failed, 2 skipped` on
  macOS); one heading still said "the five that only fail locally" above a
  table of six and was corrected. No job and no gate was added: `pr.yml` still
  defines exactly `pr-title`, `typecheck`, `unit`, `e2e-chromium`,
  `audit-contrast`, `audit-perf`, `artifact`.
- No shipped document references the plan, the artifact directory, an
  iteration number or the build order.

## 2. The D-07 resolution

FR-1607's enumeration is amended; `resolveInsertTarget()` is not. A second
fallback to the stdin field was rejected: FR-1605 states one resolution rule,
and a second one would silently redirect the next character away from the
element the visitor last touched. The clause now lists four no-live-target
states — a running program with no pending read; a binary active file; no
active file; and a running program with a read pending whose last-focused
target is the editor — and records the rejected alternative in place, so the
frozen spec matches the shipped build. `DECISIONS.md` **D-13**.

## 3. Every decision, and where it landed

| Entry | Disposition |
|---|---|
| D-01 `src/insert.ts` | Reflected — the frozen spec's *Modules* table and `docs/architecture.md` both say why the field helper is its own import-free module. |
| D-02 unfold in a preceding transaction | Reflected — `docs/architecture.md` explains why it cannot ride in the insertion. |
| D-03 `isolateHistory.of('full')` | Internal — the *why both annotations* paragraph covers the requirement; the argument value is an implementation detail of one call. |
| D-04 `allowMultipleSelections` in the unit test | Internal — a test-local facet, no production behaviour. |
| D-05 `indentOnInput` parity | Reflected — the frozen FR-1602 (already amended in Iteration 2) and a paragraph in `docs/architecture.md`. |
| D-06 `syncControls()` re-run on focus and on the read state | Reflected — `docs/architecture.md` says why the lock would otherwise go stale. |
| D-07 FR-1605 / FR-1607 divergence | Resolved this iteration in the spec text; see §2 and D-13. |
| D-08 remembered stdin caret | Reflected — the engine note in `docs/architecture.md` and the amended FR-1606. |
| D-09 VC-317 inverted | Reflected in the spec's *Existing criteria* list; the test itself is internal to the suite. |
| D-10 VC-320 measures what the pane persists | Internal — a criterion's wording; the user-visible rule ("the pane writes no storage of its own") is unchanged and already documented. |
| D-11 both outlines in the contrast gate | Internal — test coverage of an already-documented surface. |
| D-12 the six local failures | Internal to the repo's CI notes, and already recorded in `docs/ci.md`. |
| D-13 D-07 resolved | Reflected — the amended FR-1607. |
| D-14 FR-1606 and VC-317 text | Reflected — the amended spec text. |

## 4. Gate

Run from the worktree with `PW_PORT_BASE=4273`; results in §5 of the handoff
report. `npm ci`, `npm run build` and `npm run preview` were all exercised, so
the README's getting-started path is known to work on a clean install.

The six local chromium failures and `audit:perf`'s VC-814 are the pre-existing
environmental set of **D-12** — five `Control+m` / `Shift-Alt-m` macOS
keybinding divergences plus a stale spec-08 size budget. No threshold was moved
and no assertion was skipped.

## 5. Deviations from the plan

1. The plan's architecture bullet asked for "no auto-close, no re-indent" among
   the operational limits. Re-indentation **is** intended parity since the
   Iteration 2 amendment (D-05), so the limit is written as "no auto-close, no
   completion — though it *is* re-indented".
2. The plan's spec-16 scope named only the *Modules* amendment and the status
   flip. Two further sentences the artifacts had already found to be false
   (D-08's FR-1606 premise, D-09's placement of VC-317) were corrected in the
   same pass rather than frozen wrong; `DECISIONS.md` **D-14**.
3. `docs/ci.md` needed one heading corrected ("five" → "six") for the figures
   to be consistent with the table beneath them.
