# Spec 09 — Minimal Diagnostics Under Input (Vertical Layout)

| Field | Value |
|---|---|
| Version | 1.0.0 |
| Last Updated | 2026-09-05 |
| Status | DRAFT |
| Parent specs | `specs/04-toogle-pane-aspect-frozen.md`, `specs/01-static-python-web-frozen.md` |
| Issue | https://github.com/fclabs/web-python/issues/25 |

This child spec uses the `9xx` identifier range. Requirements restated from a
parent cite the parent's identifier (e.g. FR-409 from spec-04) and are not
renumbered.

---

## Purpose

In the two-column (`vertical`) layout the right column stacks console → stdin →
diagnostics. Today the diagnostics track takes a large share of free space
(`minmax(0, 0.66fr)` ≈ 40 % of the right column), so the Problems panel crowds
the console even when there are few or no findings. This spec makes that panel
**header-only by default** and lets the visitor **resize** the console /
diagnostics split with a pointer- and keyboard-accessible separator between the
console and the Input row. Students who care about program output keep the
console room; those who need the Problems list can enlarge it. The preference
is remembered on the origin.

## Scope

### In

- Default diagnostics height in `data-layout="vertical"` at ≥ 900 px: header-only
  (Problems title + live count), not the current `0.66fr` share.
- A `role="separator"` between the console panel and the stdin (Input) row that
  reallocates vertical free space between the console and the diagnostics panel
  (stdin stays content-sized).
- Pointer drag and keyboard adjustment with enforced min / max.
- Persistence of the chosen diagnostics height under a versioned `localStorage`
  key.
- Playwright coverage for default size, resize bounds, persistence, and tab /
  document-order invariants.
- `docs/architecture.md` update for the new key and separator.

### Out

- Changing stdin semantics or the stdin channel.
- Hide / collapse of the console or diagnostics (issue #21); this separator does
  not remove either panel.
- Changing the editor / right-column split (`LAYOUT_EDITOR_COLUMN` / FR-409's
  50–65 % band).
- Adding the same separator or minimal default to `horizontal` (stacked) layout;
  that layout keeps spec-01's `max-height: 25vh` on diagnostics unchanged.
- Changing lint behaviour, diagnostic entry content, or the Problems count
  semantics (FR-038 – FR-040 from spec-01).

## Actors

| Actor | Description | Permissions |
|---|---|---|
| Visitor | Anyone using the playground in a browser | Resize the diagnostics panel in vertical layout; preference stored only on this origin |
| Implementer | Engineer shipping this change | May add one `localStorage` key, one separator control, and CSS / layout wiring; must not reorder the four panels |

## Functional Requirements

**FR-901** — Minimal default (Must)

> **Given** a fresh load with no usable stored diagnostics height, `data-layout="vertical"`, and viewport width ≥ 900 px  
> **When** the playground paints  
> **Then** `.panel--diagnostics` is only tall enough to show its Problems header and live count (the panel title row, including padding), and no diagnostic entry or empty-state line is visible inside the panel's client area without scrolling the panel itself.

**FR-902** — Console receives freed space (Must)

> **Given** the state of FR-901  
> **When** the right column is measured  
> **Then** the diagnostics row is sized to that header-only minimum (it is not an `fr` fraction of free space), the console row is the column's flexible track (`minmax(80px, 1fr)` semantics from FR-409), and the console content-box height is at least 80 CSS px.

**FR-903** — Separator present in vertical layout (Must)

> **Given** `data-layout="vertical"` and viewport width ≥ 900 px  
> **When** the right column is shown  
> **Then** a control `#diag-resizer` with `role="separator"`, `aria-orientation="horizontal"`, and accessible name `Resize diagnostics panel` is visible between the console panel and the stdin panel, is reachable by sequential focus, and exposes `aria-valuemin` (FR-907 minimum), `aria-valuemax` (FR-908 maximum for the current viewport), and `aria-valuenow` (current diagnostics panel height) in CSS pixels; those three values are refreshed on layout change and on viewport resize.

**FR-904** — Pointer resize (Must)

> **Given** FR-903  
> **When** the visitor pointer-drags `#diag-resizer` upward or downward and releases  
> **Then** the diagnostics panel height grows or shrinks continuously with the drag, the console absorbs the complementary free space, the stdin panel's height is unchanged (still content-sized), and on release the height is clamped to the min / max of FR-907 / FR-908.

**FR-905** — Keyboard resize (Must)

> **Given** `#diag-resizer` is focused  
> **When** the visitor presses `ArrowUp` or `ArrowDown` (with `Shift` for a larger step)  
> **Then** the diagnostics height changes by 16 CSS px per press, or 48 CSS px with `Shift`, in the direction that grows diagnostics on `ArrowUp` and shrinks it on `ArrowDown`, clamped to FR-907 / FR-908, and `aria-valuenow` updates to the new height.

**FR-906** — Separator inert outside vertical wide layout (Must)

> **Given** `data-layout="horizontal"`, or viewport width &lt; 900 px  
> **When** the layout is effective  
> **Then** `#diag-resizer` is not visible, is made inert via `setInert()` (never the HTML `disabled` attribute), and every pointer and keyboard activation path is a no-op; the stacked diagnostics `max-height: 25vh` behaviour from spec-01 is unchanged.

**FR-907** — Minimum height (Must)

> **Given** a resize via FR-904 or FR-905  
> **When** the visitor attempts to shrink below the header-only size of FR-901  
> **Then** the diagnostics height stops at that header-only size and `aria-valuenow` equals that minimum.

**FR-908** — Maximum height (Must)

> **Given** a resize via FR-904 or FR-905, or a viewport / layout change while a height is applied  
> **When** the visitor attempts to grow diagnostics, or the current height no longer fits the bounds  
> **Then** the diagnostics panel height never exceeds 40 % of the right column's height (console top to diagnostics bottom, per FR-409), and the console never drops below FR-409's 80 px floor; whichever bound is hit first wins. A clamp caused only by viewport or layout change updates the in-memory height and `aria-valuenow` but does not rewrite `localStorage` until the visitor next commits a resize.

**FR-909** — Persist height (Must)

> **Given** a diagnostics height committed by pointer release (FR-904) or a keyboard step (FR-905) while vertical layout is effective  
> **When** the write succeeds  
> **Then** `localStorage['pyplay.diagnostics-height.v1']` holds exactly the canonical height string (FR-911) for that height in CSS px.

**FR-910** — Restore height (Must)

> **Given** a canonical stored height under `pyplay.diagnostics-height.v1`  
> **When** the playground loads (or returns to) `data-layout="vertical"` at ≥ 900 px  
> **Then** the diagnostics panel uses that height clamped into [FR-907, FR-908] for the current viewport, and first paint already reflects the clamped height (no flash of the old `0.66fr` share).

**FR-911** — Absent or invalid stored height (Must)

> **Given** the key is missing, `localStorage` throws on read, or the stored value is not a canonical height string  
> **When** vertical layout resolves on load  
> **Then** the diagnostics height is the FR-901 minimum; a non-canonical value is left in place and not overwritten until the visitor next commits a resize.

A **canonical height string** is a non-empty decimal integer matching `^[1-9][0-9]*$` (no sign, no leading zero, no units, no whitespace).

**FR-912** — Persist failure notice (Must)

> **Given** a committed resize whose `localStorage` write is rejected  
> **When** the failure is observed  
> **Then** the in-memory height still applies for the session, and the notice `Diagnostics height won't be remembered` is shown at most once per page load via the existing notices strip.

**FR-913** — Document order and panels unchanged (Must)

> **Given** any layout  
> **When** the separator is introduced  
> **Then** the four panels remain console → editor → stdin → diagnostics in document order with no re-parenting (BR-402 / FR-410); `#diag-resizer` is a non-panel sibling inserted immediately after the editor section and before the stdin section so sequential focus visits editor → separator → stdin → diagnostics when the separator is not inert (BR-407: console still has no tab stop).

**FR-914** — Layout / theme / lint orthogonality (Must)

> **Given** a resize or a stored-height restore  
> **When** the height is applied  
> **Then** editor document, caret, selection, undo, console buffer, worker / `runId`, pending stdin, diagnostics list contents, lint scheduling, layout preference, and theme preference are untouched; no autosave, worker message, or network request is caused by the resize alone.

## Business Rules

**BR-901** — Header-only means clipped body, not removed DOM  
The diagnostics list and empty-state nodes stay in the document at the minimal
height; they are simply not visible in the panel client area. Rationale: keep
FR-038's live count and list updates working without a second render mode.
Exception: none.

**BR-902** — Separator controls diagnostics height, not stdin  
Dragging or key-adjusting `#diag-resizer` changes only the diagnostics track
height; stdin remains `auto` / content-sized; console takes the remaining free
space subject to the 80 px floor. Rationale: matches the issue's target (the
bar under Input) while placing the affordance where the visitor expects a split
(between console and Input). Exception: none.

**BR-903** — One origin key, versioned, no migration  
Height is stored only under `pyplay.diagnostics-height.v1`. No cookie,
IndexedDB, `sessionStorage`, or network. A future incompatible encoding gets
`v2` and never reads `v1` (same supersede-don't-migrate rule as `pyplay.layout.v2`).
Exception: none.

**BR-904** — Horizontal layout is out of scope  
Stacked layout keeps `max-height: 25vh` and must not gain this separator.
Rationale: issue #25 is vertical right-column geometry only; a stacked
splitter is issue #21 territory. Exception: none.

**BR-905** — No `disabled` attribute  
`#diag-resizer` uses `setInert()` / `isInert()` when unavailable. Rationale:
spec-01 / spec-04 keyboard-reachability invariant. Exception: none.

**BR-906** — Persist failure degrades only this preference  
A rejected write does not block resize, run, lint, or other preferences
(instance of spec-01 BR-009). Exception: none.

## Non-Functional Requirements

| ID | Requirement | Threshold |
|---|---|---|
| **NFR-901** | Separator hit target | At least 8 CSS px tall along the full width of the right column; focus ring ≥ 3:1 against adjacent surfaces in both palettes |
| **NFR-902** | Contrast | Separator resting and hover/focus borders ≥ 3:1 in both palettes; no new text below 4.5:1 |
| **NFR-903** | Resize latency | From pointermove / keydown to the first frame reflecting the new height ≤ 50 ms; no new main-thread task &gt; 50 ms attributable to applying the height |
| **NFR-904** | Bundle / network | Feature adds ≤ 2 KB gzipped to the app payload vs this branch's merge-base; zero new runtime asset URLs; zero resize-triggered network requests |
| **NFR-905** | Geometry budgets | Existing VC-409 / VC-435 right-column and overflow criteria stay green; diagnostics still ≤ 40 % of the right column after any resize (FR-908) |
| **NFR-906** | Browsers | Every Must FR on the same matrix as spec-04 (NFR-406): Chrome / Edge / Firefox / Safari pinned pairs |

## Data & Interfaces

### Persisted state

Adds exactly one row to the playground's origin store:

| Store | Key | Contents | On read failure |
|---|---|---|---|
| `localStorage` | `pyplay.diagnostics-height.v1` | Canonical height string (FR-911): `^[1-9][0-9]*$`, CSS px of the diagnostics panel (e.g. `36`). No JSON, no units, no whitespace. | Treat as absent → FR-901 minimum. Non-canonical values treated as absent and left in place (FR-911). |

Still no cookies, no IndexedDB, no `sessionStorage` for this feature (BR-903).

Existing keys (`pyplay.program.v1`, `pyplay.layout.v2`, `pyplay.theme.v1`) are
untouched.

### Constants

| Constant | Value | Used by |
|---|---|---|
| `DIAG_HEIGHT_KEY` | `pyplay.diagnostics-height.v1` | FR-909 – FR-911 |
| `DIAG_HEIGHT_STEP` | `16` (CSS px) | FR-905 |
| `DIAG_HEIGHT_STEP_LARGE` | `48` (CSS px) | FR-905 (`Shift`) |
| `DIAG_HEIGHT_MAX_RATIO` | `0.40` of right-column height | FR-908 (same cap as FR-409) |
| `DIAG_CONSOLE_MIN` | `80` (CSS px) | FR-908 (same floor as FR-409) |

The header-only minimum (FR-901 / FR-907) is **content-derived** at runtime from
the Problems title row plus `.panel--diagnostics` padding — not a hard-coded
pixel constant — so font inflation cannot clip the count.

### User-visible strings

Live in `src/format.ts`, quoted verbatim:

| Constant | Value |
|---|---|
| `DIAG_RESIZER_LABEL` | `Resize diagnostics panel` (FR-903) |
| `DIAG_HEIGHT_SAVE_FAILED` | `Diagnostics height won't be remembered` (FR-912) |

### DOM contract

| Element | Id | Contract |
|---|---|---|
| Diagnostics resizer | `diag-resizer` | Non-panel sibling **immediately after** the editor `<section>` and **before** the stdin `<section>`. `role="separator"`, `aria-orientation="horizontal"`, `aria-label` = `DIAG_RESIZER_LABEL`, `aria-valuemin` / `aria-valuemax` / `aria-valuenow` in CSS px, `tabindex="0"` when available. Hidden + `setInert()` when FR-906 applies. |
| Diagnostics panel | existing `.panel--diagnostics` | Unchanged markup and ARIA label; height driven by a CSS custom property (e.g. `--diagnostics-height`) when vertical layout is effective. |
| App root | `app` (existing) | No new `data-*` for this feature; layout attribute semantics unchanged. |
| Notice strip | `notices` (existing) | Reused for FR-912. |

Grid: under `#app[data-layout='vertical']` the right column gains a separator
track between console and stdin. Every vertical `grid-template-areas` variant
(plain, symbols open, files open, both open) includes that track; the separator
is never placed inside the editor, files, or symbols columns. Document order of
the four panels does not change (FR-913).

### Modules

- A dedicated helper (e.g. `src/diag-resize.ts`) owns load / save / clamp of the
  height, unit-testable without a DOM, reusing `StorageLike` /
  `getLocalStorage()` from `src/storage.ts`.
- Pointer and keyboard wiring may live beside that helper or in `src/main.ts`;
  mirror the `#file-resizer` patterns in `src/file-pane.ts` (capture, arrows,
  shift step) without coupling to the files pane.
- **First paint (FR-910):** a render-blocking inline bootstrap in `index.html`
  (theme precedent) reads `pyplay.diagnostics-height.v1` and, when the value is
  canonical, sets the diagnostics height custom property before CSS paint.
  When the key is absent or non-canonical, CSS alone defaults the vertical
  diagnostics track to the header-only minimum — never to an `fr` share.

### Reused interfaces

- `setInert` / `isInert` from `src/controls.ts`
- `Notices.show` from `src/notices.ts`
- `StorageLike` / `getLocalStorage` from `src/storage.ts`
- No change to `src/protocol.ts`, the worker, stdin channel, lint engine, or
  layout resolver semantics (`resolveLayout` unchanged)

### Docs

`docs/architecture.md` records the new key, the separator's role, and that the
vertical diagnostics default is header-only rather than a `0.66fr` track.

## Verification Criteria

**VC-901** (FR-901, FR-902, BR-901): Fresh vertical load, no height key, viewport ≥ 900 × 700, with at least one seeded diagnostic and with the empty state visible in turn → diagnostics client height equals the header-only minimum (±2 px); neither `.diagnostic-entry` nor `#diagnostics-empty` intersects the panel's visible client rect; those nodes remain in the document; console content-box height ≥ 80 px; diagnostics height / right-column height ≤ 0.15.

**VC-902** (FR-903, FR-913): In vertical ≥ 900 px, `#diag-resizer` is visible between console bottom and stdin top (±2 px), has the ARIA contract of FR-903, and document order of panel `aria-label`s remains Special characters (if present) → Console → Editor → Standard input → Diagnostics → Files (if present); the resizer is not a `.panel`.

**VC-903** (FR-904, FR-908): Pointer-drag `#diag-resizer` upward until clamp → diagnostics height ≤ 40 % of right-column height and console height ≥ 80 px; `aria-valuenow` matches the panel height (±1 px).

**VC-904** (FR-904, FR-907): Pointer-drag downward until clamp → diagnostics height equals the FR-901 minimum (±2 px); further drag does not shrink it.

**VC-905** (FR-905): With `#diag-resizer` focused, one `ArrowUp` grows height by 16 px (clamped); `Shift+ArrowUp` by 48 px (clamped); `ArrowDown` / `Shift+ArrowDown` shrink symmetrically.

**VC-906** (FR-906, BR-904): In `horizontal` layout and at 375 × 667, `#diag-resizer` is not visible and is inert; diagnostics retains `max-height: 25vh` behaviour; activating the resizer (if force-focused) changes no heights.

**VC-907** (FR-909, FR-910): Resize to a mid-range height, reload with vertical preference → same height (±2 px) on first paint; `localStorage['pyplay.diagnostics-height.v1']` is the canonical integer string.

**VC-908** (FR-910, FR-908): Store a height larger than the current viewport's max → on load the panel uses the clamped max, not the raw stored value; the key is not rewritten until the visitor commits a new resize.

**VC-909** (FR-911): Missing key, `localStorage.getItem` throwing, and stored values `""`, `0`, `036`, `12.5`, `40%`, `tall`, `-1` each yield the FR-901 minimum; non-canonical values remain unchanged in the store.

**VC-910** (FR-912): With `localStorage.setItem` throwing, a resize still applies in memory and the exact notice `Diagnostics height won't be remembered` appears once; a second resize in the same load does not duplicate it.

**VC-911** (FR-914, BR-905): Across a drag and a keyboard step, editor value, console text, diagnostics count text, and `pyplay.layout.v2` / `pyplay.theme.v1` are unchanged; no request is issued; `#diag-resizer` never carries the `disabled` attribute.

**VC-912** (NFR-901 – NFR-905): Separator hit height ≥ 8 px; contrast audit includes the separator states; apply-height cost ≤ 50 ms paint / ≤ 50 ms longest task under a 50-diagnostic list; app-payload gzipped delta ≤ 2 KB vs merge-base; VC-409 column floors and VC-435 overflow checks still pass with the resizer present.

**VC-913** (end-to-end): Vertical ≥ 900 px, seed three diagnostics → header-only default hides entry text → keyboard-enlarge until one entry is visible → reload restores that height → switch to Horizontal (resizer gone, `25vh` cap) → switch back to Vertical (restored height) → narrow below 900 px (resizer inert, stacked rules) → widen again (restored height).

## Open Questions

None — issue #25's three open questions are resolved in this draft:

1. Minimal default → header-only (FR-901 / BR-901).
2. Persistence → `pyplay.diagnostics-height.v1` (FR-909 / BR-903).
3. Splitter → between console and Input; controls diagnostics height (FR-903 / BR-902).

## Assumptions

- **A-901**: The FR-409 diagnostics cap (40 % of the right column) and console floor (80 px) remain the resize max / console min; the issue's "sensible bounds" are those existing rules, not new numbers.
- **A-902**: Content-derived header-only minimum is acceptable to test with a ±2 px tolerance (font metrics differ across the CI matrix).
- **A-903**: Issue #21 may later share or replace this separator; until then this control only resizes, never hides, either panel.
