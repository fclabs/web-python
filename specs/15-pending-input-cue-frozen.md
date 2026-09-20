# Frozen: Pending-input cue when Output is hidden

Source: issue #44
Status: normative
Frozen: 2026-09-21
Parent: `specs/01-static-python-web-frozen.md`, `specs/13-output-pane-frozen.md`
Issue: https://github.com/fclabs/web-python/issues/44

This child spec uses the `15xx` identifier range.

## Purpose

A program blocked on `input()` can look frozen when the Output pane is hidden
or when focus is in the editor. The existing stdin field and Send EOF control
still work, but they live inside the Output stack. This spec adds a **waiting
cue outside that stack** and a keyboard-operable **Go to input** action that
reveals the existing Input row and focuses its textbox — only when the visitor
asks.

## What it does

- While a stdin read is pending (FR-029), `#stdin-cue` is shown in the status
  cluster (the existing status-bar row, outside console / stdin / diagnostics).
  Its text is `Waiting for input…` (`STDIN_WAITING_HINT`). The cue is visible
  with Output shown or hidden.
- `#btn-goto-input` inside the cue is named `Go to input`. Pointer, Enter and
  Space activate it. It is never HTML-`disabled`; it is absent from sequential
  focus while the cue is `hidden`.
- Activating Go to input reveals `#stdin-pane` if Output is hidden (FR-1303's
  Input-only exception, now visitor-initiated) and focuses `#stdin-input`.
  `aria-expanded` on `#btn-output` is unchanged. Console and Problems stay
  hidden. Editor selection and console contents are untouched.
- A `stdinRequest` enables the field and shows the cue. It does **not** focus
  the textbox and does **not** unhide Input. The editor keeps focus if it had
  it.
- Submitting a line, Send EOF, Stop, `done`, `error`, and every other existing
  `stdinIdle()` path hide the cue and, if Output is still hidden, hide Input
  again (focus inside Input moves to `#btn-output`, as today).
- Two successive `input()` calls each show the cue. After the first read ends,
  Input hides again if Output is hidden; the second read requires Go to input
  to reveal it.

## Intentional specification amendments

- **FR-029** enablement is unchanged (field + Send EOF leave `setInert` while a
  read is pending). The former “and focused” clause is withdrawn: focus moves
  to `#stdin-input` only via Go to input, a click in the field, Tab, or
  FR-062's continued `read()` / `read(n)` line (the visitor is already
  answering that read).
- **FR-1303** no longer auto-unhides `#stdin-pane` when a read begins, and no
  longer keeps Input visible merely because Output was hidden during a pending
  read. The Input-only exception (`#app[data-stdin="pending"]`, console and
  Problems stay hidden, idle re-hides Input) now applies **after** FR-1502.
- **VC-030** / **VC-1303** follow those amendments: the field is enabled
  without auto-focus; hidden Output + `input()` shows the cue, not Input.
- Issue #43 (execution status) is independent. If both ship, reuse
  `STDIN_WAITING_HINT` and do not add a second live announcement of the same
  waiting state.

## Functional Requirements

**FR-1501 — Waiting cue (Must)**

While a stdin read is pending, `#stdin-cue` is not `hidden` and is a child of
the status-bar cluster (the grid `status` row / stacked status band). It is
outside `#console-pane`, `#stdin-pane` and `#diagnostics-pane`. The cue text
is exactly `STDIN_WAITING_HINT`. The text is a polite, atomic `role="status"`.
When no read is pending the cue is `hidden`.

**FR-1502 — Go to input (Must)**

`#btn-goto-input` sits in `#stdin-cue`. Visible label and accessible name are
`GOTO_INPUT_LABEL` (`Go to input`). Activating it (pointer, Enter, Space)
reveals `#stdin-pane` if Output is hidden — setting `#app[data-stdin="pending"]`
and clearing `hidden` on Input only — then focuses `#stdin-input`. Console,
Problems, and both separators stay hidden. `#btn-output` `aria-expanded`
continues to mirror the hide/show preference, not the Input exception. The
control is never HTML-`disabled` and is never routed through `setInert()`;
`hidden` on the cue removes it from sequential focus.

**FR-1503 — No auto-focus, no auto-reveal (Must)**

On `stdinRequest` the field and Send EOF become non-inert (FR-029) and
FR-1501's cue is shown. The implementation does not call `focus()` on
`#stdin-input` and does not unhide `#stdin-pane` when Output is hidden. If
the editor held focus, it still does.

**FR-1504 — Idle clears the cue (Must)**

Every existing `stdinIdle()` path (line submission that completes a line
read, Send EOF, stdout, stderr, Stop, `done`, `error`) hides `#stdin-cue`,
clears `data-stdin`, and if Output is hidden sets `hidden` on `#stdin-pane`.
If focus was inside `#stdin-pane`, it moves to `#btn-output`.

**FR-1505 — Successive reads and preservation (Must)**

Two `input()` calls in one program each show the cue while that read is
pending. Revealing Input does not alter the editor document, caret, or
selection, and does not alter console contents. After the first read ends,
a hidden Output pane hides Input again; the second read's Go to input reveals
it once more.

**FR-1506 — Strings (Must)**

`GOTO_INPUT_LABEL` lives in `src/format.ts` and is quoted verbatim. The cue
reuses `STDIN_WAITING_HINT`. No new `localStorage` key.

## Non-functional

**NFR-1501** At 375 × 667, with the cue showing (Output shown and hidden),
`scrollWidth` ≤ 375; toolbar, status cluster, cue, Go to input, editor, and
(when shown) Input are unclipped.

**NFR-1502** Cue text ≥ 4.5:1; Go to input label ≥ 4.5:1; control border and
focus ring ≥ 3:1; both palettes.

**NFR-1503** `#btn-goto-input` hit area ≥ 32 × 32 CSS px.

**NFR-1504** No new network request; no change to the stdin channel, worker
protocol, precache URL count, or existing latency budgets.

## User-visible strings

Live in `src/format.ts`, quoted verbatim:

| Constant | Value |
|---|---|
| `STDIN_WAITING_HINT` (existing) | `Waiting for input…` |
| `GOTO_INPUT_LABEL` | `Go to input` |

### DOM contract

| Element | Id | Contract |
|---|---|---|
| Status cluster | — | Existing status-bar chrome; grid area `status`. Contains `#status-bar` and `#stdin-cue`. |
| Status live region | `status-bar` | Unchanged FR-065 text. `pointer-events: none`; not a tab stop. |
| Waiting cue | `stdin-cue` | Child of the status cluster. `hidden` iff no read is pending. |
| Cue text | `stdin-cue-text` | `role="status"`; text `STDIN_WAITING_HINT`. |
| Go to input | `btn-goto-input` | `<button type="button">` inside the cue. Label `GOTO_INPUT_LABEL`. |
| App root | `app` | `data-stdin="pending"` only while FR-1502 has revealed Input and Output is hidden. |

## Verification Criteria

| ID | Covers | Criterion |
|---|---|---|
| **VC-1501** | FR-1501, FR-1506 | `input()` shows the cue with Output shown and with Output hidden; text is `Waiting for input…`; idle hides the cue. |
| **VC-1502** | FR-1502, FR-1303 | Hidden Output + `input()` leaves Input hidden; pointer and keyboard on Go to input reveal only Input (and Send EOF), focus the textbox, leave `aria-expanded="false"`; console and Problems stay hidden. |
| **VC-1503** | FR-1503, FR-029 | Editor focused → `input()` keeps editor focus; Input stays hidden while Output is hidden. |
| **VC-1504** | FR-1504 | Line submit, Send EOF, Stop, and an exception each hide the cue; hidden Output re-hides Input. |
| **VC-1505** | FR-1505 | Two `input()` calls; Go to input on each; editor selection and console text (apart from the prompt / echo of those reads) are preserved across reveal. |
| **VC-1506** | NFR-1501 – NFR-1503 | 375 × 667 unclipped with the cue showing; button ≥ 32 × 32; Tab from the toolbar reaches Go to input while pending. Contrast sampled in both palettes. |

## Deliberately excluded

- A tabbed bottom panel, a replacement console, or auto-showing the whole
  Output pane.
- Stdin transport / worker protocol changes.
- A new auto-focus policy (other than withdrawing FR-029's auto-focus).
- Issue #43's execution-status view.
- A keyboard shortcut other than activating `#btn-goto-input`.
