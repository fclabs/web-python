# Editor Font Size Control

Source: issue #60
Status: DRAFT — not yet implemented, not yet frozen
Parent: `specs/01-static-python-web-frozen.md`
Siblings amended: `specs/05-dark-mode-frozen.md`, `specs/08-about-button-frozen.md` (toolbar order), `specs/09-minimal-diags-frozen.md` (inline-bootstrap and storage-surface precedent)
Issue: https://github.com/fclabs/web-python/issues/60

This child spec uses the `13xx` identifier range.

## Purpose

The editor's text size is fixed in CSS. Visitors who project in a classroom,
use small or high-DPI screens, or need larger text have no way to change it
short of browser zoom, which scales the whole page and shrinks the working
area. This spec adds a toolbar **Font size** control — a button opening a
drop-down of preset sizes — that resizes **only the code editor's text and
gutters**, remembers the choice, and applies it before first paint.

## Scope

**In**

- One toolbar button + drop-down of six presets: 12, 14 (default), 16, 18, 20, 24 px.
- Applies to CodeMirror's content and gutters (line numbers, lint gutter icons, and fold markers if present).
- Persistence in a new `localStorage` key, restored before first paint.
- Keyboard and screen-reader operation; both palettes; both layouts.

**Out**

- Console/output, Files pane (including the `Editing: <file>` heading), Symbols pane, diagnostics list, stdin field, toolbar, notices, About dialog.
- CodeMirror popups: the completion list and the lint tooltip keep their current fixed size.
- Free-form size entry, `Ctrl`/`Cmd` +/- shortcuts, a slider, steps beyond the six presets.
- Changing font family, line height, or tab width.
- Live sync of the choice between two open tabs (the value is read at load; last write wins).
- Resetting the size from the existing **Reset** button (Reset restores the program, not preferences).

## Actors

| Actor | Description | Permissions |
|---|---|---|
| Visitor | Person using the playground | Open the drop-down, choose a size; the choice persists in their browser |

## Functional Requirements

**FR-1301 — Toolbar control (Must)**
Given the page has loaded, when the toolbar is rendered, then `#btn-fontsize` exists inside `header.toolbar` immediately after `#btn-symbols` and before `#btn-theme`, with `tabindex="0"`, `aria-haspopup="menu"`, `aria-expanded="false"`, and `aria-controls` referencing the drop-down.

**FR-1302 — Label reflects current size (Must)**
Given the current size is *N*, when the toolbar is rendered or the size changes, then `#btn-fontsize` shows the visible text `Font size: N` and has the accessible name `Font size: N px`.

**FR-1303 — Open the drop-down (Must)**
Given the drop-down is closed, when the visitor clicks `#btn-fontsize`, or presses `Enter`, `Space` or `ArrowDown` with it focused, then `#fontsize-menu` (`role="menu"`) opens listing exactly the six presets in ascending order, `aria-expanded` becomes `true`, and keyboard focus moves to the item for the current size.

**FR-1304 — Selected and default state (Must)**
Given the drop-down is open, then each item is a `role="menuitemradio"` with the visible text `<N> px`; the current size has `aria-checked="true"` and a visible check mark, every other item has `aria-checked="false"`; the 14 item's text is `14 px (default)` regardless of selection.

**FR-1305 — Keyboard navigation (Must)**
Given the drop-down is open, when the visitor presses `ArrowDown`/`ArrowUp`, then focus moves to the next/previous item and stops at the ends (no wrap); `Home`/`End` focus the first/last item; `Enter` or `Space` selects the focused item.

**FR-1306 — Close without choosing (Must)**
Given the drop-down is open, when the visitor presses `Esc`, or clicks outside the menu and button, or presses `Tab`/`Shift+Tab`, then the menu closes, `aria-expanded` returns to `false`, the size is unchanged, and — for `Esc` and outside click — focus returns to `#btn-fontsize` (for `Tab` focus continues to the next/previous control in toolbar order). Clicking `#btn-fontsize` while the menu is open also closes it. While the menu is open, `Esc` is consumed by the menu and does not reach any other `Esc` handler (About dialog, Files pane, Symbols pane).

**FR-1307 — Select a size (Must)**
Given the drop-down is open, when the visitor selects a size by click, `Enter` or `Space`, then the editor's content and gutters adopt that size immediately without a reload, the menu closes, focus returns to `#btn-fontsize`, and the label updates per FR-1302.

**FR-1308 — Document state is preserved (Must)**
Given the editor has a caret, a selection, a scroll position and an undo history, when the size changes, then the document text, the selection ranges and the undo/redo history are unchanged, and the line that was first visible in the editor viewport is still visible afterwards.

**FR-1317 — Editor geometry follows the new size (Must)**
Given the size has changed, then within one animation frame the caret, selection highlight, active-line highlight and gutter width are laid out at the new metrics (typing a character places it at the caret; the gutter fits the widest line number without clipping).

**FR-1309 — Scope of effect (Must)**
Given any size is selected, then the computed `font-size` of `.cm-content` and `.cm-gutters` equals the size, and the computed `font-size` of the console, Files pane, Symbols pane, diagnostics list, stdin field, toolbar, notices, `Editing:` heading and CodeMirror tooltips is the same at every one of the six sizes.

**FR-1310 — No side effects on the program (Must)**
Given the size changes, then no editor transaction is dispatched, no autosave is scheduled, no lint run is requested, no worker message is posted and the stored program bytes are unchanged.

**FR-1311 — Persist on selection (Must)**
Given a size different from the stored one is selected, then `pyplay.fontsize.v1` is written synchronously with the canonical string (BR-1303). Selecting the already-current size performs no write and shows no notice.

**FR-1312 — Restore before first paint (Must)**
Given a canonical stored value exists, when the page loads, then the editor content and gutters are rendered at that size from the first paint of the editor; no frame is painted at the default size.

**FR-1313 — Invalid or absent stored value (Must)**
Given the key is absent, or holds a non-canonical value, or `localStorage` throws on read, when the page loads, then the size is 14 and a non-canonical value is left in place, not rewritten.

**FR-1314 — Storage write failure (Must)**
Given a write to `pyplay.fontsize.v1` throws, when a size is selected, then the size still applies for the session and `#notices` shows `Font size won't be remembered` once per page load (a second failed write in the same load shows no second notice).

**FR-1315 — Never inert (Must)**
Given any application state (loading, running, stdin-waiting, cross-origin-isolation banner showing, read-only non-UTF-8 file open — which reuses the same `EditorView`, per `setEditorReadOnly`), then `#btn-fontsize` is operable, is never `disabled`, is not marked `aria-disabled`, and a size change applies to the editor.

**FR-1316 — Layout fit (Must)**
Given a viewport of 900 px or wider in either layout, then the toolbar remains a single row with `#btn-fontsize` fully visible and no horizontal page scroll; given a viewport below 900 px (including 700 px and 375 px), then the toolbar may wrap per existing behaviour, the control is fully visible, and the page has no horizontal scroll. The drop-down opens fully inside the viewport (flipped/clamped if needed) in both layouts and both palettes.

## Business Rules

**BR-1301 — Closed preset list**
The valid sizes are exactly `12, 14, 16, 18, 20, 24` (CSS px); the default is `14`. *Rationale:* a closed set makes validation and tests exhaustive and keeps the drop-down short. *Exception:* none; changing the set is a spec change.

**BR-1302 — Presentation preference, not program state**
Font size is stored and applied independently of the workspace; it is not part of the program, is not touched by Reset, Format, Run or Stop, and cannot cause a program, lint or worker event.

**BR-1303 — Canonical storage form, superseded not migrated**
`pyplay.fontsize.v1` holds exactly one of the strings `12`, `14`, `16`, `18`, `20`, `24` — no units, JSON, whitespace or leading zeros. Anything else is absent and left in place. A future representation change takes a new key (`.v2`) and never reads `.v1`.

**BR-1304 — Allow-list lives twice**
The allow-list is duplicated in the render-blocking inline script in `index.html` and in `src/fontsize.ts`, as with the diagnostics-height regex (FR-910) and the theme allow-list (BR-505); they must change together and a unit test asserts they are equal.

**BR-1305 — Applied through one CSS variable, not an editor transaction**
The size is carried by a single document-level CSS custom property read by the editor's content and gutter rules, so applying it can neither dispatch a transaction nor re-create the `EditorView`. *Rationale:* guarantees FR-1308/FR-1310 structurally.

**BR-1306 — Existing conventions**
All user-visible strings live in `src/format.ts`. The control is never inert (FR-1315), so it uses neither `disabled` nor `setInert()`. It is reachable by keyboard in toolbar order. It adds no network request, worker message, cookie, IndexedDB or `sessionStorage` use.

**BR-1307 — Custom menu, not a native `<select>`**
The control is a button + custom menu because the issue specifies a button opening a list with a visible selected state, and a native `<select>` popup cannot be styled to the palettes or tested for contrast (NFR-1303) consistently across the browser matrix.

## Non-Functional Requirements

**NFR-1301 — Apply latency.** From the selecting event to the next painted frame showing the new size: ≤ 50 ms, with no single main-thread task > 50 ms, measured with the starter program loaded, in Chromium.

**NFR-1302 — Payload.** Against branch point `424e43c`, the feature adds ≤ 2 KiB to the gzip-compressed first-party payload, adds no precache URL, and leaves VC-053 / VC-323 / VC-326 / VC-513 passing with unchanged thresholds.

**NFR-1303 — Contrast.** In both palettes, the button, the open menu, every item (normal, focused, checked), and the check mark meet ≥ 4.5:1 text and ≥ 3:1 non-text contrast; `npm run audit:contrast` covers the menu open state and passes.

**NFR-1304 — Hit target.** The button and each menu item have a hit area ≥ 24 × 24 CSS px.

**NFR-1305 — Browser support.** Passes in the same Chromium e2e project as CI and in the pinned local matrix projects.

## Data & Interfaces

### Storage (amends the Storage surface of `docs/architecture.md`)

| Store | Key | Contents | Fallback |
|---|---|---|---|
| `localStorage` | `pyplay.fontsize.v1` | One of `12`,`14`,`16`,`18`,`20`,`24` as a raw string (BR-1303) | Absent → 14; non-canonical → 14, left in place (FR-1313) |

The origin then holds **six** things (the architecture doc's "exactly five" and
`CLAUDE.md`'s "exactly three `localStorage` keys" are updated by this change;
`CLAUDE.md` is already stale — it omits `pyplay.workspace.v1` and
`pyplay.diagnostics-height.v1`).

### Constants

| Name | Value | Used by |
|---|---|---|
| `FONT_SIZE_KEY` | `pyplay.fontsize.v1` | FR-1311–FR-1313 |
| `FONT_SIZES` | `[12, 14, 16, 18, 20, 24]` | BR-1301 |
| `FONT_SIZE_DEFAULT` | `14` | FR-1304, FR-1313 |

### Strings (`src/format.ts`)

| Constant | Text |
|---|---|
| `FONT_SIZE_LABEL(n)` | `Font size: N` (visible) |
| `FONT_SIZE_NAME(n)` | `Font size: N px` (accessible name) |
| `FONT_SIZE_ITEM(n)` | `N px`; for 14, `14 px (default)` |
| `FONT_SIZE_SAVE_FAILED` | `Font size won't be remembered` |

### DOM and CSS

| Element | id / attr | Contract |
|---|---|---|
| Button | `btn-fontsize` | `<button type="button">`; position per FR-1301 |
| Menu | `fontsize-menu` | `role="menu"`, `aria-labelledby="btn-fontsize"`, `hidden` while closed; six `role="menuitemradio"` children with `data-size="N"` |
| CSS variable | `--editor-font-size` | On `document.documentElement`, value `Npx`; read by `.cm-editor .cm-content` and `.cm-editor .cm-gutters` only; fallback `14px` |

Toolbar tab order becomes … `#btn-files` → `#btn-symbols` → `#btn-fontsize` → `#btn-theme` → `#btn-about` (amends spec-05 / spec-08). `#btn-about` remains last. No DOM node is re-parented.

### First paint

A second render-blocking inline `<script>` in `index.html` `<head>` reads
`pyplay.fontsize.v1`, validates against the allow-list and sets
`--editor-font-size` before any editor markup exists. Absent/invalid → sets nothing.

## Verification Criteria

| ID | Covers | Criterion |
|---|---|---|
| **VC-1301** | FR-1301 | `#btn-fontsize` is between `#btn-symbols` and `#btn-theme` in DOM and tab order; `#btn-about` is still the last toolbar control; attributes per FR-1301. |
| **VC-1302** | FR-1302 | At default the button text is `Font size: 14` and its accessible name `Font size: 14 px`; after choosing 20 they read `Font size: 20` / `Font size: 20 px`. |
| **VC-1303** | FR-1303 | Click, and separately `Enter`, `Space`, `ArrowDown` on the focused button, each open a menu of exactly 6 items `12…24` ascending with focus on the 14 item and `aria-expanded="true"`. |
| **VC-1304** | FR-1304 | With 18 selected: item 18 has `aria-checked="true"` + visible check; the other five `false`; the 14 item reads `14 px (default)`; with 14 selected the 14 item is both checked and labelled default. |
| **VC-1305** | FR-1305 | From 14: `ArrowDown` ×2 focuses 18; `ArrowUp` at 12 stays on 12; `ArrowDown` at 24 stays on 24; `Home`→12, `End`→24; `Enter` selects the focused item. |
| **VC-1306** | FR-1306 | `Esc` closes with size unchanged and focus on the button; outside click closes with size unchanged and focus on the button; `Tab` closes and focus lands on `#btn-theme`, size unchanged; clicking the open button closes the menu; with the menu open, `Esc` does not close an About dialog opened beforehand or toggle the Files/Symbols panes. |
| **VC-1307** | FR-1307 | Choosing 24 by click, and separately by keyboard, sets the editor size to 24 px with no navigation/reload, closes the menu, makes `document.activeElement` `#btn-fontsize` (never `<body>`), and updates the label. |
| **VC-1308** | FR-1308 | With a 200-line program, caret at line 120 col 5, selection `[a,b]`, 3 undo steps, editor scrolled so line 80 is first visible: after 14→24→12 the document text and selection ranges are identical, undo ×3 restores the original text, and line 80 is within the viewport. |
| **VC-1325** | FR-1317 | After 14→24, typing `x` inserts it at the caret; within one animation frame the caret's and a `.cm-line`'s heights match those of a page that loaded straight at 24 (stored `24`) within 2 px; the caret fits inside its line (its height ≤ the line's + 2 px — CodeMirror draws the caret at glyph height, which is below the line height at every size, so equality with the line height is not required); the gutter has `scrollWidth ≤ clientWidth` and no gutter element is clipped. |
| **VC-1309** | FR-1309 | At 24, computed `font-size` of `.cm-content` and `.cm-gutters` is `24px`; computed `font-size` of console, `#file-pane`, `#symbol-pane`, `#diagnostics-list`, `#stdin-input`, toolbar, `#notices`, `.editor-heading`, and an open completion tooltip equals its value at 14. |
| **VC-1310** | FR-1310, BR-1302 | Across a size change: zero editor transactions and zero lint requests (instrumented), no worker `postMessage`, `localStorage` program/workspace value byte-identical after 1 s (past the 500 ms autosave debounce), no console output. |
| **VC-1311** | FR-1311, BR-1303 | After choosing 20 the key holds exactly `20` immediately (no wait); choosing 20 again performs no `setItem` call. |
| **VC-1312** | FR-1312 | With stored `24`, a script injected before page scripts and a `MutationObserver` record, at the moment `.cm-content` is first inserted into the DOM, that `getComputedStyle(documentElement).getPropertyValue('--editor-font-size')` is `24px` and the `.cm-content` computed `font-size` is `24px`; the same holds at `DOMContentLoaded`. |
| **VC-1313** | FR-1313, BR-1303 | For each stored value — key absent, `15`, `016`, `16px`, ` 16`, empty string, `large` — and for a throwing `getItem`, the size is 14; each stored non-canonical value is still present, unchanged, after load. |
| **VC-1314** | FR-1314 | With `setItem` throwing for this key: choosing 18 applies it, shows exactly one notice `Font size won't be remembered`; choosing 20 applies it and shows no second notice. |
| **VC-1315** | FR-1315 | During a running program, while waiting on `input()`, with the COI banner showing, and with a non-UTF-8 file open, `#btn-fontsize` has no `disabled` and no `aria-disabled`, opens, and changes the size. |
| **VC-1316** | FR-1316 | At 1280, 900 px (both layouts) the toolbar is a single row and `scrollWidth ≤ clientWidth`; at 700 and 375 px the button is fully visible with no horizontal page scroll; the open menu's bounding box lies within the viewport at each width, in light and dark. |
| **VC-1317** | BR-1304 | Unit: the allow-list parsed from the inline script in `index.html` equals `FONT_SIZES`, and for every string in `{"0"…"100"}` plus `016`, `16px`, ` 16`, `""` the inline validator and the module validator return the same accept/reject result. |
| **VC-1318** | BR-1306 | The four strings of Data & Interfaces appear in `src/format.ts` and nowhere else in `src/` or `index.html`; opening, choosing and closing the menu issues zero network requests and zero worker messages; no `disabled` attribute appears on `#btn-fontsize` in any state of VC-1315. |
| **VC-1326** | BR-1306, BR-1303 | After exercising the whole app (run, edit, layout, theme, diagnostics resize, font size), the `localStorage` key set is a subset of the five documented keys and `sessionStorage`, cookies and IndexedDB are empty. |
| **VC-1327** | BR-1307 | The menu is built from the `#fontsize-menu` / `menuitemradio` structure of Data & Interfaces; no `<select>` element exists inside `header.toolbar`. |
| **VC-1319** | NFR-1301 | Selecting a size paints the new size within 50 ms with no task > 50 ms (Playwright performance trace, Chromium). |
| **VC-1320** | NFR-1302 | `npm run audit:perf` passes with unchanged thresholds; gzip first-party payload is ≤ 2 KiB above `424e43c` and the precache URL count is unchanged. |
| **VC-1321** | NFR-1303 | `npm run audit:contrast` covers button, open menu, focused and checked items in both palettes and passes. |
| **VC-1322** | NFR-1304 | Bounding box of the button and each menu item ≥ 24 × 24 CSS px. |
| **VC-1323** | NFR-1305 | `tests/e2e/fontsize.spec.ts` passes in `e2e-chromium` and, locally, in every pinned matrix project (`MATRIX=1 npm run test:matrix`) with no skips. |
| **VC-1324** | whole spec (acceptance) | End to end, in a fresh profile: open the menu with the keyboard, choose 20, confirm the editor is at 20 px and console/Files/Symbols text is unchanged, reload and confirm 20 px from first paint with label `Font size: 20`, then open the menu, choose 14, reload and confirm 14 px; the program text is byte-identical throughout. |

## Docs and tests to update with the change

- `docs/architecture.md`: Storage surface (five → six, new row and paragraph), a *Font size* section (CSS-variable mechanism, two-writer bootstrap, why no transaction), toolbar order, toolbar clustering text.
- `CLAUDE.md`: persisted-state bullet ("exactly three" is already stale) and the inline-bootstrap note.
- Existing tests whose expectations change: toolbar tab-order assertions (`presentation.spec.ts`, `toolbar-align.spec.ts`, `about.spec.ts`, `theme.spec.ts`), the storage-key-set assertion (`privacy.spec.ts` / `persistence.spec.ts`), geometry/payload baselines (re-record per `scripts/record-baselines.mjs`).
- New: `tests/unit/fontsize.test.ts` (VC-1313, VC-1317), `tests/e2e/fontsize.spec.ts` (each e2e test named after its VC).

## Deliberately excluded

- A numeric stepper, `+`/`−` buttons, or custom size entry.
- Scaling console/Files/Symbols text (separate requirement if wanted).
- A migration from any earlier key; there is none.
- Persisting the choice per file.

## Assumptions

- Gutter width is recomputed by CodeMirror on a size change; if it is not, the implementation must force a measure — FR-1317 is the requirement.
- Toolbar space at 900 px is sufficient for a ~120 px button given the existing `nowrap` + flex-shrink arrangement; VC-1316 is the gate, and if it fails the label may be shortened only by a spec change.

## Open Questions

None.
