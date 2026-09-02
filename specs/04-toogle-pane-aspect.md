# Spec 04 — Horizontal / Vertical Pane Layout

| Field | Value |
|---|---|
| Version | 1.2.0 |
| Last Updated | 2026-09-02 |
| Status | **SHIPPED** — see *Amendments applied during implementation* (7 of them) |
| Owner | Federico Castañeda |
| Parent spec | `specs/01-static-python-web-frozen.md` (SHIPPED) |
| Source issue | [fclabs/web-python#2](https://github.com/fclabs/web-python/issues/2) — *Allow user to choose horizontal or vertical pane layout* |

This is a **child spec**. New requirements use the `4xx` range (FR-401–FR-426,
BR-401+, NFR-401+, VC-401+, A-401+). Requirements imported from the parent
keep the parent's identifiers (e.g. "per FR-047 from spec-01") and are never
renumbered.

> **What the two layout names mean.** Both name the orientation of the
> **divider** between the panels, the way `vim`'s `:split` / `:vsplit` do:
> **`horizontal`** separates them by horizontal rules and stacks them in one
> column (spec-01's shipped rendering, and the only layout below 900 px);
> **`vertical`** separates them by a vertical rule, editor beside console. The
> opposite convention is equally common — `tmux`'s `split-window -h` gives
> side-by-side panes — so this spec fixes the choice rather than claiming it is
> the only one. `src/layout.ts` carries the same contract in code and is
> normative for the implementation. See amendment 7.

> **Citation correction.** The source issue cites "NFR-009" for the 375 px
> requirement and "NFR-010 / NFR-013" for keyboard reachability. In spec-01 the
> 375 px requirement is **FR-047**, keyboard reachability with visible focus
> indicators is **FR-049**, the contrast requirements are **NFR-010** (text
> ≥ 4.5:1) and **NFR-013** (non-text ≥ 3:1), and **NFR-009** is main-thread
> responsiveness under heavy output. This spec cites the correct identifiers.

---

## Purpose

The playground stacks its four panels — console, editor, stdin, diagnostics —
top to bottom at every viewport width (`flex-direction: column` on `.app` in
`src/styles.css`). On a laptop or desktop that wastes most of the screen: the
editor and the console each get a short horizontal band, so a student reading a
traceback while editing the line that produced it has to scroll one of them
constantly. This spec adds a **toolbar control that switches the playground
between the current stacked layout and a two-column one**, and
remembers the choice on the visitor's own origin. The beneficiary is the
student on a wide screen; the student on a phone is protected by keeping
vertical the only layout below the width where two columns stop being usable.

---

## Scope

### In scope

- One new toolbar control — a two-option segmented control — that selects
  `Horizontal` or `Vertical`.
- A **`vertical` layout** (divided by a vertical rule): the editor in a
  full-height left column; the console, stdin and diagnostics panels stacked in
  a right column.
- The **`horizontal` layout** (divided by horizontal rules), pixel-identical to
  the layout shipped by spec-01.
- Persistence of the choice in one new `localStorage` key on this origin.
- The default layout for a visitor who has never chosen (width-dependent), and
  the rule that governs it while no choice is stored.
- The narrow-viewport override: below 900 px the effective layout is vertical
  regardless of what is stored, and the control says so.
- Preservation of every piece of session state — editor buffer, caret, undo
  history, console contents and scroll, diagnostics, pending stdin read,
  running program — across a layout switch.
- Keyboard operation of the control as a single tab stop with visible focus,
  and contrast of everything the control adds, in both palettes.
- The amendments this forces on parent verification criteria VC-050, VC-051,
  VC-052 and VC-071 (see *Parent-spec amendments*).

### Out of scope

- **A draggable splitter or any resize handle.** Column proportions are fixed
  by FR-409; the visitor cannot drag them. See *Deliberately excluded*.
- **Collapsing, hiding, detaching, reordering or maximising individual
  panels.** Both layouts always show all four panels.
- **Any third layout** — no grid-of-four, no editor-right mirror for RTL, no
  tabbed console/diagnostics.
- **Changing the `horizontal` layout.** Its panel order, sizing, `max-height: 25vh`
  diagnostics cap and flex ratios are exactly what spec-01 shipped (FR-407).
- **Changing the document order of the panels.** Both layouts render the same
  DOM in the same order (FR-410, BR-402).
- **Light/dark colour-mode selection** — that is
  [issue #3](https://github.com/fclabs/web-python/issues/3), a separate spec.
  This spec adds no palette token and changes no colour.
- **Syncing the preference across devices or browsers**, and any cookie,
  IndexedDB or session-storage use (BR-403).
- **Any change to execution, the worker protocol, the stdin channel, lint,
  format, the service worker or the deployment shape.** This spec adds no
  network request and no runtime asset (NFR-405).

---

## Actors

| Actor | Description | Permissions |
|---|---|---|
| **Visitor** | Anyone who opens the page — unchanged from spec-01. No login, no identity, no roles. | Everything spec-01 grants, plus: select either layout, and have that selection remembered on this origin. Cannot define a third layout, resize the columns, or reorder the panels. |
| **Running Program** | The visitor's Python code executing inside the Web Worker — unchanged from spec-01. | Unchanged. The layout is main-thread presentation only; the worker is never told the layout exists and never observes a switch (BR-401). |
| **Maintainer** | Whoever builds and deploys the static bundle — unchanged from spec-01. | Publishes assets. The breakpoint, the column proportions and the default rule are compile-time constants in the bundle, not deployment-time configuration. |

---

## Functional Requirements

Priority is MoSCoW: **M**ust, **S**hould, **C**ould.

### The control

| ID | P | Requirement |
|---|---|---|
| **FR-401** | M | **Given** the page has loaded, **when** the toolbar is rendered, **then** it contains, immediately after `#btn-reset`, a `role="radiogroup"` whose accessible name is exactly `Layout` and which contains exactly two `role="radio"` children with accessible names `Horizontal` and `Vertical`, in that order — `Horizontal` first, because it is the layout that is always available (BR-404), so `Home` reaches it. |
| **FR-402** | M | **Given** the control is rendered, **when** its state is inspected at any time, **then** exactly one radio has `aria-checked="true"` and it is the one naming the **effective** layout of FR-411 — never the stored preference when the two differ. |
| **FR-403** | M | **Given** the viewport is at least 900 px wide and the effective layout is `horizontal`, **when** the visitor activates the `Vertical` radio by pointer, `Enter` or `Space`, **then** `#app` carries `data-layout="vertical"`, the two-column geometry of FR-408 / FR-409 is rendered, `aria-checked` moves to `Vertical`, and the preference `vertical` is persisted per FR-414. |
| **FR-404** | M | **Given** the effective layout is `vertical`, **when** the visitor activates the `Horizontal` radio by pointer, `Enter` or `Space`, **then** `#app` carries `data-layout="horizontal"`, the stacked geometry of FR-407 is rendered, `aria-checked` moves to `Horizontal`, and the preference `horizontal` is persisted per FR-414. |
| **FR-405** | M | **Given** the control is reachable by keyboard, **when** the visitor navigates it, **then** the radiogroup is **one** tab stop; `ArrowRight` and `ArrowDown` move focus to the next radio and check it, `ArrowLeft` and `ArrowUp` to the previous and check it, both wrapping; `Home` checks `Horizontal` and `End` checks `Vertical`; and every checked-by-arrow transition applies and persists the layout exactly as FR-403 / FR-404 do. |
| **FR-406** | S | **Given** the effective layout is `horizontal` because of the narrow-viewport override (FR-411), **when** the visitor points at or focuses the control, **then** `#layout-group` carries `title` and `aria-describedby` pointing at a visually hidden element, both reading exactly `Vertical layout needs a window at least 900 px wide`, so the hint is announced by assistive technology and not only on pointer hover. |

### The two layouts

| ID | P | Requirement |
|---|---|---|
| **FR-407** | M | **Given** `#app` carries `data-layout="horizontal"`, **when** the page is rendered, **then** the console, editor, stdin and diagnostics panels are stacked in one column in that order with the flex ratios, minimum heights and `max-height: 25vh` diagnostics cap of the pre-change build, and the rendered geometry of all four panels is identical to that build at the same viewport size (tolerance: ±1 px per edge). |
| **FR-408** | M | **Given** `#app` carries `data-layout="vertical"`, **when** the page is rendered, **then** the app content area is two columns: the **editor** panel alone occupies the left column across the full block height of the split, and the **console**, **stdin** and **diagnostics** panels occupy the right column, stacked in that order; the toolbar, the COI banner, the status bar and the notices strip remain full-width rows above the split. |
| **FR-409** | M | **Given** the `vertical` (two-column) layout is rendered at a viewport of width `W ≥ 900` px, **when** the columns are measured, **then** the editor column's inline size is between 50 % and 65 % of the app content width, the right column takes the remainder less the gap, each column's inline size is ≥ 320 px, `document.documentElement.scrollWidth` does not exceed `W`, and within the right column the console flexes to fill the space the stdin row and the diagnostics panel do not take, with the diagnostics panel capped at 40 % of the right column's block size instead of `25vh`. Below a viewport height of 520 px the right column scrolls as a whole rather than compressing the console below its 80 px minimum, and the page still does not scroll horizontally. |
| **FR-410** | M | **Given** either layout, **when** the document is inspected, **then** the panels appear in `index.html` in the order console, editor, stdin, diagnostics — the same order at both layouts. The two columns are produced by CSS grid placement only; no element is moved, re-parented, cloned or re-created when the layout changes. |

### Default, persistence and the narrow override

| ID | P | Requirement |
|---|---|---|
| **FR-411** | M | **Given** a stored preference `P` (`vertical`, `horizontal`, or absent) and a viewport width `W`, **when** the effective layout is resolved, **then** it is: `horizontal` if `W < 900`; otherwise `P` if `P` is present; otherwise `vertical`. This is the single rule; nothing else may set `data-layout`. |
| **FR-412** | M | **Given** no preference is stored, **when** the viewport is resized across the 900 px boundary in either direction, **then** the effective layout re-resolves per FR-411 within 100 ms of the `matchMedia('(min-width: 900px)')` `change` event that the crossing fires — the resolver is not debounced and no `resize` listener is used — and nothing is written to storage — an unset preference tracks the viewport and stays unset. |
| **FR-413** | M | **Given** the preference `vertical` is stored, **when** the viewport narrows below 900 px, **then** the effective layout becomes `horizontal`, the stored value stays exactly `vertical`, the control becomes inert per FR-415, and widening back to ≥ 900 px restores the `vertical` layout without the visitor re-selecting it. |
| **FR-414** | M | **Given** the visitor selects a layout (FR-403, FR-404, FR-405), **when** the selection is applied, **then** the string `horizontal` or `vertical` is written to `localStorage` key `pyplay.layout.v2` synchronously, with no wrapper object, no JSON encoding and no whitespace. |
| **FR-415** | M | **Given** the viewport is narrower than 900 px, **when** the control is rendered, **then** the radiogroup and both radios carry `aria-disabled="true"`, are styled as disabled, remain in the tab order (per FR-049 and FR-054 from spec-01, using the existing `setInert()` helper — never the `disabled` attribute), and **every** interaction with the group — pointer activation, `Enter`, `Space`, and the arrow and `Home`/`End` keys of FR-405 — is a no-op: focus stays on the checked radio, `aria-checked` does not move, `data-layout` does not change, and nothing is written to storage. FR-405's navigation model applies only at viewports ≥ 900 px. |
| **FR-416** | M | **Given** the page is loading, **when** the first frame is painted, **then** `#app` already carries the `data-layout` value that FR-411 resolves for the stored preference and the initial viewport width; no frame is ever painted showing the other layout. |
| **FR-417** | M | **Given** `pyplay.layout.v2` holds a value that is not exactly `horizontal` or `vertical` — an empty string, `Horizontal`, ` vertical`, a JSON document, or any other string — or `localStorage` throws on read, **when** the preference is loaded, **then** it is treated as absent (FR-411's third branch), the malformed value is left in place and not rewritten, and no error reaches the console or the notices strip. |
| **FR-418** | S | **Given** the write of FR-414 is rejected (quota exceeded, private browsing, storage disabled), **when** the visitor selects a layout, **then** the layout is still applied for this session and a notice reading exactly `Layout preference won't be remembered` is shown at most once per page load, via the existing `Notices` class. |

### Preserving session state across a switch

| ID | P | Requirement |
|---|---|---|
| **FR-419** | M | **Given** any editor state — document contents, caret offset, selection range, undo/redo history depth, and the diagnostic markers currently rendered — **when** the layout switches in either direction, **then** every one of those is unchanged afterwards, and the CodeMirror view instance is the same object it was before the switch. |
| **FR-420** | M | **Given** console output is present, **when** the layout switches, **then** the console's full retained buffer is unchanged (no line dropped, added or re-wrapped into the truncation marker of FR-027 from spec-01); a console that was scrolled to the bottom is still at the bottom and still auto-follows new output; a console that was scrolled up keeps showing the same first visible line and still does not auto-follow. |
| **FR-421** | M | **Given** a program is running, **when** the layout switches, **then** the run continues uninterrupted: the same worker serves it, `runId` is unchanged, no output is lost, duplicated or reordered, Run stays disabled and Stop stays enabled, and the run's `done` or `error` message is handled normally. |
| **FR-422** | M | **Given** a program is blocked on a stdin read, **when** the layout switches, **then** the stdin field keeps its enabled state, its current text and its caret position, the pending read stays blocked, and submitting afterwards delivers exactly the text the visitor typed, with the CPython return semantics of spec-01 unchanged. |
| **FR-423** | M | **Given** the diagnostics panel holds entries, **when** the layout switches, **then** the entry list, its order and the live count are unchanged, no lint run is scheduled or triggered by the switch, and clicking an entry still reveals its position in the editor. |
| **FR-424** | M | **Given** a layout switch, **when** it is applied, **then** it schedules no autosave write (the debounce of FR-002 from spec-01 is neither started nor reset), sends no message to the worker, and issues no network request. |
| **FR-425** | S | **Given** a layout switch, **when** it is applied, **then** no CSS transition or animation runs on any panel's size or position: the new layout is painted in one frame. |
| **FR-426** | M | **Given** the editor is scrolled so that document line `L` is the first fully visible line, **when** the layout switches, **then** line `L` is still fully visible afterwards and no line before it is. The editor has `EditorView.lineWrapping` enabled (`src/editor.ts`), so a column-width change reflows wrapped lines and the pixel `scrollTop` necessarily changes; the preserved quantity is the document position, never the offset. |

---

## Business Rules

| ID | Rule | Rationale | Exceptions |
|---|---|---|---|
| **BR-401** | The layout is presentation only. Switching it never mutates the editor buffer, the CodeMirror undo history, the console buffer's contents, the diagnostics set, the stdin stream, or any worker state. Its only effects are the `data-layout` attribute, the control's checked state, and the `pyplay.layout.v2` write. | The parent's BR-006 guarantees the executed bytes are exactly what the visitor typed; a layout control that could touch the buffer would put that guarantee at the mercy of a CSS feature. Keeping the switch out of the autosave (FR-002) and lint (FR-035) paths is also what makes FR-424 cheap to satisfy. | None. |
| **BR-402** | Both layouts render the same document order. Columns are produced by CSS grid placement (`grid-template-areas` / `grid-area` or equivalent); the implementation never moves, re-parents or re-creates a panel element to change layout. | Two reasons. (a) Re-parenting the editor element forces CodeMirror to re-measure and drops focus and selection, which would break FR-419 outright. (b) A fixed document order keeps sequential focus order identical in both layouts, so WCAG 2.1 SC 2.4.3 cannot regress when the visitor switches. | None. |
| **BR-403** | This feature adds exactly one persisted key — `localStorage` `pyplay.layout.v2`, a bare string from a two-value enum — and no cookie, IndexedDB, session storage or network request. | Preserves BR-001 (static files only) and BR-005 (nothing leaves the origin), and keeps the *Persisted state* table of spec-01 to two rows plus one. A two-value enum needs no schema, so it is only ever superseded, never migrated — which is exactly what `v2` is: `v1` shipped the *other* naming convention, so reading a `v1` value under `v2`'s meaning would hand the visitor the layout they did not choose (amendment 7). | None. |
| **BR-404** | Below 900 px the `horizontal` (stacked) layout is the only layout, regardless of preference. | Two columns at 375 px give each panel ~180 px, in which neither an 80-column code line nor a traceback is readable, and the diagnostics entries would wrap to three lines each. FR-047 from spec-01 requires the whole page to work at 375 px without horizontal scrolling; honouring `vertical` there would satisfy the letter of issue #2 while destroying the page it applies to. 900 px is the width at which FR-409's 50–65 % split still leaves both columns ≥ 320 px. | None. The preference itself is never overwritten (FR-413), so the override is invisible once the window is wide again. |
| **BR-405** | An unset preference tracks the viewport (FR-412); an explicitly chosen preference is sticky and is never overwritten by a resize, a reload, or the narrow override. | A first-time visitor should get the layout that suits their screen without being asked. A returning visitor who *did* choose has expressed intent that no automatic rule may quietly discard — the visitor's choice outranks the heuristic, and the heuristic exists only in its absence. | None. |
| **BR-406** | A failure to persist the preference degrades this feature only: the layout still applies for the session, and editing, running, formatting, stdin, autosave and the clipboard are untouched. | Instance of BR-009 from spec-01 — an optional subsystem's failure must never reach the core write-run-read loop. The one-per-load notice of FR-418 follows the autosave-failure precedent (FR-005). | None. |
| **BR-407** | The console panel contains no focusable element, so in the horizontal layout the sequential focus order is: toolbar controls → editor (left column) → stdin field → Send EOF → diagnostics entries (right column). Any future change that puts a tab stop inside the console must re-verify SC 2.4.3 against this rule. | This is the reason FR-410's fixed document order is safe: with the console skipped, focus visits the left column then the right column top-to-bottom, matching the visual reading order in both layouts rather than zig-zagging between them. | None. |

---

## Non-Functional Requirements

Thresholds are measured on spec-01's reference profile: a 2020-or-later laptop
(4 cores, 8 GB RAM), current-stable Chrome, connection throttled to
10 Mbit/s down / 40 ms RTT.

Scalability, availability and observability remain **not applicable** — the
site has no server, no shared state and no operator.

| ID | Requirement | Threshold |
|---|---|---|
| **NFR-401** | Layout at a 375 × 667 viewport, with `pyplay.layout.v2` unset, set to `horizontal`, and set to `vertical`. Extends FR-047 from spec-01. | In all three cases: `document.documentElement.scrollWidth` ≤ 375 px; the toolbar, status bar, console, editor, stdin field, Send EOF and diagnostics are unclipped; each layout radio's rendered hit area ≥ 32 × 32 px. |
| **NFR-402** | Contrast of the control's **text** — both radio labels, checked and unchecked, and the disabled rendering of FR-415 — in both palettes. Extends NFR-010 from spec-01. | ≥ 4.5:1 against its background (WCAG 2.1 SC 1.4.3, AA). |
| **NFR-403** | Contrast of the control's **non-text components** — segment borders, the checked-state indicator, the focus ring, the disabled border, and the edge between the two columns in the `vertical` layout — in both palettes. Extends NFR-013 from spec-01. | ≥ 3:1 against adjacent colours (WCAG 2.1 SC 1.4.11, AA). |
| **NFR-404** | Latency of a layout switch, measured from the activating event to the first frame showing the new geometry, with a 500-line program in the editor, 5 000 lines in the console and 50 diagnostics present. | ≤ 100 ms; no main-thread task longer than 100 ms is introduced (consistent with NFR-009 from spec-01); zero network requests attributable to the switch. |
| **NFR-405** | Bytes and requests this feature adds to a cold load, measured against the **baseline build of commit `384cb70`** (`npm run build`, same Node and Vite versions, gzip). | ≤ 2 KB gzipped added to the baseline total; **zero** additional network requests; **zero** new runtime assets. NFR-004's 15 MB cold-transfer budget from spec-01 is unchanged. |
| **NFR-406** | Browser support, on the baseline pinned by NFR-011 from spec-01 (Chrome 141/140, Edge 141/140, Firefox 145/144, Safari 26.1/26.0). | Every Must-priority FR in this spec passes on each of the 8 versions. |

---

## Data & Interfaces

### Persisted state

Spec-01's *Public interfaces / data* table gains exactly one row:

| Store | Key | Contents | On read failure |
|---|---|---|---|
| `localStorage` | `pyplay.layout.v2` | Exactly `horizontal` (stacked) or `vertical` (two columns). A bare UTF-8 string: no JSON, no wrapper, no surrounding whitespace. | Treat as absent → FR-411's third branch. Any other value is likewise treated as absent and left in place (FR-417). |

Still no cookies, no IndexedDB, no session storage (BR-403).

### Constants

| Constant | Value | Used by |
|---|---|---|
| `LAYOUT_KEY` | `pyplay.layout.v2` | FR-414, FR-417 |
| `LAYOUT_MIN_WIDTH` | `900` (CSS px) | FR-411, FR-413, BR-404 |
| `LAYOUT_EDITOR_COLUMN` | `58%` — the editor column's share of the app content width. FR-409's 50 %–65 % band is the tolerance a re-tune may move within without re-opening this spec; `58%` is what ships. | FR-409 |
| `LAYOUT_MIN_HEIGHT` | `520` (CSS px) | FR-409 |

The breakpoint is evaluated with `matchMedia('(min-width: 900px)')` on the main
thread and mirrored by a `@media (min-width: 900px)` guard in
`src/styles.css`, so the CSS cannot render a two-column layout that the
resolver of FR-411 has not chosen.

### User-visible strings

Per spec-01's convention these live in `src/format.ts` and are quoted verbatim
from this spec. Nothing else may be rendered by the control.

| Constant | Value |
|---|---|
| `LAYOUT_LABEL` | `Layout` (FR-401) |
| `LAYOUT_VERTICAL` | `Vertical` (FR-401) |
| `LAYOUT_HORIZONTAL` | `Horizontal` (FR-401) |
| `LAYOUT_NARROW_HINT` | `Vertical layout needs a window at least 900 px wide` (FR-406) |
| `LAYOUT_SAVE_FAILED` | `Layout preference won't be remembered` (FR-418) |

### DOM contract

Added to `index.html`. The control is the last item in the existing toolbar;
no panel element is added, removed or moved.

| Element | Id | Contract |
|---|---|---|
| Layout group | `layout-group` | `<div role="radiogroup" aria-label="Layout">`, last child of `header.toolbar`, after `#btn-reset`. Carries `aria-disabled` and `title` per FR-415 / FR-406. |
| Vertical radio | `layout-vertical` | `<button type="button" role="radio" aria-checked tabindex="0\|-1">Vertical</button>`. |
| Horizontal radio | `layout-horizontal` | `<button type="button" role="radio" aria-checked tabindex="0\|-1">Horizontal</button>`. |
| App root | `app` (existing) | Gains `data-layout="vertical"` or `data-layout="horizontal"`, set before first paint (FR-416). It is the only layout switch; no class is toggled for this purpose. |
| Panels | existing four `<section class="panel panel--*">` | Unchanged markup, unchanged document order, unchanged ids and ARIA labels (FR-410). |
| Notice strip | `notices` (existing) | Reused unchanged for FR-418 via the existing `Notices` class. |

Exactly one radio has `tabindex="0"` at any time — the checked one — giving the
group a single tab stop (FR-405), the same roving-tabindex model spec-01 uses
for the diagnostics panel.

### New module

`src/layout.ts`, holding the pure resolver so it can be unit-tested without a
DOM:

```
type Layout = 'vertical' | 'horizontal'

loadLayoutPreference(storage: StorageLike | null): Layout | null    // FR-417
saveLayoutPreference(storage: StorageLike | null, l: Layout): boolean // FR-414
resolveLayout(pref: Layout | null, viewportWidth: number): Layout   // FR-411
```

`StorageLike` and `getLocalStorage()` are reused from `src/storage.ts`
unchanged. `saveLayoutPreference` returns `false` rather than throwing on any
rejection path, which is what FR-418 needs.

### Reused interfaces

- `setInert(el, inert)` / `isInert(el)` from `src/controls.ts` — unchanged, for
  FR-415.
- `Notices.show(text)` from `src/notices.ts` — unchanged.
- No change to `src/protocol.ts`, `src/runtime.ts`, `src/worker/`,
  `src/stdin-*.ts`, `src/lint/`, `src/offline.ts`, `src/editor.ts`,
  `src/console.ts`, `src/console-buffer.ts`, `src/autosave.ts`,
  `src/storage.ts` or `scripts/`.

### Relationship to spec 03

`specs/03-vertical-pane.md` (special-character pane) is in flight on a separate
branch and also introduces a CSS grid on `.app`, at its own 700 px breakpoint,
while its pane is open. The two are compatible and must be merged as one grid
definition rather than two competing ones:

- The pane keeps its full-height **inline-end** column in **both** layouts of
  this spec; it is never placed inside the editor column or the right column.
- Spec-03's 700 px pane breakpoint and this spec's 900 px layout breakpoint are
  independent; neither is redefined in terms of the other.
- Spec-03's FR-317 (document position of the pane fixed at every width) and
  this spec's FR-410 state the same discipline and do not conflict.
- Whichever spec merges second folds the other's placement into the single
  `grid-template-areas` set and re-runs both specs' layout criteria. If spec-03
  ships first, VC-409 and VC-410 below are additionally run with the pane open,
  asserting that the pane keeps its inline-end column in both layouts.

---

## Verification Criteria

Every FR and BR has at least one criterion. Per spec-01's convention, each test
is named after the criterion it discharges, so `--grep "VC-401"` finds it.
Unless a criterion says otherwise, it runs at a 1 280 × 800 viewport with
`pyplay.layout.v2` unset before load.

- **VC-401** *(FR-401)*: Load the page → the child of `header.toolbar` immediately after `#btn-reset` is `#layout-group` (amendment 1), its role is `radiogroup`, its accessible name is exactly `Layout`, and it contains exactly two `role="radio"` elements whose accessible names are `Horizontal` then `Vertical`.
- **VC-402** *(FR-402, FR-411)*: Load at 1 280 px with no stored preference → `#app` has `data-layout="vertical"` and `Vertical` is the radio with `aria-checked="true"`. Reload at 800 px → `data-layout="horizontal"` and `Horizontal` is checked. In neither case does `localStorage` gain a `pyplay.layout.v2` key.
- **VC-403** *(FR-403, FR-414)*: Load at 1 280 px with `pyplay.layout.v2` = `horizontal`; click `Vertical` → `#app` has `data-layout="vertical"`, `aria-checked` is `true` on `Vertical` and `false` on `Horizontal`, and `localStorage.getItem('pyplay.layout.v2')` is exactly the 8 characters `vertical`.
- **VC-404** *(FR-404, FR-414)*: From the `vertical` layout, click `Horizontal` → `#app` has `data-layout="horizontal"`, `aria-checked` moves, and the stored value is exactly the 10 characters `horizontal`.
- **VC-405** *(FR-405)*: Focus `#layout-group` by `Tab` → focus is on the checked radio and it is the only radio with `tabindex="0"`. Press `ArrowRight` → the other radio is focused, checked, applied to `#app` and persisted; `ArrowRight` again wraps back to the first and does the same. Repeat the sequence with `ArrowDown`, `ArrowLeft` and `ArrowUp`. Press `Home` → `Horizontal` is checked and applied; press `End` → `Vertical` is checked and applied.
- **VC-406** *(FR-405, FR-403, FR-404)*: With the group focused, press `Space`, then `Enter`, on each radio in turn → each activation applies and persists that radio's layout, and no activation scrolls the page.
- **VC-407** *(FR-049 from spec-01, FR-405)*: From page load press `Tab` repeatedly → Run, Stop, Clear console, Copy code, Format, Reset, the layout group (**one** stop), the editor, the stdin field, Send EOF and the diagnostics entries are each reached, each with a visible focus ring; the number of stops contributed by `#layout-group` is exactly 1; and the enumerated order is identical at `data-layout="horizontal"` and `data-layout="vertical"`.
- **VC-408** *(FR-407)*: Render at 1 280 × 800 and at 375 × 667 with `data-layout="horizontal"`, and capture each panel's bounding box; compare against the same measurements taken on the baseline build of commit `384cb70` at the same viewport sizes → every edge matches within ±1 px, and the diagnostics panel's computed `max-height` is `25vh` in both builds.
- **VC-409** *(FR-408, BR-407)*: Render at 1 280 × 800 with `data-layout="vertical"` → the editor panel's box is entirely to the inline-start side of the console, stdin and diagnostics boxes; the console, stdin and diagnostics boxes share an inline-start edge and appear in that block order; the editor panel's block size equals the block size spanned by those three plus the gaps (±1 px); and the toolbar, COI banner, status bar and notices strip each span the full app content width.
- **VC-410** *(FR-409)*: Render at 1 280 × 800, 1 024 × 800 and 900 × 800 with `data-layout="vertical"` → at each width the editor column's inline size is 58 % of the app content width (±1 px) and therefore within the 50 %–65 % band, both columns are ≥ 320 px, `document.documentElement.scrollWidth` ≤ the viewport width, and the diagnostics panel's rendered block size is ≤ 40 % of the right column's block size while the console's block size is > 0.
- **VC-411** *(FR-410, BR-402)*: At `data-layout="horizontal"` and at `data-layout="vertical"`, read `#app`'s element children in order → the sequence of panel ids/classes is identical and is console, editor, stdin, diagnostics in both cases; and across a switch performed with a `MutationObserver` attached to `#app` with `childList: true, subtree: true`, no `childList` mutation involving a `.panel` element is recorded.
- **VC-412** *(FR-411, FR-412, BR-405)*: With no stored preference, load at 1 280 px (vertical), resize to 899 px → within 100 ms `data-layout` is `horizontal`; resize to 900 px → within 100 ms it is `vertical`; after both resizes `localStorage.getItem('pyplay.layout.v2')` is still `null`.
- **VC-413** *(FR-413, BR-404, BR-405)*: Store `vertical`, load at 1 280 px → vertical. Resize to 375 px → `data-layout` is `horizontal`, the stored value is still exactly `vertical`, and `document.documentElement.scrollWidth` ≤ 375. Resize back to 1 280 px → vertical is rendered again with no click. Reload at 375 px → horizontal, stored value still `vertical`.
- **VC-414** *(FR-415)*: At 375 × 667, load → `#layout-group` and both radios have `aria-disabled="true"`, `isInert()` reports true for the group, `Tab` still reaches it exactly once with a visible focus ring, and the `disabled` attribute is absent. Then click `Vertical`, and separately press `ArrowRight`, `ArrowLeft`, `ArrowDown`, `ArrowUp`, `Home`, `End`, `Space` and `Enter` → after each, `document.activeElement` is still the `Horizontal` radio, `#app` still has `data-layout="horizontal"`, `aria-checked` is still on `Horizontal`, and `localStorage.getItem('pyplay.layout.v2')` is still `null`.
- **VC-415** *(FR-406)*: At 375 × 667 → `#layout-group`'s `title` is exactly `Vertical layout needs a window at least 900 px wide`, its `aria-describedby` resolves to an element whose text is that same string, and the accessibility tree reports it as the group's description. At 1 280 × 800 → the control is not `aria-disabled` and that string is not present in the document.
- **VC-416** *(FR-416)*: Store `vertical`; load at 1 280 px with a `MutationObserver` on `#app`'s attributes installed from a document-start script, and read `#app.dataset.layout` inside the first `requestAnimationFrame` callback → the value is `vertical` in that first frame, and the observer records no later change of `data-layout`. Repeat with the preference `horizontal` at 1 280 px → the first frame is `horizontal` and no later change occurs. A full-page screenshot of the first painted frame in each case matches the settled layout.
- **VC-417** *(FR-417)*: For each of the stored values `''`, `' vertical'`, `Horizontal`, `"horizontal"`, `{"layout":"horizontal"}`, `diagonal` and a 1 MB string, load at 1 280 px → `data-layout` is `vertical` (the unset default at that width), the stored value is byte-identical to what was written, no notice is shown, and the browser console records no error or unhandled rejection. Load once more at 800 px with `diagonal` stored → `data-layout` is `horizontal`.
- **VC-418** *(FR-417)*: With `localStorage` made to throw on `getItem` and on `setItem`, load at 1 280 px → the page reaches its normal ready state, `data-layout` is `vertical`, Run executes `print("ok")` successfully, and no uncaught exception is recorded.
- **VC-419** *(FR-418, BR-406)*: With `localStorage.setItem` rejecting (quota) but `getItem` working, load at 1 280 px and click `Horizontal`, then click `Vertical`, then click `Horizontal` again → each click applies the layout; a notice reading exactly `Layout preference won't be remembered` is present; the notices strip contains exactly one such notice after all three clicks; and Copy code, Format, Run and stdin all still behave as spec-01 requires.
- **VC-420** *(FR-419, BR-401)*: At 1 280 px, type a 40-line program, place the caret at line 12 column 5, select 20 characters, undo once and redo once, and let lint produce at least one diagnostic. Capture the document text, caret offset, selection range, undo depth, the rendered marker ranges, and a reference to the `EditorView`. Switch to vertical, then back to horizontal → after each switch all six observations are unchanged, and pressing `Ctrl/Cmd+Z` still undoes the same edit it would have undone before.
- **VC-421** *(FR-420)*: Run a program printing 6 000 lines and let it finish, leaving the console scrolled to the bottom. Switch layout → the console's text content is byte-identical, the truncation marker state is unchanged, `scrollTop + clientHeight` is still at `scrollHeight` (±2 px), and a subsequent run's first line is auto-followed into view. Repeat having first scrolled the console up so that line 100 is the first visible line → after the switch line 100 is still the first visible line and new output does **not** scroll the console.
- **VC-422** *(FR-421, BR-401)*: Run `import time\nfor i in range(30):\n    print(i)\n    time.sleep(0.2)`; while it runs, switch to vertical, wait 400 ms, switch back to horizontal → the console shows `0`–`29` exactly once each in order, `Program finished in N.NN s` appears, Run was disabled and Stop enabled throughout, and the worker was never replaced (no second `Python … ready` line, no `Restarting Python…` status).
- **VC-423** *(FR-422)*: Run `a = input("? ")\nb = sys.stdin.readline()\nprint(a, b.strip())` (with `import sys`); when the stdin field enables, type `hola` without submitting, switch layout twice → the field is still enabled, still contains `hola`, the caret is still at offset 4, and the program is still blocked. Submit `hola`, switch layout again while the second read is pending, submit `chau` → the console shows `hola chau`.
- **VC-424** *(FR-423)*: With at least three diagnostics present, capture the panel's entries, their order and the count; switch layout twice → all three observations are unchanged, no additional lint run was scheduled (the linter's schedule hook records no call), and clicking the second entry still reveals its line in the editor.
- **VC-425** *(FR-424, BR-401)*: Instrument `localStorage.setItem` and `Worker.prototype.postMessage`, and record network requests. Type one character, wait 100 ms (inside the 500 ms autosave debounce), then switch layout twice → the only `setItem` calls carry key `pyplay.layout.v2`, the autosave write for `pyplay.program.v1` still lands 500 ms after the *keystroke* and not sooner, no `postMessage` was sent, and zero network requests were recorded.
- **VC-426** *(FR-425, NFR-404)*: With a 500-line program, 5 000 console lines and 50 diagnostics, record a performance profile and switch layout in each direction → each switch paints its new geometry ≤ 100 ms after the activating event, no main-thread task exceeds 100 ms, no CSS transition or animation event fires on any `.panel` element, and the network panel records zero requests.
- **VC-427** *(NFR-401, FR-047 from spec-01)*: At 375 × 667, for each of the three preference states (unset, `horizontal`, `vertical`): load, then exercise Run with the starter program through to a submitted `input()` → `document.documentElement.scrollWidth` ≤ 375 throughout; the toolbar, status bar, console, editor, stdin field, Send EOF and diagnostics are unclipped; and each layout radio's rendered box is ≥ 32 × 32 px.
- **VC-428** *(NFR-402, NFR-403, extends VC-051 and VC-071 from spec-01)*: In light mode and in dark mode, at 1 280 px in both layouts and at 375 px (disabled control), sample: both radio labels checked, both unchecked, both disabled, against their backgrounds; and the segment borders, checked indicator, focus ring, disabled border and the edge between the two columns against adjacent colours → every text ratio ≥ 4.5:1 and every non-text ratio ≥ 3:1.
- **VC-429** *(NFR-405, BR-403)*: Build and compare against the baseline build of commit `98ee032` (amendment 3) → the gzipped total grows by ≤ 2 KB; the set of emitted files is unchanged except for the content hash of the main JS chunk and the main CSS file; every Pyodide and Ruff asset is byte-identical; and the precache manifest and generated `sw.js` differ only in those two hashed filenames, with the same number of precached URLs and the same cache-name scheme.
- **VC-430** *(BR-403)*: Load at 1 280 px, snapshot `localStorage`, `sessionStorage`, `document.cookie` and `indexedDB.databases()`; select each layout twice and reload → `sessionStorage`, cookies and IndexedDB are identical to the pre-change snapshots, and `localStorage`'s keys are exactly `pyplay.program.v1` and `pyplay.layout.v2`.
- **VC-431** *(BR-407)*: At `data-layout="vertical"`, enumerate every focusable element inside `#app`'s panels in tab order and read each one's bounding box → no element inside the console panel appears in the enumeration, and the sequence is editor, stdin field, Send EOF, then the diagnostics entries — that is, the left column's stop precedes every right-column stop.
- **VC-432** *(NFR-406)*: Execute VC-403, VC-409, VC-413, VC-414, VC-416, VC-420 and VC-427 on each of the 8 pinned browser versions → all pass on all 8.
- **VC-433** *(BR-401)*: Run the automated spec-01 suites — `npm test` (Vitest + the default Playwright project), `npm run audit:perf` and `npm run audit:contrast` — three times: with the preference unset, set to `horizontal`, and set to `vertical` → every criterion those suites cover passes in all three runs, with the four amendments of *Parent-spec amendments* applied. The opt-in matrix (`npm run test:matrix`, VC-055) is covered by VC-432 instead. The four criteria no script can assert — VC-056 (physical network disconnect), VC-059 (six-minute run, `RUN_LONG=1`), VC-063 (second deployment) and VC-021's greyscale check — are **not** re-run: this spec touches no code on their paths, which is what VC-425 and VC-429 establish.
- **VC-434** *(FR-426)*: At 1 280 px with a 200-line program containing at least five lines long enough to wrap in both column widths, scroll the editor until line 120 is the first fully visible line; switch to vertical, then back to horizontal → after each switch `posAtCoords` at the editor viewport's top edge resolves inside line 120 or earlier within it, line 120 is fully visible, and line 119 is not.
- **VC-435** *(FR-409)*: Render at 1 280 × 500 and 900 × 420 with `data-layout="vertical"` → the console's rendered block size is ≥ 80 px, every stdin control and at least one diagnostics entry is reachable by scrolling the right column only, and `document.documentElement.scrollWidth` ≤ the viewport width at both sizes.

---

## Parent-spec amendments

These parent criteria change because the toolbar and the layout change. Nothing
else in spec-01 is amended.

| Parent VC | Amendment |
|---|---|
| **VC-050** *(FR-047, FR-065)* | The 375 px assertion is run for all three preference states, per VC-427; the unset-preference case is the previously shipped one. |
| **VC-051** *(FR-048, NFR-010)* | Sampling set gains both radio labels in checked, unchecked and disabled renderings — see VC-428. |
| **VC-052** *(FR-049)* | Tab-order enumeration gains exactly one stop for `#layout-group` after `Reset`, and must produce the same order in both layouts — see VC-407. |
| **VC-071** *(NFR-013)* | Sampling set gains the segment borders, checked indicator, disabled border, focus ring and the `vertical` layout's column edge — see VC-428. |

---

## Deliberately excluded

- **A draggable splitter.** It is the obvious next request, and it is a
  different feature: a pointer-drag interaction needs a keyboard equivalent to
  satisfy FR-049, a persisted numeric ratio rather than a two-value enum, and a
  re-measure path through CodeMirror on every frame of the drag. Fixed
  proportions (FR-409) deliver the wide-screen benefit issue #2 asks for at a
  fraction of the risk. A splitter is a follow-up spec that would reuse this
  spec's grid, breakpoint and persistence shape.
- **Honouring `horizontal` at 375 px.** See BR-404 — it would satisfy the issue
  literally while breaking the viewport the parent spec explicitly protects.
- **A third "auto" option in the control.** Absence of a stored preference
  already *is* auto (FR-411, FR-412); a visible third option would need a way
  to return to it, i.e. deleting the key, for a state the visitor gets by
  default.
- **Remembering the layout per viewport size** (one preference for the laptop,
  another for the phone). The narrow override (FR-413) already gives that
  outcome for the only distinction that matters here, without a second key.
- **Panel collapse, maximise or tab-grouping**, and any layout with the editor
  on the right — no requirement in issue #2 calls for them, and each multiplies
  the layout criteria this spec has to verify.

---

## Open Questions

None. All decisions are folded into the sections above.

---

## Assumptions

1. **A-401** — The audience is spec-01's: introductory-programming students
   writing short single-file console programs, working on a mix of laptops and
   phones. The wide-screen benefit of the horizontal layout is assumed to be
   worth one more toolbar control for that audience; if telemetry existed it
   would settle this, and it deliberately does not (BR-005 from spec-01).
2. **A-402** — 900 px is the right breakpoint for two usable columns given the
   current 14 px base font and the 8 px app padding. If either changes, BR-404's
   ≥ 320 px-per-column justification must be recomputed and `LAYOUT_MIN_WIDTH`
   revised with it.
3. **A-403** — CSS grid placement changes the editor's and console's rendered
   box without re-parenting them, so CodeMirror re-measures without losing
   focus or selection (FR-419), and the console's scroll offset is preserved by
   the browser (its `white-space: pre` means a width change reflows nothing).
   The editor *does* reflow, which is why FR-426 preserves a document position
   rather than an offset. If some pinned browser proves otherwise, the fix
   is an explicit re-measure and scroll restore *after* the switch (restoring
   the document position of FR-426, not a pixel offset), not a document
   reorder — BR-402 stands either way.
4. **A-404** — UI copy follows spec-01's A-05: system strings in English,
   quoted verbatim from *User-visible strings*. No i18n layer is required for
   this version.
5. **A-405** — `matchMedia` and its `change` event are available on all 8
   pinned browsers, so FR-412's resize tracking needs no polling and no
   `resize` listener.
6. **A-406** — Spec 03 (`specs/03-vertical-pane.md`) will merge before or after
   this spec but not concurrently with it; whichever lands second reconciles the
   single `.app` grid definition per *Relationship to spec 03* and re-runs both
   specs' layout criteria.

---

## Amendments applied during implementation

This spec was written assuming `specs/03-vertical-pane.md` had **not** merged
(A-406, *Relationship to spec 03*). It had: `0a4194f` landed the
special-character pane on `main` before this branch's first commit. Five of the
six amendments below follow from that, one from a conflict internal to this
spec, and the seventh from the naming convention being reported as backwards
against the running build. Each was applied where the criterion lives, and each is asserted in the
suite in its amended form — none was dropped.

| # | Criterion | Amendment and why |
|---|---|---|
| 1 | **FR-401 / VC-401**, *DOM contract* | `#layout-group` is the toolbar child **immediately after `#btn-reset`**, and is followed by `#btn-symbols`. The DOM contract also called it "last child of `header.toolbar`"; spec-03's shipped VC-301 requires the toolbar's *last* control to read `Symbols`, and both cannot hold. FR-401's own Given/When/Then says "immediately after `#btn-reset`", which is what ships — so this spec's parenthetical is amended and spec-03 is untouched. VC-401 asserts adjacency to `#btn-reset`. |
| 2 | **FR-407 / VC-408** | The ±1 px comparison against `384cb70` is asserted over the panels' **inline extents, document order, flex declarations, minimum heights and the `25vh` cap** — plus the assertion that the header block's height is the *only* difference, and that the panel column lost exactly the height the toolbar gained. FR-401 adds a toolbar control and FR-407 protects the panels below it; at 375 px the toolbar wraps, so their absolute page coordinates cannot both hold under *any* implementation of FR-401. The declarations are what FR-407 names, and they are unchanged. (At 1280 px the delta is a single pixel: NFR-401's 32 px hit area against a `.btn`'s 31 px.) |
| 3 | **NFR-405 / VC-429** | Measured against **`98ee032`** — `384cb70` plus spec-03 plus spec-05 — not `384cb70`. Spec-03's pane costs 2.18 KiB gzipped on its own, which would consume the whole of this spec's 2 KB budget before it emitted a line; spec-05's color mode has since landed on `main` too. NFR-405 asks what *this feature* adds, so the baseline is the tree this branch sits on: it started from the merge-base `0a4194f` and was rebaselined to `98ee032` when `main` was merged in. Spec-03's and spec-05's own deltas against their own baselines are still asserted, unchanged, by VC-323 and VC-513. Measured: **1.62 KiB**, zero new assets, zero new requests. |
| 4 | **FR-409 / VC-435** | "The right column scrolls as a whole" is satisfied by **each right-column panel scrolling its own overflow**, not by a scroll container around the three. There is no such element and there cannot be one: FR-410 fixes the document order as console, editor, stdin, diagnostics, so the three right-column panels are not adjacent siblings and cannot be wrapped without the reorder BR-402 forbids. What the criterion asks for is delivered — the console holds its 80 px floor, every stdin control and a diagnostics entry stay reachable without scrolling the *page*, and there is no horizontal scroll at either size. |
| 5 | **VC-409 / VC-410 with the pane open** | Added, per *Relationship to spec 03*: the pane keeps its full-height inline-end column in both layouts. FR-409's "each column ≥ 320 px" is asserted with the pane **closed**, which is the default state; the pane's own 72 px column plus its gap necessarily eats into the right column at the 900 px floor, and that is spec-03's geometry, not a violation of this spec's. |
| 6 | *Parent-spec amendments* | Recorded in this spec's own table (below), not by editing `specs/01-static-python-web-frozen.md`. That document is a frozen context capsule describing what spec-01 *shipped*; adding this spec's `localStorage` row or VC changes to it would misdescribe spec-01. This is spec-03's precedent — it amended the same four criteria the same way. The live equivalents are updated instead: `docs/architecture.md`'s storage table gains the `pyplay.layout.v2` row, and the four amended assertions live in `tests/e2e/presentation.spec.ts` where the parent criteria do. |

| 7 | **The meaning of `horizontal` and `vertical`**, and `LAYOUT_KEY` | Both words now name the orientation of the **divider** between the panels (`vim`'s `:split` / `:vsplit` convention), where v1.0.0 named the axis the panels run *along* (`tmux`'s `split-window -h` convention). So `horizontal` is the stacked layout and `vertical` the two-column one — the reverse of what shipped in v1.1.0. Reported from the running build: with `Horizontal` checked, the visitor saw panels divided by a *vertical* rule, which reads as flipped. Both conventions are in wide use and neither is wrong, so the fix is not that this one is correct but that it is **fixed and written down** — in `src/layout.ts`, which is normative, and in the header note above. Consequences, all applied: FR-401's radio order is `Horizontal` then `Vertical` (the always-available layout first, so `Home` reaches it); FR-403/FR-404, FR-407/FR-408, FR-411 and FR-413 swap which value they name; FR-406's hint reads `Vertical layout needs a window at least 900 px wide`; and **`LAYOUT_KEY` becomes `pyplay.layout.v2`**, because a v1 value read under v2's meaning would silently hand the visitor the layout they did not choose. BR-403 already provided for exactly this: a two-value enum is superseded, never migrated. No geometry changed — only which label and which stored string select it. |

### Where each criterion is verified

| File | Criteria |
|---|---|
| `tests/unit/layout.test.ts` | VC-411, VC-414 and VC-417 (unit halves), the *Constants* and *User-visible strings* tables |
| `tests/e2e/layout.spec.ts` | VC-401 – VC-419, VC-427, VC-428, VC-430, VC-431, VC-435, and VC-409 / VC-410 with the pane open |
| `tests/e2e/layout-state.spec.ts` | VC-420 – VC-426, VC-434 |
| `tests/e2e/presentation.spec.ts` | the amended parent VC-050, VC-051, VC-052 and VC-071 |
| `tests/e2e/perf.spec.ts` | VC-429 |
| `tests/e2e/matrix.spec.ts` | VC-432 |
| `PYPLAY_LAYOUT_PREF=…` over the parent suites | VC-433 |

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-09-02 | Initial spec, from issue [#2](https://github.com/fclabs/web-python/issues/2). |
| 1.1.0 | 2026-09-02 | Implemented. Six amendments recorded below, five of them forced by spec-03 having merged first. Status → SHIPPED. |
| 1.2.0 | 2026-09-02 | The two layout names now describe the orientation of the divider, not the axis the panels run along — reversing which rendering each label selects, and superseding `LAYOUT_KEY` to `pyplay.layout.v2`. Amendment 7. No geometry changed. |
