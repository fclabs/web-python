# Frozen: Horizontal / Vertical Pane Layout

Source: `specs/04-toogle-pane-aspect.md` (v1.2.0)
Status: SHIPPED
Frozen: 2026-09-02
PR / commit: https://github.com/fclabs/web-python/pull/10 (`e88a0a1`)
Parent: `specs/01-static-python-web-frozen.md`
Siblings: `specs/03-vertical-pane-frozen.md`, `specs/05-dark-mode-frozen.md`

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

## What it does

- `#layout-group` sits in the toolbar immediately after `#btn-reset`: a `role="radiogroup"` named `Layout` with radios `Horizontal` then `Vertical`. Exactly one radio is `aria-checked="true"` and it names the **effective** layout, never a stored preference the override is hiding.
- At ≥ 900 px, activating a radio (pointer, Enter, Space, or the arrow / `Home` / `End` keys of the single tab-stop) applies that layout to `#app[data-layout]`, moves `aria-checked`, and writes the bare string to `pyplay.layout.v2`. The group is one tab stop; arrows wrap and check; `Home` checks `Horizontal`; `End` checks `Vertical`.
- `horizontal` is spec-01's stacked layout (pixel-identical ±1 px on panel declarations, `max-height: 25vh` on diagnostics). `vertical` is two columns: editor full-height on the left; console, stdin and diagnostics stacked on the right. Toolbar, COI banner, status bar and notices stay full-width rows. Columns are CSS grid placement only — document order is always console, editor, stdin, diagnostics; no panel is moved, re-parented, cloned or re-created.
- Effective layout: `horizontal` if `W < 900`; else the stored preference if present; else `vertical`. Unset tracks the viewport via `matchMedia('(min-width: 900px)')` `change` (no debounce, no `resize` listener) and writes nothing. Stored `vertical` survives the narrow override and is restored on widen.
- Below 900 px the group is `aria-disabled` via `setInert()`, stays in the tab order (never the `disabled` attribute), every interaction is a no-op, and it exposes `Vertical layout needs a window at least 900 px wide` via `title` and `aria-describedby`.
- First paint already carries the resolved `data-layout`. A non-canonical stored value or a throwing `localStorage` read is treated as absent and left in place. A rejected write still applies the layout for the session and shows `Layout preference won't be remembered` at most once per load.
- A switch preserves editor document, caret, selection, undo, `EditorView` instance and first-visible document line; console buffer and follow/scroll; the running worker and `runId`; pending stdin; and diagnostics (no lint). It schedules no autosave, sends no worker message, issues no network request, and paints in one frame with no CSS transition.

## Public interfaces / data

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

## Key decisions

- **Names describe the divider, not the panel axis** (amendment 7): `horizontal` is stacked (horizontal rules); `vertical` is two columns (a vertical rule) — `vim`'s `:split` / `:vsplit`, not `tmux`'s `split-window -h`. `src/layout.ts` is normative. v1.0.0 used the other convention, so the key is `pyplay.layout.v2`; a two-value enum is superseded, never migrated (BR-403).
- **Presentation only** (BR-401): a switch mutates `data-layout`, the checked radio, and at most the `pyplay.layout.v2` write. It never touches the editor buffer, undo, console, diagnostics, stdin or the worker.
- **Fixed document order** (BR-402): columns are `grid-template-areas` / `grid-area`. Re-parenting would drop CodeMirror focus/selection and would zig-zag sequential focus (WCAG 2.1 SC 2.4.3).
- **One persisted key, origin-only** (BR-403): bare `horizontal` | `vertical` under `pyplay.layout.v2`. No cookie, IndexedDB, session storage or network request.
- **Stacked is the only layout below 900 px** (BR-404): two columns at 375 px give each panel ~180 px, which would break FR-047. 900 px is the width at which a 50–65 % split still leaves both columns ≥ 320 px. The stored preference is never overwritten.
- **Unset tracks the viewport; a choice is sticky** (BR-405): the heuristic exists only in the absence of a stored value.
- **Persist failure degrades this feature only** (BR-406): instance of spec-01 BR-009; the one-per-load notice follows the autosave-failure precedent.
- **Console has no tab stop** (BR-407): with the console skipped, sequential focus visits the left column then the right, matching visual order in both layouts. A future console tab stop must re-verify SC 2.4.3.

## Known limits (still true at freeze)

- **375 × 667** (NFR-401): for unset, `horizontal` and `vertical` stored, `scrollWidth` ≤ 375 px; toolbar, status bar, console, editor, stdin, Send EOF and diagnostics unclipped; each radio hit area ≥ 32 × 32 px.
- **Contrast** extends spec-01 in both palettes: radio labels (checked, unchecked, disabled) ≥ 4.5:1 (NFR-402); segment borders, checked indicator, focus ring, disabled border and the vertical column edge ≥ 3:1 (NFR-403).
- **Switch latency** (NFR-404): ≤ 100 ms from activating event to the first frame of the new geometry (500-line program, 5 000 console lines, 50 diagnostics); no new main-thread task longer than 100 ms; zero network requests.
  - **As CI asserts it (amended 2026-09-02)**: ≤ 100 ms remains the reference-profile expectation, where a switch paints in ~15 ms. On a GitHub-hosted `ubuntu-latest` runner under this criterion's own load, VC-426 measured a 110 ms paint once and a single 241 ms main-thread task once, each on a first attempt that passed on retry. It is asserted there at **250 ms** to paint and **500 ms** for a main-thread task. FR-425's "no transition or animation on any panel" is still asserted exactly, and it is what makes the switch one frame; the loosened numbers are the runner's share, not the layout's. Recorded in issue #13.
- **Budget** (NFR-405): ≤ 2 KB gzipped against commit `98ee032` (spec-01 + spec-03 + spec-05 — not `384cb70`); zero extra requests; zero new runtime assets. Measured at ship: **1.62 KiB**. Amended by spec-06: that measurement is immutable rather than re-run against future whole-app builds; VC-429 retains file-set, vendored-asset, manifest-count, and cache-name checks, while spec-01's 15 MB total gate remains live.
- **Browsers** (NFR-406): every Must FR on Chrome 141/140, Edge 141/140, Firefox 145/144, Safari 26.1/26.0.
- **Toolbar position (amendment 1)**: `#layout-group` is immediately after `#btn-reset` and is followed by `#btn-symbols` (then `#btn-theme`). The DOM-contract phrase "last child of `header.toolbar`" did not ship — spec-03's VC-301 already owns last-control.
- **Right-column overflow (amendment 4)**: "scrolls as a whole" is each right-column panel scrolling its own overflow. The three are not adjacent siblings (FR-410), so they cannot share a wrapper without the reorder BR-402 forbids.
- **Pane-open geometry (amendment 5)**: FR-409's ≥ 320 px columns are asserted with the symbols pane **closed**. The pane keeps its full-height inline-end column in both layouts; its 72 px plus gap eats into the right column at the 900 px floor and that is spec-03's geometry.
- **VC-408's baseline (amendment 6)**: FR-407's ±1 px is asserted against a recorded measurement of the `384cb70` build, and the two numbers FR-401 is allowed to move — the header block's height and the toolbar's — are text metrics. The same build measures an 82 px header on a GitHub `ubuntu-latest` runner and 84 px in the Playwright Linux image, so a record made anywhere else reports a font as a layout regression; it is what made VC-408 red on CI while the tree passed locally. The record therefore has to come from the environment comparing against it: CI builds `384cb70` and records its own before the suite runs (`scripts/record-baselines.mjs`), and a record from another environment *skips*. Within a run, the header block's height is still the only number allowed to differ, and the column is asserted to lose exactly that much and no more.
- **Parent amendments** (recorded here, not in spec-01's frozen capsule): VC-050 runs at 375 px for all three preference states; VC-051 / VC-071 sampling sets gain the layout control (and the vertical column edge); VC-052 tab-order gains exactly one stop for `#layout-group` after `Reset`, identical in both layouts. Live equivalents: `docs/architecture.md` storage table and `tests/e2e/presentation.spec.ts`.

## Deliberately excluded

- A draggable splitter or any resize handle; collapsing, hiding, detaching, reordering or maximising panels; a third layout (grid-of-four, editor-on-the-right, tabbed console); a visible "auto" option; remembering the layout per viewport size.
- Changing the `horizontal` layout or the document order of the panels; colour-mode selection (spec-05); syncing the preference across devices; any change to execution, the worker protocol, stdin, lint, format, the service worker or the deployment shape.
