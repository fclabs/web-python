# Frozen: Copy output from the console

Source: issue #46
Status: normative
Frozen: 2026-09-20
Parent: `specs/01-static-python-web-frozen.md`, `specs/03-vertical-pane-frozen.md`, `specs/13-output-pane-frozen.md`, `specs/14-toolbar-grouping-frozen.md`
Issue: https://github.com/fclabs/web-python/issues/46

This child spec uses the `15xx` identifier range.

## Purpose

Visitors can copy source with **Copy code**, but sharing a traceback or a
program's printed output still means dragging across the console and hoping
the selection did not pick up the heading or a control label. This spec adds a
labelled **Copy output** control local to the console. It writes the current
transcript as plain text, using the same clipboard-feedback conventions as
Copy code.

## What it does

- `#btn-copy-output` sits in the Console heading immediately after
  `#btn-clear`. Visible label, tooltip, and accessible name are `Copy output`.
  Decorative copy/check icons match Copy code. Hit target ≥ 32 × 32 px.
- Activation (pointer, Enter, Space) copies `#console`'s current `textContent`
  as plain text: run separators, ready line, stdout, `[stderr] ` prefixes,
  prompts, echoed input, tracebacks, termination notices, and truncation
  markers. Pane chrome (heading, control labels) is not included.
- Success paints `Copied` on the control for `COPIED_MS` (2 000 ms) and
  `data-state="copied"` (checkmark). A further success inside that window
  restarts the timer. The console is not cleared; the editor document, caret,
  and undo stack are not touched.
- A rejected clipboard write (permission, insecure context, missing API)
  shows `Couldn't copy — select the output and press Ctrl/Cmd+C` in `#notices`,
  selects the console transcript so Ctrl/Cmd+C can retry, and never shows
  `Copied`.
- An empty transcript (`#console` would show nothing) marks the control
  inert via `setInert()` — `aria-disabled="true"`, still `tabindex="0"`, never
  the HTML `disabled` attribute. Every activation path is a no-op: no
  clipboard write, no `Copied`, no notice.
- Hidden Output hides the control with the console panel (FR-1302 / FR-1405).
  Copy code remains available. Copy output does not introduce a shortcut,
  file export, sharing service, per-run output model, or permission preflight.

## Functional Requirements

**FR-1501 — Copy output control (Must)**

`#btn-copy-output` is a `<button type="button">` in the Console heading's
action cluster, immediately after `#btn-clear` and before `#console`. Its
visible label, `title`, and accessible name are `COPY_OUTPUT_LABEL`
(`Copy output`). Icons are `aria-hidden`. The control is sequential-focus
reachable (`tabindex="0"`) even while inert. It is never natively `disabled`.

**FR-1502 — Copy the displayed transcript (Must)**

A live activation writes the console's current displayed text — the same
string `#console.textContent` would report after pending paints flush — to
the system clipboard as plain text via `writeClipboard`. Line breaks and
non-ASCII characters are preserved byte-for-byte. The payload includes every
retained run (FR-018 separators, FR-013 ready line, stdout, stderr prefixes,
prompts, echoed input, FR-021 tracebacks, FR-022 / FR-023 notices, FR-027 /
FR-056 truncation markers) and excludes the heading, `#btn-clear`,
`#btn-copy-output`, and other pane chrome.

**FR-1503 — Success feedback (Must)**

A successful write sets the control's label and `title` to `COPIED_LABEL`
(`Copied`) and `data-state="copied"` for `COPIED_MS` (shared with Copy code
and the special-character pane). The check icon is visible and the copy icon
is not. When the timer fires, the resting label and icons are restored. A
success while the timer is running replaces the window (timer restarts). No
notice is shown on success.

**FR-1504 — Rejected write (Must)**

When `writeClipboard` returns false, the control does not enter the copied
state and any pending revert timer is left alone or cancelled without
painting `Copied`. `COPY_OUTPUT_FAILED` is shown once in the existing notice
strip (`Couldn't copy — select the output and press Ctrl/Cmd+C`). The
displayed transcript is selected so the visitor can press Ctrl/Cmd+C. The
notice is non-modal. The console buffer is unchanged.

**FR-1505 — Empty transcript is inert (Must)**

While the retained transcript is empty, `#btn-copy-output` is `setInert()`.
Click, Enter, and Space are no-ops: they must not call `writeClipboard`,
must not show `Copied`, and must not show `COPY_OUTPUT_FAILED`. Becoming
empty (Clear console, or a load that has not yet written the ready line)
restores the resting label and clears `data-state`. The first retained
character (ready line, run separator, or any stream) clears inertness. No
activation path may bypass `isInert()`.

**FR-1506 — No side effects (Must)**

Copy output never clears the console, never mutates the editor document,
caret, undo stack, or `EditorView` identity, never issues a network request,
never writes storage, and never changes layout, theme, run state, or the
worker. A successful copy does not move focus into the editor or select
editor contents. A rejected copy selects the transcript (FR-1504) without
changing the editor document.

**FR-1507 — Traversal and hidden Output (Must)**

After the optional Symbols pane, sequential focus reaches Clear console,
Copy output, the console resizer when visible, Copy code, Format, then the
editor and the existing subsequent controls. Hidden Output hides Copy output
with `#console-pane` (FR-1302). No positive `tabindex` and no
layout-dependent re-parenting. This amends FR-1405: Clear is no longer the
only Console action.

## Business Rules

**BR-1501 — Reuse, don't invent**

`writeClipboard` from `src/clipboard.ts`, `COPIED_MS` / `COPIED_LABEL` from
`src/format.ts`, and `setInert` / `isInert` from `src/controls.ts` are the
clipboard and inertness mechanisms. Copy output does not add a parallel
clipboard helper, a new feedback timer constant, or a `disabled` attribute.

**BR-1502 — The console model is the source of truth**

The copied string is the retained transcript the console already shows, not a
second buffer and not `innerText` (which would collapse whitespace). Flush
any pending paint before reading, so the clipboard matches what is on screen.

**BR-1503 — Local to the console**

Copy output lives in the Console heading, next to Clear. It is not a toolbar
control. Reset stays global. Copy code stays in the editor heading.

**BR-1504 — Parent amendments**

- spec-01 Copy code remains editor-only; this child owns console copy.
- spec-03 *What it does* ("activating … Clear console, Copy code, Format or
  Reset leave it open"): Copy output is the same class of chrome action —
  activating it leaves the special-character pane open, scrolled, and
  navigable.
- spec-13 "Clear console and Copy code still work" while Output is hidden:
  Copy code still does; Copy output is hidden with the console (FR-1507).
- spec-14 FR-1405 / VC-1403: tab order inserts `#btn-copy-output` immediately
  after `#btn-clear`; hidden Output hides both Console actions.

## Non-Functional Requirements

**NFR-1501 — Existing contracts**

Control-inertness (FR-049 / FR-054), offline, COI degradation, and the
parent performance budgets are unchanged. Copy output adds no precache URL
and no storage key. A user-gesture copy of the retained 5 000-line cap must
not introduce a main-thread task longer than 100 ms (NFR-009).

**NFR-1502 — Hit target and contrast**

`#btn-copy-output` hit area ≥ 32 × 32 px. Resting label/icon contrast ≥ 4.5:1
(text) / 3:1 (non-text) in both palettes. Visible focus ring. At 375 × 667
the control is unclipped and the page does not scroll sideways.

## Public interfaces / data

### User-visible strings

Live in `src/format.ts`, quoted verbatim:

| Constant | Value |
|---|---|
| `COPY_OUTPUT_LABEL` | `Copy output` |
| `COPIED_LABEL` | `Copied` (existing; FR-1503) |
| `COPY_OUTPUT_FAILED` | `Couldn't copy — select the output and press Ctrl/Cmd+C` |
| `COPIED_MS` | `2000` (existing; shared) |

### DOM contract

| Element | Id | Contract |
|---|---|---|
| Copy output | `btn-copy-output` | In the Console heading after `#btn-clear`. Label `COPY_OUTPUT_LABEL`. `tabindex="0"`. Inert via `aria-disabled` when the transcript is empty. |
| Console | `console` | Existing transcript host. Inner text is the copy payload. |
| Console heading actions | — | `#btn-clear` then `#btn-copy-output` in document order, inside `.panel-actions`. |

### Modules

- `src/format.ts` owns the new strings.
- `src/console.ts` exposes whether the transcript is empty and can select it.
- `src/main.ts` wires the control, inertness, clipboard write, and feedback.
- `src/clipboard.ts` and `src/controls.ts` are unchanged.

## Verification Criteria

| ID | Covers | Criterion |
|---|---|---|
| **VC-1501** | FR-1502 | After two runs, one of them a traceback, the clipboard equals `#console` `textContent` (run headers, both bodies, traceback, notices) and contains neither `Copy output` nor `Clear console`. |
| **VC-1502** | FR-1502 | Line breaks and non-ASCII Python output (`café`, `你好`) appear on the clipboard exactly as displayed. |
| **VC-1503** | FR-1503, FR-1506 | Success shows `Copied` and the check icon, reverts after 2 s, leaves the console text and editor document unchanged, and does not select editor contents. |
| **VC-1504** | FR-1504 | A stubbed clipboard rejection shows `COPY_OUTPUT_FAILED` once, never `Copied`, selects the transcript, leaves the editor document unchanged, and raises no page error. |
| **VC-1505** | FR-1505 | Empty console: `aria-disabled="true"`, no `disabled` attribute, still focusable; pointer (forced) and Enter/Space write nothing, show no `Copied`, and show no notice. A ready line or a run enables the control. |
| **VC-1506** | FR-1501, FR-1507, NFR-1502 | Control is after Clear in the Console heading; Enter copies while live; Tab order is Clear → Copy output → (console resizer when visible) → Copy code; hidden Output hides Copy output; hit area ≥ 32 × 32 px. |

Stub clipboard success and rejection for VC-1501 – VC-1505; VC-1503 / VC-1506
also exercise the real clipboard and keyboard activation against a fresh
build.

## Deliberately excluded

- File export, sharing services, per-run output models, clipboard-permission
  preflight.
- A keyboard shortcut for Copy output.
- Copying a visitor-made partial selection (the control always copies the
  full retained transcript).
- Changing Copy code, Clear console, or the console retention caps.
