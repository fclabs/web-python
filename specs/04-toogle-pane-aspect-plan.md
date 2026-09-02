# Implementation Plan: Horizontal / Vertical Pane Layout

**Spec**: [`specs/04-toogle-pane-aspect.md`](./04-toogle-pane-aspect.md) (v1.0.0, **READY**)
**Baseline commit for all comparisons**: `384cb70`

The playground gains a toolbar segmented control that switches `#app` between
the shipped vertical stack and a two-column horizontal layout (editor left;
console, stdin and diagnostics right), remembering the choice in
`localStorage['pyplay.layout.v1']`. The layout is pure presentation — a
`data-layout` attribute plus CSS grid placement, with no DOM reordering, no
worker message and no autosave or lint work (BR-401, BR-402). Below 900 px the
vertical layout is the only layout and the control is inert but focusable
(BR-404, FR-415).

Five iterations, ordered so the pure logic lands first, then the geometry (which
can be exercised by setting `data-layout` directly), then the control that
drives it, then the state-preservation guarantees, then the cross-cutting
non-functional sweep and the docs.

---

## Iteration 1: The resolver module and its strings

**Goal**: Ship `src/layout.ts` — the pure preference/resolution logic — plus the
verbatim user-visible strings, fully unit-tested and with no UI change.

**Scope** (spec: *Data & Interfaces / New module*, *Constants*, *User-visible strings*)

- New `src/layout.ts` exporting exactly the contract in the spec:
  - `export type Layout = 'vertical' | 'horizontal'`
  - `LAYOUT_KEY = 'pyplay.layout.v1'`, `LAYOUT_MIN_WIDTH = 900`,
    `LAYOUT_EDITOR_COLUMN = '58%'`, `LAYOUT_MIN_HEIGHT = 520`
  - `loadLayoutPreference(storage: StorageLike | null): Layout | null` — strict
    equality against the two literals; anything else, and any throw from
    `getItem`, returns `null` and rewrites nothing (FR-417).
  - `saveLayoutPreference(storage: StorageLike | null, l: Layout): boolean` —
    writes the bare string, returns `false` on any rejection instead of
    throwing (FR-414, FR-418).
  - `resolveLayout(pref: Layout | null, viewportWidth: number): Layout` — the
    single rule of FR-411: `vertical` if `width < 900`, else `pref`, else
    `horizontal`.
- `StorageLike` / `getLocalStorage()` imported from `src/storage.ts` unchanged;
  no edit to `src/storage.ts`.
- The five strings added to `src/format.ts` as `LAYOUT_LABEL`,
  `LAYOUT_VERTICAL`, `LAYOUT_HORIZONTAL`, `LAYOUT_NARROW_HINT`,
  `LAYOUT_SAVE_FAILED`, quoted verbatim from the spec.
- New `tests/unit/layout.test.ts`.

**Success criteria**

- VC-411 (unit half): `resolveLayout` returns `vertical` for widths 0, 374,
  375, 899 with every preference value; returns the preference at 900 and 1280
  when one is given; returns `horizontal` at 900 and 1280 when the preference
  is `null`.
- VC-417 (unit half): `loadLayoutPreference` returns `null` for `''`,
  `' vertical'`, `'Horizontal'`, `'"horizontal"'`, `'{"layout":"horizontal"}'`,
  `'diagonal'`, a 1 MB string, and for a stub whose `getItem` throws — and the
  stub records **no** `setItem` call in any of those cases. Returns
  `'vertical'` / `'horizontal'` for exactly those two byte strings.
- VC-414 (unit half): `saveLayoutPreference` calls `setItem` once with key
  `pyplay.layout.v1` and a value that is exactly `vertical` or `horizontal`
  (10 or 8 chars, no quotes, no whitespace), returns `true`; returns `false`
  without throwing when `setItem` throws and when `storage` is `null`.
- `npx vitest run tests/unit/layout.test.ts` passes; `npm run build` (which
  runs `tsc --noEmit`) succeeds.
- `git diff --stat` touches only `src/layout.ts`, `src/format.ts`,
  `tests/unit/layout.test.ts` — nothing is imported into `main.ts` yet, so the
  running app is byte-identical in behaviour.

**Commit message**: `feat(layout): add the layout preference resolver and its strings`

---

## Iteration 2: The two layouts and first-paint resolution

**Goal**: Render both layouts from `#app[data-layout]`, resolved before the
first paint and tracking the 900 px breakpoint — with no control yet.

**Scope** (spec: FR-407–FR-413, FR-416, FR-417, BR-402, BR-404, BR-405)

- `src/styles.css`: keep the current `.app` flex column as the
  `data-layout="vertical"` rendering, untouched in its ratios, minimums and the
  `max-height: 25vh` diagnostics cap (FR-407). Add a `@media (min-width: 900px)`
  block that, for `#app[data-layout='horizontal']` only, switches `.app` to a
  grid with `grid-template-areas` placing toolbar / COI banner / status bar /
  notices as full-width rows above a two-column split, the editor panel in the
  left column (`58%` per `LAYOUT_EDITOR_COLUMN`) and console / stdin /
  diagnostics stacked in the right column in that order (FR-408, FR-409). The
  media query mirrors the resolver so CSS can never paint two columns the
  resolver did not choose (*Constants*).
- Right-column internals for the horizontal layout: console flexes to fill,
  diagnostics capped at `40%` of the right column's block size instead of
  `25vh`, console floor of 80 px; below `520px` viewport height
  (`LAYOUT_MIN_HEIGHT`) the right column scrolls as a whole (FR-409, VC-435).
- No transition or animation on any panel size/position property in either
  layout (FR-425).
- `src/main.ts`: at the top of `boot()`, before the editor is created, read the
  preference and set `document.getElementById('app').dataset.layout =
  resolveLayout(pref, window.innerWidth)`. The entry script is a `type="module"`
  script, so this runs after parse and before the first paint (FR-416) — no
  inline script, no flash of the other layout.
- Subscribe to `matchMedia('(min-width: 900px)')` `change` and re-resolve
  synchronously in the handler. No `resize` listener, no debounce, no storage
  write on a resize (FR-412, FR-413, BR-405).
- New `tests/e2e/layout.spec.ts` — this iteration's criteria drive `data-layout`
  either through the stored preference or by `page.evaluate` setting the
  attribute, since no control exists yet.
- New `tests/e2e/layout-baseline.json` (or equivalent fixture) holding the panel
  bounding boxes captured from the baseline build of `384cb70` at 1280×800 and
  375×667, with a short note in the spec file's own test recording how it was
  produced (`git worktree` at `384cb70`, `npm run build`, measure, dump).

**Success criteria**

- VC-408: vertical-layout panel boxes at 1280×800 and 375×667 match the
  `384cb70` fixture within ±1 px per edge, and the diagnostics panel's computed
  `max-height` resolves to `25vh` in both builds.
- VC-409: at 1280×800 with `data-layout="horizontal"` the editor box is
  entirely inline-start of the console, stdin and diagnostics boxes; those
  three share an inline-start edge in that block order; the editor's block size
  equals their span plus gaps (±1 px); toolbar, COI banner, status bar and
  notices each span the full app content width.
- VC-410: at 1280×800, 1024×800 and 900×800 the editor column is 58 % of app
  content width (±1 px), both columns ≥ 320 px,
  `document.documentElement.scrollWidth ≤ innerWidth`, diagnostics block size
  ≤ 40 % of the right column, console block size > 0.
- VC-435: at 1280×500 and 900×420 the console's block size is ≥ 80 px, every
  stdin control and at least one diagnostics entry is reachable by scrolling
  the right column only, and `scrollWidth ≤ innerWidth` at both sizes.
- VC-411 (DOM half): `#app`'s element children read in order are identical at
  both `data-layout` values and are console, editor, stdin, diagnostics.
- VC-402 (attribute half): load at 1280 px with no preference →
  `data-layout="horizontal"`; reload at 800 px → `vertical`; `localStorage`
  gains no `pyplay.layout.v1` key in either case.
- VC-412: with no preference, load at 1280 px, resize to 899 px → `data-layout`
  is `vertical` within 100 ms; resize to 900 px → `horizontal` within 100 ms;
  the key is still `null` after both.
- VC-413 (resolution half): store `horizontal`, load at 1280 px → horizontal;
  resize to 375 px → `vertical`, stored value still exactly `horizontal`,
  `scrollWidth ≤ 375`; resize back to 1280 px → horizontal again with no
  interaction; reload at 375 px → vertical, stored value unchanged.
- VC-416: with `horizontal` stored, a document-start `MutationObserver` on
  `#app`'s attributes plus a read inside the first `requestAnimationFrame` sees
  `horizontal` in that first frame and records no later `data-layout` change;
  same with `vertical` stored; the first-frame screenshot matches the settled
  layout in both cases.
- VC-417 (page half): for each malformed stored value, load at 1280 px →
  `data-layout="horizontal"`, the stored bytes are unchanged, no notice is
  shown, and no console error or unhandled rejection is recorded; with
  `diagonal` stored at 800 px → `vertical`.
- VC-418: with `localStorage.getItem` and `setItem` made to throw, load at
  1280 px → the page reaches its ready state, `data-layout="horizontal"`, Run
  executes `print("ok")`, no uncaught exception.
- `npx playwright test --project=chromium tests/e2e/layout.spec.ts` passes; the
  spec-01 presentation suite (`--grep "VC-050|VC-052"`) still passes.
- Stopping here leaves a working app: the layout is chosen automatically and
  nothing is half-wired.

**Commit message**: `feat(layout): render a horizontal two-column layout resolved before first paint`

---

## Iteration 3: The toolbar control

**Goal**: Add the segmented radiogroup that selects and persists the layout,
including its keyboard model, its narrow-viewport inert state and the
save-failure notice.

**Scope** (spec: FR-401–FR-406, FR-414, FR-415, FR-418, BR-403, BR-406, BR-407)

- `index.html`: `#layout-group` as the last child of `header.toolbar`,
  immediately after `#btn-reset` — `<div role="radiogroup" aria-label="Layout">`
  containing `#layout-vertical` and `#layout-horizontal`, both
  `<button type="button" role="radio">` with the verbatim labels, in that
  order. Plus the visually hidden element `#layout-narrow-hint` that
  `aria-describedby` targets for FR-406. No panel markup changes.
- `src/main.ts`: wire the group.
  - `aria-checked` always reflects the **effective** layout, never a stored
    preference that the narrow override is currently masking (FR-402).
  - Roving tabindex: exactly one radio has `tabindex="0"` — the checked one —
    the same model spec-01 uses for the diagnostics panel (FR-405).
  - Pointer, `Enter` and `Space` activation applies the layout and persists it;
    `ArrowRight`/`ArrowDown` and `ArrowLeft`/`ArrowUp` move focus, check, apply
    and persist, both wrapping; `Home` → `Vertical`, `End` → `Horizontal`
    (FR-403, FR-404, FR-405). Arrow and `Home`/`End` handling calls
    `preventDefault()` so no activation scrolls the page (VC-406).
  - `setInert()` from `src/controls.ts` on the group and both radios below
    900 px — never the `disabled` attribute — and every activation and
    navigation path guarded by `isInert()` so it is a strict no-op: focus,
    `aria-checked`, `data-layout` and storage all unchanged (FR-415).
  - Below 900 px, `#layout-group` carries `title` and `aria-describedby`
    reading exactly `Horizontal layout needs a window at least 900 px wide`;
    both are removed at ≥ 900 px (FR-406).
  - A rejected write shows `Layout preference won't be remembered` via the
    existing `Notices` class, at most once per page load, and still applies the
    layout (FR-418, BR-406).
- The `matchMedia` handler from iteration 2 now also refreshes the control's
  checked state, inertness, hint and roving tabindex.
- `tests/e2e/layout.spec.ts` extended.

**Success criteria**

- VC-401: the last child of `header.toolbar` is `#layout-group`, role
  `radiogroup`, accessible name exactly `Layout`, containing exactly two
  `role="radio"` elements named `Vertical` then `Horizontal`.
- VC-402 (full): the radio with `aria-checked="true"` is the effective layout's
  in both the 1280 px and 800 px loads, and exactly one radio is checked at all
  times.
- VC-403 / VC-404: clicking each radio sets `#app`'s `data-layout`, moves
  `aria-checked`, and stores exactly `horizontal` / `vertical`.
- VC-405: `Tab` lands on the checked radio, which is the only one with
  `tabindex="0"`; `ArrowRight`, `ArrowDown`, `ArrowLeft`, `ArrowUp` each move,
  check, apply and persist, wrapping in both directions; `Home` checks and
  applies `Vertical`, `End` `Horizontal`.
- VC-406: `Space` and `Enter` on each radio apply and persist that layout, and
  `window.scrollY` is unchanged by every activation.
- VC-407: tabbing from load reaches Run, Stop, Clear console, Copy code,
  Format, Reset, `#layout-group` (**exactly one** stop), the editor, the stdin
  field, Send EOF and the diagnostics entries, each with a visible focus ring;
  the enumerated order is identical at both `data-layout` values.
- VC-414: at 375×667 the group and both radios have `aria-disabled="true"`,
  `isInert()` is true, `Tab` reaches the group exactly once with a visible focus
  ring, the `disabled` attribute is absent; and after each of click on
  `Horizontal`, `ArrowRight`, `ArrowLeft`, `ArrowDown`, `ArrowUp`, `Home`,
  `End`, `Space`, `Enter`: `document.activeElement` is still the `Vertical`
  radio, `data-layout` is still `vertical`, `aria-checked` is still on
  `Vertical`, and the stored key is still `null`.
- VC-415: at 375×667 the group's `title` is exactly the hint string, its
  `aria-describedby` resolves to an element with that same text, and the
  accessibility tree reports it as the group's description; at 1280×800 the
  group is not `aria-disabled` and that string is absent from the document.
- VC-419: with `setItem` rejecting and `getItem` working, three successive
  clicks each apply the layout, exactly one `Layout preference won't be
  remembered` notice is present after all three, and Copy code, Format, Run and
  stdin still behave per spec-01.
- VC-430: after selecting each layout twice and reloading, `sessionStorage`,
  cookies and `indexedDB.databases()` match the pre-change snapshots, and
  `localStorage`'s keys are exactly `pyplay.program.v1` and `pyplay.layout.v1`.
- VC-431: at `data-layout="horizontal"`, the tab-order enumeration of focusable
  elements inside `#app`'s panels contains nothing from the console panel and
  reads editor, stdin field, Send EOF, then the diagnostics entries.
- `npx playwright test --project=chromium tests/e2e/layout.spec.ts` passes.

**Commit message**: `feat(layout): add the toolbar layout control with its keyboard and inert states`

---

## Iteration 4: Session state across a switch

**Goal**: Prove — and where A-403 does not hold, make true — that a switch
preserves every piece of session state and costs nothing beyond a repaint.

**Scope** (spec: FR-419–FR-426, BR-401, NFR-404)

- `tests/e2e/layout-state.spec.ts` covering VC-420 through VC-426 and VC-434.
- Test-observability hooks only where a criterion needs one and none exists —
  e.g. a counter the linter's `schedule` increments for VC-424, and exposure of
  the `EditorView` reference for VC-420 (reuse whatever spec-01's suites
  already expose before adding anything).
- If a pinned browser drops the editor's scroll position or CodeMirror's
  measurement across the grid change, add an explicit post-switch re-measure
  that restores the **document position** of FR-426 — never a pixel offset, and
  never a document reorder (A-403, BR-402).
- Confirm by code inspection and by the VC-425 instrumentation that the switch
  path calls neither `Autosaver.schedule`/`flush` nor `Linter.schedule`, and
  sends no `postMessage`.

**Success criteria**

- VC-420: after a switch each way, document text, caret offset, selection
  range, undo depth, rendered marker ranges are unchanged, the `EditorView` is
  the same object, and `Ctrl/Cmd+Z` still undoes the same edit.
- VC-421: the console's text is byte-identical across a switch, the truncation
  marker state is unchanged, a bottom-pinned console is still pinned
  (`scrollTop + clientHeight === scrollHeight ±2 px`) and still auto-follows;
  a console scrolled so line 100 is first still shows line 100 first and does
  not auto-follow.
- VC-422: switching twice mid-run leaves `0`–`29` printed exactly once each in
  order, `Program finished in N.NN s` present, Run disabled and Stop enabled
  throughout, and no worker replacement (no second `Python … ready`, no
  `Restarting Python…`).
- VC-423: an unsubmitted `hola` survives two switches with the field enabled and
  the caret at offset 4 and the read still blocked; a switch between two reads
  still yields `hola chau`.
- VC-424: entries, order and count unchanged across two switches, the linter's
  schedule hook records no call, and clicking the second entry still reveals its
  line.
- VC-425: with instrumented `setItem` and `Worker.prototype.postMessage`, a
  keystroke followed 100 ms later by two switches produces `setItem` calls only
  for `pyplay.layout.v1`, the `pyplay.program.v1` write still landing 500 ms
  after the keystroke and not sooner, zero `postMessage` calls, zero network
  requests.
- VC-426: with 500 editor lines, 5 000 console lines and 50 diagnostics, each
  switch paints ≤ 100 ms after the activating event, no main-thread task
  exceeds 100 ms, no transition or animation event fires on any `.panel`, zero
  network requests.
- VC-434: with a 200-line wrapping program scrolled to line 120, after each
  switch `posAtCoords` at the editor viewport top resolves inside line 120 or
  earlier within it, line 120 is fully visible and line 119 is not.
- `npx playwright test --project=chromium tests/e2e/layout-state.spec.ts` passes.

**Commit message**: `test(layout): verify session state, cost and scroll position survive a switch`

---

## Iteration 5: Non-functional sweep, parent amendments and docs

**Goal**: Close the accessibility, viewport, bundle-budget and browser-matrix
criteria, apply the four parent-spec amendments, run the full regression suite,
and ship every documentation change.

**Scope** (spec: NFR-401–NFR-406, *Parent-spec amendments*, VC-427–VC-429,
VC-432, VC-433)

- Contrast and hit-area work needed to pass NFR-401–NFR-403 in both palettes:
  segment borders, checked indicator, focus ring, disabled rendering, and the
  edge between the two columns. **No new palette token and no colour change
  beyond what the control itself needs** — colour-mode selection is issue #3,
  out of scope.
- Extend the existing contrast sampling (`tests/e2e/contrast.ts`,
  `presentation.spec.ts`) rather than adding a parallel harness, so parent
  VC-051 and VC-071 grow in place per the amendments table.
- VC-407's tab-order enumeration folded into the parent's VC-052 test so the
  amendment is asserted where the parent criterion lives.
- VC-427 at 375×667 for all three preference states, which is also parent
  VC-050's amendment.
- VC-429: a bundle comparison against the `384cb70` baseline build — gzipped
  total ≤ +2 KB, emitted file set unchanged but for the main JS and CSS content
  hashes, Pyodide and Ruff assets byte-identical, the precache manifest and
  generated `sw.js` differing only in those two filenames with the same URL
  count and cache-name scheme. Add the comparison as a repeatable script if one
  does not already exist.
- VC-432: `npm run test:matrix` extended so VC-403, VC-409, VC-413, VC-414,
  VC-416, VC-420 and VC-427 run on all 8 pinned versions (they live in
  `matrix.spec.ts` or are grepped into the matrix projects — follow whichever
  pattern `matrix.spec.ts` already uses).
- VC-433: `npm test`, `npm run audit:perf` and `npm run audit:contrast` run
  three times — preference unset, `vertical`, `horizontal`. The four criteria no
  script can assert (VC-056, VC-059, VC-063, VC-021's greyscale check) are
  deliberately **not** re-run.
- Documentation, all of it in this iteration:
  - `docs/architecture.md`: the layout section — `data-layout` as the single
    switch, the `matchMedia` mirror of the CSS breakpoint, the fixed document
    order and why (BR-402, BR-407), and a second row in the persisted-state
    table for `pyplay.layout.v1`.
  - `README.md`: the layout control in the keyboard section (one tab stop,
    arrows, `Home`/`End`) and a line on the 900 px override.
  - `specs/04-toogle-pane-aspect.md`: status → SHIPPED, changelog row.
  - `specs/01-static-python-web-frozen.md`: the four amendments recorded
    against VC-050, VC-051, VC-052 and VC-071 — as amendments referencing this
    spec, not renumbered requirements.
  - `CONTRIBUTING.md` only if the added scripts change how tests are run.

**Success criteria**

- VC-427: at 375×667 for unset, `vertical` and `horizontal`, loading and
  running the starter program through a submitted `input()` keeps
  `scrollWidth ≤ 375` throughout; toolbar, status bar, console, editor, stdin
  field, Send EOF and diagnostics are unclipped; each radio's rendered box is
  ≥ 32 × 32 px.
- VC-428: in light and dark, at 1280 px in both layouts and at 375 px
  (disabled), every sampled text ratio ≥ 4.5:1 and every non-text ratio ≥ 3:1
  across both labels checked / unchecked / disabled, segment borders, checked
  indicator, focus ring, disabled border and the column edge.
- VC-429: the bundle comparison against `384cb70` reports ≤ 2 KB gzipped growth,
  zero new assets, zero new requests, and the precache/`sw.js` diff limited to
  the two hashed filenames.
- VC-432: `npm run test:matrix` passes on all 8 pinned versions with the seven
  listed criteria included.
- VC-433: the three runs of `npm test`, `npm run audit:perf` and
  `npm run audit:contrast` — unset, `vertical`, `horizontal` — all pass, with the
  amended parent criteria.
- `npm run build` succeeds; `npm test` green.
- Every doc listed above is updated in this commit; no doc change was made in
  iterations 1–4.

**Commit message**: `feat(layout): close the accessibility, budget and matrix criteria and document the layout control`

---

## Iteration rules

1. **Gate** — an iteration may not start until the previous iteration's success
   criteria are all verified.
2. **Tests green** — each iteration leaves its own tests passing; the full
   regression suite runs once, in iteration 5 (VC-433).
3. **Commit** — each iteration ends with one commit of all its changes.
4. **Docs last** — every documentation change ships in iteration 5. No
   half-documented intermediate state.
5. **No orphaned state** — stopping after any iteration leaves a building app
   with the existing tests passing: iteration 1 adds an unimported module,
   iteration 2 leaves the layout auto-resolved without a control, iteration 3
   completes the feature.

---

## Final Verification

| Requirement | VC(s) | Iteration(s) | Verification |
|---|---|---|---|
| FR-401 | VC-401 | 3 | Toolbar DOM: `#layout-group` last, role, name, two radios in order |
| FR-402 | VC-402 | 2 (attr), 3 (checked) | Exactly one `aria-checked`, matching the effective layout |
| FR-403 | VC-403, VC-406, VC-432 | 3 | Click / `Enter` / `Space` → `data-layout`, `aria-checked`, stored `horizontal` |
| FR-404 | VC-404, VC-406 | 3 | Same, in reverse, stored `vertical` |
| FR-405 | VC-405, VC-406, VC-407 | 3 | One tab stop, roving tabindex, arrows + `Home`/`End` apply and persist |
| FR-406 | VC-415 | 3 | `title` and `aria-describedby` carry the hint below 900 px only |
| FR-407 | VC-408 | 2 | Panel boxes match the `384cb70` fixture ±1 px; `max-height: 25vh` |
| FR-408 | VC-409, VC-432 | 2 | Editor inline-start of the three right-column panels; full-width rows above |
| FR-409 | VC-410, VC-435 | 2 | 58 % column, both ≥ 320 px, no h-scroll, 40 % diagnostics cap, 80 px console floor |
| FR-410 | VC-411 | 2 | Identical child order at both layouts; no `.panel` `childList` mutation |
| FR-411 | VC-402, VC-412, unit tests | 1, 2 | `resolveLayout` unit table + loaded `data-layout` at 1280/800 |
| FR-412 | VC-412 | 2 | `matchMedia` crossing re-resolves ≤ 100 ms, nothing written |
| FR-413 | VC-413, VC-432 | 2 | Narrow override applies, preference preserved, widening restores |
| FR-414 | VC-403, VC-404, unit tests | 1, 3 | Exactly `vertical`/`horizontal` under `pyplay.layout.v1` |
| FR-415 | VC-414, VC-432 | 3 | `aria-disabled`, `isInert()`, still one tab stop, every interaction a no-op |
| FR-416 | VC-416, VC-432 | 2 | First-frame `data-layout` and screenshot; no later change |
| FR-417 | VC-417, VC-418, unit tests | 1, 2 | Malformed and throwing storage → default, bytes untouched, no error |
| FR-418 | VC-419 | 3 | One `Layout preference won't be remembered` notice; layout still applies |
| FR-419 | VC-420, VC-432 | 4 | Six editor observations + same `EditorView` across both switches |
| FR-420 | VC-421 | 4 | Console buffer, truncation marker, scroll pin and auto-follow |
| FR-421 | VC-422 | 4 | Mid-run switch: output intact, same worker, buttons unchanged |
| FR-422 | VC-423 | 4 | Pending stdin read, field text and caret survive; delivery correct |
| FR-423 | VC-424 | 4 | Entries, order, count unchanged; no lint scheduled; reveal still works |
| FR-424 | VC-425 | 4 | No autosave reset, no `postMessage`, no request |
| FR-425 | VC-426 | 2 (CSS), 4 (assert) | No transition/animation event on any `.panel` |
| FR-426 | VC-434 | 4 | Line 120 still first fully visible after each switch |
| BR-401 | VC-420, VC-422, VC-425, VC-433 | 4, 5 | Presentation-only: state, worker and storage untouched |
| BR-402 | VC-411 | 2 | Grid placement only; no re-parenting |
| BR-403 | VC-429, VC-430 | 3, 5 | Exactly one new key; no cookie / IDB / session storage / request |
| BR-404 | VC-413, VC-414, VC-427 | 2, 3, 5 | Vertical is the only layout below 900 px |
| BR-405 | VC-412, VC-413 | 2 | Unset tracks the viewport; a choice is sticky |
| BR-406 | VC-419 | 3 | Save failure degrades this feature only |
| BR-407 | VC-409, VC-431 | 2, 3 | No console tab stop; left column precedes right |
| NFR-401 | VC-427 | 5 | 375 px, three preference states, ≥ 32 × 32 px radios |
| NFR-402 | VC-428 | 5 | Text contrast ≥ 4.5:1, both palettes |
| NFR-403 | VC-428 | 5 | Non-text contrast ≥ 3:1, both palettes |
| NFR-404 | VC-426 | 4 | Switch paints ≤ 100 ms; no long task; no request |
| NFR-405 | VC-429 | 5 | ≤ 2 KB gzipped, zero new assets and requests vs `384cb70` |
| NFR-406 | VC-432 | 5 | Seven criteria pass on all 8 pinned versions |
| Parent VC-050 | VC-427 | 5 | 375 px assertion run for all three preference states |
| Parent VC-051 | VC-428 | 5 | Sampling set gains the radio labels in all three renderings |
| Parent VC-052 | VC-407 | 3, 5 | Exactly one stop after Reset; same order in both layouts |
| Parent VC-071 | VC-428 | 5 | Sampling set gains borders, indicator, focus ring, column edge |

**Final acceptance test**

```sh
npm run build                     # tsc --noEmit + vite build
npx vitest run                    # unit, incl. tests/unit/layout.test.ts
npx playwright test --project=chromium   # e2e, incl. layout + layout-state
npm run audit:perf
npm run audit:contrast
npm run test:matrix               # VC-432: 8 pinned browser versions

# VC-433: repeat the three suites with the preference pre-seeded
PYPLAY_LAYOUT_PREF=vertical   npm test && npm run audit:perf && npm run audit:contrast
PYPLAY_LAYOUT_PREF=horizontal npm test && npm run audit:perf && npm run audit:contrast

# VC-429: bundle delta against the baseline
git worktree add ../baseline-384cb70 384cb70 && (cd ../baseline-384cb70 && npm ci && npm run build)
node scripts/compare-bundle.mjs ../baseline-384cb70/dist dist   # ≤ 2 KB gzipped growth
```

Not re-run, deliberately (VC-433): VC-056 (physical network disconnect),
VC-059 (`RUN_LONG=1` six-minute run), VC-063 (second deployment) and VC-021's
greyscale check — this spec touches no code on their paths, which VC-425 and
VC-429 establish.

---

## Ambiguities flagged

1. **The `384cb70` geometry fixture (iteration 2, VC-408).** The spec requires a
   ±1 px comparison against the baseline build but does not say where those
   measurements live. The plan captures them once into a committed fixture from
   a `git worktree` at `384cb70`; if the intent was to re-measure the baseline
   on every run, iteration 2's harness changes shape.
2. **How VC-433 pre-seeds the preference (iteration 5).** The spec says to run
   the parent suites with the preference unset, `vertical` and `horizontal`, but
   the existing suites have no such switch. The plan assumes an env var read by
   the Playwright fixture that seeds `localStorage` before each page load; any
   other seeding mechanism is equally compliant.
3. **Spec 03 ordering (A-406, *Relationship to spec 03*).** This plan assumes
   spec 03 has **not** merged when iteration 2 lands, so `.app` gets its first
   grid definition here. If spec 03 lands first, iteration 2 folds the pane's
   inline-end column into the single `grid-template-areas` set and VC-409 /
   VC-410 are additionally run with the pane open — that is extra scope for
   iteration 2, not a new iteration.
4. **VC-429's `compare-bundle.mjs`.** No such script exists in `scripts/`; the
   plan adds one in iteration 5. If the comparison is meant to be manual, drop
   the script and record the numbers in the commit message instead.
