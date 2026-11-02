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

## D-006: No production code for measure/scroll; side effects observed without a test hook (Iteration 3)
Context: plan allowed `requestMeasure()` + scroll restoration if VC-1308/1325 failed; VC-1310 needs a transaction counter.
Decision: nothing added to `src/`. VC-1308 passed unmodified (first visible line stays 80 across 14->24->12). VC-1310 reaches the
live view as existing helpers do (`.cm-content` `cmTile.view`), wraps `view.update` (the funnel `dispatch` uses) on that instance,
and wraps `Worker.prototype.postMessage` / `Storage.prototype.setItem` via `addInitScript`.
Rejected: a production test hook; a `requestMeasure` call "just in case" (untested code).
Consequences: zero updates implies zero autosave and zero lint scheduling, as both are driven by document transactions.

## D-007: VC-1325 reworded in the spec (Iteration 3) — user decision
Context: CodeMirror draws the caret at glyph height (28 px vs a 33.6 px line at 24; ~3 px short at 14 as well), so "caret within
2 px of line height" fails at every size, default included.
Decision: spec VC-1325 now compares caret and line heights after 14->24 with a page loaded straight at 24 (within 2 px), requires the
caret to fit inside its line, `x` typed at the caret, gutter `scrollWidth <= clientWidth` and no clipped gutter element.
Rejected: widening the 2 px tolerance; skipping.

## D-008: VC-814 baseline pin moved e569b81 -> 424e43c (Iteration 3) — user decision (a)
Context: VC-814 was red on darwin before this feature (app +5046 B over e569b81 vs a 4096 B budget, from unrelated later features);
re-recording e569b81 reproduces 162773 B, so only moving the pin could help.
Decision: `record-baselines.mjs 424e43c --build tests/e2e/baseline-build-about.json` (167816 B, darwin-arm64 zlib 1.2.12, 13 URLs) and
the pin table in CONTRIBUTING.md, in its own commit 8329112. Threshold 4096 B untouched. Result: delta 1461 B, VC-814 green.
Consequences: the About budget now measures growth since 424e43c; the historical 162773 value is in git history.

## D-009: VC-1321 lives in fontsize.spec.ts and is added to the audit grep (Iteration 3)
Decision: a dedicated test per palette using `measureContrast`; `audit:contrast` grep gained `|VC-1321` (adds coverage only).
The check mark is a `::before` inheriting the item colour (asserted equal) and is held to both 4.5:1 and 3:1.
