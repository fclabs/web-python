# DECISIONS — Editor Font Size (spec 13)

## D-001: How VC-1317 extracts the inline allow-list (Iteration 1)
Context: BR-1304 requires a unit test proving the `index.html` allow-list equals `FONT_SIZES` and that the inline
and module validators agree. The inline script is an IIFE with no exports.
Decision: the inline script declares its allow-list as a literal `var ALLOWED = ['12', ...]`. The test reads
`index.html`, picks the `<script>` containing `pyplay.fontsize.v1`, parses the `ALLOWED = [...]` literal with a
regex and compares to `FONT_SIZES.map(String)`. For validator agreement it executes the real script text via
`new Function('document','localStorage', script)` against stubs, for "0"…"100", `016`, `16px`, ` 16`, `""`.
Rejected: a regex-only comparison of validators (would not test the actual inline logic); a shared generated
file (inline script must stay self-contained and render-blocking, no build step).
Consequences: renaming `ALLOWED` or restructuring the script requires updating the test's regex; the inline
script must keep using `document`/`localStorage` as free identifiers.

## D-002: Menu lives in its own module, `src/fontsize-menu.ts` (Iteration 2)
Context: plan allowed extending `src/fontsize.ts` or a new module. `fontsize.ts` is DOM-light and unit-tested.
Decision: new `src/fontsize-menu.ts` exporting `mountFontSizeMenu({button, menu, initial, onSelect})`. It holds the
current size for the label/checked state and calls `onSelect(size)` only when the size differs (FR-1311). Applying,
saving and the once-per-load notice flag (`fontSizeSaveWarned`) live in `src/main.ts` next to `layoutSaveWarned`.
Rejected: growing `fontsize.ts` (mixes pure validation with ~150 lines of DOM/focus code).
Consequences: the menu has no `EditorView`/storage reference; persistence is the caller's.

## D-003: Menu anchoring and flip algorithm (Iteration 2) — SPEC AMBIGUITY, flagged
Context: spec only says the menu opens "fully inside the viewport (flipped/clamped if needed)".
Decision: `position: fixed`; anchor below the button (+4 px), clamp `left` into [4, vw-width-4], flip above the
button when it would overflow the bottom, finally clamp `top` into the viewport; `max-height = vh-8` with
`overflow-y: auto`. Re-run on window `resize` while open.
Rejected: CSS anchor positioning (not in all pinned browsers); a library.

## D-004: Menu items are `div`s, Esc is consumed in the window capture phase, menu is a toolbar sibling (Iteration 2)
Context: FR-1306 needs Esc not to reach About (document-capture handler), Files or Symbols; focus must return to the
button without Space-keyup re-clicking it; the menu must not alter toolbar children/tab order.
Decision: items are `<div role=menuitemradio tabindex=-1>` (no native click activation). While open, a
`window` capture `keydown` listener handles Escape with `stopImmediatePropagation` (window capture runs before
About's `document` capture). Outside-click is a `document` capture `click`. Tab calls `close(true)` and does NOT
`preventDefault`, so the default Tab moves on from `#btn-fontsize` (-> `#btn-theme`). `#fontsize-menu` sits right after
`</header>`, not inside it. Open via Enter/Space is the button's native click; ArrowDown is handled on keydown.
Consequences: About swallows chrome clicks while modal (FR-819), so with About open the menu can only be opened by ArrowDown
(the VC-1306 test does so).

## D-005: Trim of shared toolbar spacing at >= 900 px so the button fits (Iteration 2) — user decision (option 1)
Context: at 900 px the toolbar had zero slack; adding the ~107 px button crushed Run to ~26 px, wrapped Clear/Copy and
overflowed horizontally in dark/pre-ready states (natural width ~934 px vs 884 available).
Decision: inside the existing `@media (min-width: 900px)` block only: `.toolbar > .btn` (except theme/about icon buttons)
get `padding-inline: 3px; white-space: nowrap`, and `.toolbar .segment` gets `padding-inline: 6px` (from 12/12). Toolbar
`gap` stays 6 px (VC-702/703 thresholds untouched); label and the 900/700 breakpoints untouched. `#btn-fontsize` is a `.btn`
so it gets the same padding. Measured at 900 px: single row (height 32), scrollWidth 884 = clientWidth, Run 102 px, light/dark,
both layouts, before and after Python is ready. Below 900 px nothing changed.
Rejected: shrinking the gap (breaks VC-702 6 +/- 1); shortening the label (spec change); icon-only button.
Consequences: buttons at >= 900 px are visibly tighter; geometry baselines still matched (no re-record was needed, 0 skipped
in layout.spec.ts); slack at 900 px is small (~10-16 px) so wider OS fonts could still compress Run.
