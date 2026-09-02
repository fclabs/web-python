# Implementation Plan: Vertical Special-Character Pane

**Spec**: [`specs/03-vertical-pane.md`](./03-vertical-pane.md) (v1.1.0)
**Parent**: [`specs/01-static-python-web-frozen.md`](./01-static-python-web-frozen.md) (SHIPPED)
**Source issue**: [fclabs/web-python#1](https://github.com/fclabs/web-python/issues/1)
**Review status**: `/review-spec` returned NEEDS WORK at v1.0.0; all five
`[MUST]` and all three `[SHOULD]` items were resolved in v1.1.0 (see that
spec's Changelog). The one remaining `[COULD]` — folding the single-entry
**Ellipsis** group into **Punctuation** and dropping FR-315 — is deliberately
not taken; the plan implements the spec as written.

We add a `Symbols` toolbar toggle and a vertical pane of 29 Python-relevant
characters to the existing playground. Clicking a character copies exactly that
character to the clipboard, with the same success and denial feedback as the
existing **Copy code** button. The pane is one tab stop with arrow-key
navigation, docks to the inline-end of the console + editor region at ≥ 700 px
and becomes a wrapping band below the toolbar under that, and never touches the
editor buffer, the worker, or persisted state.

---

## Ground rules for every iteration

1. **Gate** — do not start iteration N+1 until every success criterion of
   iteration N has been verified.
2. **Tests green** — each iteration leaves its own tests passing. The full
   regression suite runs once, at *Final Verification*.
3. **Commit** — each iteration ends with exactly one git commit of all its
   changes, using the stated commit message.
4. **Docs last** — all documentation ships in Iteration 4.
5. **No orphaned state** — if an iteration is abandoned mid-way, `npm run build`
   must still succeed and every previously passing test must still pass. This
   rule has one sharp consequence, called out in Iteration 1: parent **VC-052**
   (tab order) breaks the moment 29 focusable buttons enter the DOM, so the
   roving-`tabindex` *assignment* ships in Iteration 1 even though arrow-key
   *movement* does not arrive until Iteration 3.

### Implementation decisions the spec does not fix (flagged, not assumed silently)

- **Wide-layout structure.** FR-311 requires the pane to render as a column at
  the inline-end of the console + editor region, while FR-317 pins it to sit
  between `#notices` and the console panel *in the document*. `.app` is
  currently a single flex column (`src/styles.css`). This plan wraps the
  console, editor, stdin and diagnostics panels plus the pane in a
  `.workspace` **CSS grid** and places the pane with `grid-area`, so document
  order is untouched at both breakpoints. A flex container with `order` would
  satisfy the spec equally; if the maintainer prefers it, only Iteration 2
  changes.
- **Deriving "visual rows" for arrow navigation.** FR-309 defines focus
  movement over the rendered grid. This plan derives rows at keystroke time by
  grouping buttons on `getBoundingClientRect().top`, which needs no knowledge
  of the CSS and works identically at both breakpoints and at any zoom level.
  The alternative — hard-coding the column count per breakpoint — would
  duplicate the media query in JS and is rejected.
- **New files.** `src/symbols.ts` (the 29-row constant + group headings),
  `src/symbol-pane.ts` (the pane component), `tests/unit/symbols.test.ts`,
  `tests/e2e/symbols.spec.ts`. Strings go in the existing `src/format.ts` per
  CONTRIBUTING; the pane's CSS goes in the existing `src/styles.css`.

---

## Iteration 1: Character set, toolbar toggle, and pane shell

**Goal**: The `Symbols` control opens and closes a correctly-labelled pane
containing all 29 buttons, and the pane dismisses only the way the spec says.
No copying yet.

**Scope**:
- `src/symbols.ts`: `SYMBOLS` — the 29 `{ value, glyph, name }` rows
  transcribed from *Character set* in table order, plus the group boundaries;
  `SYMBOL_GROUPS` — the five headings. Both exported as `const` arrays with
  `as const` so the count is a type-level fact (*Data & Interfaces →
  User-visible strings*).
- `src/format.ts`: `SYMBOLS_LABEL`, `formatSymbolCopied(value)` and
  `SYMBOL_COPY_FAILED`, quoted verbatim from *User-visible strings*.
  `COPIED_MS` moves from `src/main.ts` to `src/format.ts` and is imported by
  both the **Copy code** handler and the pane, so FR-307's window and FR-006's
  cannot drift (*User-visible strings*, last paragraph).
- `index.html`: `#btn-symbols` as the last control in `header.toolbar` after
  `#btn-reset`, with `aria-expanded="false"` and `aria-controls="symbol-pane"`
  (FR-301). It carries no `aria-disabled` and must **not** be routed through
  `setInert()` — it has no disabled state (*DOM contract*).
- `index.html`: `#symbol-pane` as a `<section class="panel panel--symbols"
  role="toolbar" aria-label="Special characters">`, `hidden`, positioned
  immediately after `#notices` and before the console panel (FR-317), holding
  `#symbol-status` (`role="status"`, empty) and the group headings.
- `src/symbol-pane.ts`: renders the 29 buttons from `SYMBOLS` —
  `data-value`, `aria-label`, `title`, glyph as text content (FR-305, FR-314,
  FR-315) — and owns open/close: toggle activation both ways (FR-302, FR-303),
  `Escape` from inside the pane (FR-304), focus moving into the first button on
  open and back to the toggle on close, and `aria-orientation` set from a
  `matchMedia('(min-width: 700px)')` listener (*DOM contract*).
- **Dismissal discipline** (FR-318): no `blur`, `focusout`, document-`click` or
  `pointerdown`-outside handler is registered at all. The pane closes from
  exactly two code paths. Assert this by construction, not by testing every
  possible interaction.
- Roving `tabindex` **assignment** only: the first button gets `tabindex="0"`,
  the other 28 get `tabindex="-1"` (FR-309's first clause, BR-305). Arrow
  handling lands in Iteration 3. This is what keeps parent VC-052 green from
  this commit onward.
- Minimal pane CSS: visible, legible, using existing `--font-mono` and palette
  tokens. Real layout is Iteration 2; this iteration must not regress the
  375 px page-width assertion of parent VC-050, so the pane starts as a
  wrapping band at every width.
- `tests/unit/symbols.test.ts` and the first half of
  `tests/e2e/symbols.spec.ts`.

**Success criteria**:
- `npx vitest run tests/unit/symbols.test.ts` passes: `SYMBOLS` has exactly 29
  rows in *Character set* order; every `value` is non-empty and contains no
  whitespace; row 28's value is exactly `U+007C`; row 29's is the three
  characters `.` `.` `.` and **not** `U+2026`; `SYMBOL_GROUPS` is the five
  headings in order — **VC-306** (data half), **VC-325**.
- `npx playwright test --grep "VC-325"` passes: no code point from the
  forbidden list (U+2018, U+2019, U+201C, U+201D, U+2264, U+2265, U+2260,
  U+00D7, U+00F7, U+FF08, U+FF09, ≥ U+1F000) appears in `SYMBOLS`.
- `npx playwright test --grep "VC-301|VC-302|VC-303|VC-304|VC-305|VC-306|VC-321|VC-331|VC-332"`
  passes — **VC-301** (closed on load, wired `aria-controls`), **VC-302** /
  **VC-303** (pointer, `Enter` and `Space` open the pane and focus `"`),
  **VC-304** (toggle closes and returns focus), **VC-305** (`Escape` closes and
  returns focus), **VC-306** (29 buttons and 5 headings in order), **VC-321**
  (accessible name, `title` and glyph per row), **VC-331** (document position
  identical at 375 px and 1 280 px), **VC-332** (pane survives editor clicks,
  `Tab`-out, background clicks, Clear console, Copy code, Format, Run/Stop).
- `npx playwright test --grep "VC-050|VC-052"` passes: parent VC-050 unchanged
  at 375 px with the pane closed, and parent VC-052's tab order now reads
  Run, Stop, Clear console, Copy code, Format, Reset, **Symbols**, the pane
  (one stop), editor, stdin, Send EOF, diagnostics.
- `npm run build` type-checks and emits `dist/` with no new asset file.
- `grep -rn "focusout\|pointerdown\|document.addEventListener('click'" src/symbol-pane.ts`
  returns nothing (FR-318 by construction).

**Commit message**: `feat: Symbols toolbar toggle and special-character pane shell`

---

## Iteration 2: Layout at both breakpoints and contrast

**Goal**: The pane docks as a vertical inline-end column at ≥ 700 px and as a
wrapping band below it, with no horizontal page scrolling at 375 px and AA
contrast in both palettes.

**Scope**:
- `src/styles.css`: wrap the console, editor, stdin and diagnostics panels plus
  `#symbol-pane` in a `.workspace` CSS grid. At ≥ 700 px the pane takes an
  inline-end grid column sized in the 44–96 px band of FR-311 and stretches to
  at least the editor panel's block size; below 700 px it takes a full-width
  row placed above the console. Document order stays as Iteration 1 left it
  (FR-317) — placement is `grid-area` only.
- `.symbol` button sizing: rendered box ≥ 32 × 32 px at every breakpoint
  (NFR-301), glyphs in `--font-mono`, two-character entries rendered as
  literal characters with no ligature (A-305: set `font-variant-ligatures:
  none`).
- Pane overflow: `overflow-y: auto` within its own bounds so all 29 buttons are
  reachable at 375 px without the page scrolling horizontally (NFR-301,
  FR-047 from spec-01).
- Palette tokens for the pane: glyph, heading and status text ≥ 4.5:1
  (NFR-302); button border, focus ring, `data-state="copied"` highlight and the
  pane's edge against the editor panel ≥ 3:1 (NFR-303) — in both light and dark.
  `data-state="copied"` styling ships here so Iteration 3 can be sampled; the
  attribute is not yet set by any code.
- `aria-orientation` flips with the same 700 px breakpoint as the CSS, driven by
  the `matchMedia` listener from Iteration 1 — one breakpoint constant,
  referenced by both.
- `scripts/audit-contrast` sampling set extended with the pane's pairs
  (amends parent VC-051 and VC-071).

**Success criteria**:
- `npx playwright test --grep "VC-318|VC-319|VC-330"` passes — **VC-318**
  (1 280 px: pane box at or after the editor's inline-end edge, 44–96 px
  inline size, block size ≥ editor's), **VC-319** (375 px: `scrollWidth ≤ 375`,
  pane above the editor at full content width, every button ≥ 32 × 32 px and
  reachable by pane-only scrolling, nothing clipped), **VC-330** (the 700/699 px
  boundary flips the layout and neither width scrolls the page horizontally).
- `npm run audit:contrast` passes with the pane open in both palettes: every
  pane text ratio ≥ 4.5:1 and every pane non-text ratio ≥ 3:1 — **VC-322**
  (non-text half; the FR-307 text half completes in Iteration 3).
- `npx playwright test --grep "VC-050"` passes with the pane **open** as well
  as closed (parent VC-050 amendment).
- A 375 px screenshot shows `//`, `**`, `==`, `!=`, `<=`, `>=` and `...` as
  literal characters, not ligatures or `…` (A-305).

**Commit message**: `feat: dock the special-character pane and meet AA contrast`

---

## Iteration 3: Copy, feedback, and the denial path

**Goal**: Clicking a character copies exactly that character, with `Copied V`
feedback, the **Copy code**-equivalent denial fallback, and no effect on the
editor or a running program.

**Scope**:
- Click and `Enter`/`Space` handlers calling the existing
  `writeClipboard(value)` from `src/clipboard.ts` — reused unchanged, because
  it already returns `false` on every rejection path rather than throwing
  (FR-306, FR-313, *Reused interfaces*).
- Success path: `#symbol-status` set to `formatSymbolCopied(value)`,
  `data-state="copied"` on the activated button, both reverting after
  `COPIED_MS`; a second success within the window replaces the text and
  restarts the timer from zero (FR-307).
- Denial path: `Notices.show(SYMBOL_COPY_FAILED)` via the existing `#notices`
  strip, plus a `Range`/`Selection` over that button's glyph text node and
  nothing else; the pane stays open (FR-308, BR-303).
- **Cross-path clearing** (the v1.1.0 fix): one owner of the feedback state
  clears `#symbol-status`, drops `data-state="copied"` and cancels the pending
  revert timer *before* either path writes. A denial after a recent success
  therefore leaves nothing behind (FR-308), and a pane closed while a write is
  in flight discards the resolution entirely — the handler checks the pane's
  open state and a monotonic request id at resolve time (FR-316).
- Editor isolation: the handlers never touch the `EditorView`, so no
  CodeMirror transaction, no undo entry, no autosave schedule and no lint
  schedule is produced (BR-301).
- Arrow-key **movement** completing FR-309: rows derived from
  `getBoundingClientRect().top` at keystroke time; `ArrowRight`/`ArrowLeft`
  within the row, `ArrowUp`/`ArrowDown` to the same column index in the
  adjacent row (or that row's last button when shorter), `Home`/`End` to the
  pane's first/last button, no wrapping, focus never leaving the pane, and the
  roving `tabindex` following focus.

**Success criteria**:
- `npx playwright test --grep "VC-307|VC-308|VC-309|VC-310|VC-311|VC-312|VC-328|VC-333"`
  passes — **VC-307** (Chromium only: all 29 values land on the clipboard
  exactly, editor contents, caret offset and undo depth unchanged),
  **VC-308** (paste `**` into the editor yields exactly two characters),
  **VC-309** (`Copied (` within 100 ms plus `data-state`, both gone at
  2 000 ms), **VC-310** (timer restart on a second copy), **VC-311** (denial:
  exact notice, selection is `{`, status empty, no `data-state`, pane still
  navigable, **Copy code** and editing unaffected), **VC-312**
  (`navigator.clipboard` absent → fallback, no uncaught exception, Run still
  works), **VC-328** (success then denial 500 ms later leaves no `Copied (`
  through 3 000 ms), **VC-333** (`Escape` during a delayed write produces no
  feedback at all).
- `npx playwright test --grep "VC-313|VC-314|VC-315|VC-329"` passes —
  **VC-313** (wide layout: one `tabindex="0"` and 28 `-1`, 28 `ArrowDown`
  presses reach `...`, no wrap either end, `Home`/`End`, and
  `ArrowRight`/`ArrowLeft` inert), **VC-314** (`Enter` and `Space` both copy
  `//`), **VC-315** (pane contributes exactly one tab stop),
  **VC-329** (375 px grid: row-wise `ArrowLeft`/`ArrowRight`, column-wise
  `ArrowUp`/`ArrowDown` including the short-row clamp).
- `npx playwright test --grep "VC-316|VC-317"` passes — **VC-316** (copying
  `%` mid-run leaves Run disabled, Stop enabled, `0`–`19` gap-free and
  `Program finished`), **VC-317** (copying `,` while a stdin read is pending
  keeps the field enabled and injects nothing into the stdin stream).
- `npm run audit:contrast` passes with a copy in flight, completing **VC-322**.
- `npx vitest run` passes — including the existing `no-timeout`, `protocol`
  and `storage` units, untouched.

**Commit message**: `feat: copy Python symbols to the clipboard with keyboard navigation`

---

## Iteration 4: Budgets, non-regression, matrix, and docs

**Goal**: Prove the feature costs what the spec says it costs, breaks nothing
in spec-01, works on all eight pinned browsers, and is documented.

**Scope**:
- `scripts/`: extend `npm run audit:perf` with the two NFR-304 latencies
  (toggle → pane painted, click → `Copied V` painted, each ≤ 100 ms) and the
  NFR-305 size delta against the **commit `8df7fa5` baseline build**, gzipped.
- Build-shape check for **VC-326**: compare the emitted file *set* and the
  precache manifest against the baseline — no added or removed asset file,
  Pyodide and Ruff assets byte-identical, and the manifest and generated
  `sw.js` differing only in the hashed names of the main JS chunk and main CSS
  file, with the same URL count and cache-name scheme.
- Storage-inertness check for **VC-320** / **VC-312**: snapshot
  `localStorage`, `sessionStorage`, `document.cookie` and
  `indexedDB.databases()` around open/copy/reload; `pyplay.program.v1` must
  remain the only `localStorage` key.
- `tests/e2e/matrix.spec.ts`: add the **VC-324** subset — VC-302, **VC-308**
  (paste-based, not clipboard-read), VC-311, VC-313, VC-316, VC-319 — behind
  the existing `MATRIX=1` opt-in.
- **VC-327** non-regression: run `npm test`, `npm run audit:perf` and
  `npm run audit:contrast` twice — once with the pane never opened, once with
  it opened before each spec's first assertion — with the four
  *Parent-spec amendments* applied.
- **Docs** (all of them, this iteration only):
  - `CONTRIBUTING.md` → *Layout*: add `symbols.ts` and `symbol-pane.ts`.
  - `docs/architecture.md`: a *Special-character pane* section covering the
    roving-`tabindex` toolbar pattern and why `role="toolbar"` rather than
    `role="group"` (BR-305), the single feedback owner that makes FR-307,
    FR-308 and FR-316 consistent, and why the pane never touches the editor
    (BR-301). Note that BR-302 gates any change to the character set.
  - `docs/deployment.md`: state explicitly that this feature changes nothing
    there — no header, no worker, no asset (BR-304, VC-326).
  - `README.md`: one line in the feature list.
  - `specs/03-vertical-pane.md`: Status → `SHIPPED`, with the verification
    record.

**Success criteria**:
- `npm run audit:perf` passes: both latencies ≤ 100 ms, no main-thread task
  > 100 ms, size delta ≤ 4 KB gzipped vs. `8df7fa5`, zero added requests —
  **VC-323**, **NFR-304**, **NFR-305**.
- `npx playwright test --grep "VC-320|VC-326"` passes — **VC-320** (no
  persisted state touched, pane closed after reload), **VC-326** (build shape
  as specified above).
- `npm test && npm run audit:perf && npm run audit:contrast` passes in **both**
  configurations of **VC-327**, and `git diff --stat` against `8df7fa5` shows
  changes confined to `index.html`, `src/`, `scripts/`, `tests/`, `docs/`,
  `README.md`, `CONTRIBUTING.md` and `specs/`.
- `npm run test:matrix` passes on every engine installed on the machine, with
  skipped engines reported by name and none stubbed onto a substitute —
  **VC-324**, **NFR-306**.
- Every doc listed in scope is updated in this commit; no earlier commit
  contains a partial version of any of them.

**Commit message**: `feat: verify the special-character pane's budgets and document it`

---

## Final Verification

Cross-check every requirement in the spec.

| Requirement | VC(s) | Iteration | Verification |
|---|---|---|---|
| FR-301 | VC-301 | 1 | `--grep "VC-301"`: toggle present, `aria-expanded="false"`, `aria-controls` resolves, pane `hidden` |
| FR-302 | VC-302, VC-303 | 1 | `--grep "VC-302\|VC-303"`: pointer, `Enter`, `Space` each open and focus `"` |
| FR-303 | VC-304 | 1 | `--grep "VC-304"`: toggle closes, focus returns to toggle |
| FR-304 | VC-305 | 1 | `--grep "VC-305"`: `Escape` closes, focus returns to toggle |
| FR-305 | VC-306 | 1 | `--grep "VC-306"` + `vitest symbols`: 29 buttons, 5 headings, table order |
| FR-306 | VC-307, VC-308 | 3 | `--grep "VC-307"` (Chromium clipboard read) and `--grep "VC-308"` (paste, all engines) |
| FR-307 | VC-309, VC-310 | 3 | `--grep "VC-309\|VC-310"`: exact text, `data-state`, 2 000 ms revert, timer restart |
| FR-308 | VC-311, VC-328 | 3 | `--grep "VC-311\|VC-328"`: exact notice, glyph selected, region cleared, timer cancelled |
| FR-309 | VC-313, VC-314, VC-329 | 1 (tabindex), 3 (movement) | `--grep "VC-313\|VC-314\|VC-329"`: one tab stop, both layouts' arrow models, no wrap |
| FR-310 | VC-316, VC-317 | 3 | `--grep "VC-316\|VC-317"`: gap-free output mid-copy; stdin read untouched |
| FR-311 | VC-318, VC-319, VC-330 | 2 | `--grep "VC-318\|VC-319\|VC-330"`: both layouts and the 700/699 px boundary |
| FR-312 | VC-320 | 4 | `--grep "VC-320"`: four storage snapshots unchanged, pane closed after reload |
| FR-313 | VC-312 | 3 | `--grep "VC-312"`: `navigator.clipboard` deleted → fallback, Run still works |
| FR-314 | VC-321 | 1 | `--grep "VC-321"`: accessible name per row |
| FR-315 | VC-321 | 1 | `--grep "VC-321"`: `title` per row |
| FR-316 | VC-333 | 3 | `--grep "VC-333"`: `Escape` during a delayed write produces no feedback |
| FR-317 | VC-331 | 1 (DOM), 2 (placement) | `--grep "VC-331"`: sibling chain identical at 375 px and 1 280 px |
| FR-318 | VC-332 | 1 | `--grep "VC-332"` plus the `grep` for absent `focusout`/outside-click handlers |
| BR-301 | VC-307, VC-316, VC-327 | 3, 4 | Editor contents, caret and undo depth unchanged; full spec-01 suite green both ways |
| BR-302 | VC-306, VC-325 | 1 | `vitest symbols` + `--grep "VC-325"`: forbidden code points absent |
| BR-303 | VC-311, VC-312 | 3 | Denial leaves pane usable and the core loop untouched |
| BR-304 | VC-320, VC-326 | 4 | No persisted state, no new asset, manifest differs only in hashed names |
| BR-305 | VC-313, VC-315 | 1, 3 | Exactly one `tabindex="0"`; pane contributes one tab stop |
| NFR-301 | VC-319 | 2 | `scrollWidth ≤ 375`, buttons ≥ 32 × 32 px, pane-only scrolling |
| NFR-302 | VC-322 | 2, 3 | `npm run audit:contrast`, both palettes, ≥ 4.5:1 |
| NFR-303 | VC-322 | 2, 3 | `npm run audit:contrast`, both palettes, ≥ 3:1 |
| NFR-304 | VC-323 | 4 | `npm run audit:perf`: both latencies ≤ 100 ms, no task > 100 ms |
| NFR-305 | VC-323, VC-326 | 4 | ≤ 4 KB gzipped vs. `8df7fa5`, zero added requests, zero new assets |
| NFR-306 | VC-324 | 4 | `npm run test:matrix`: the six-VC subset on all 8 pinned versions |
| VC-050 (parent) | — | 1, 2 | Re-run at 375 px with the pane closed **and** open |
| VC-051 (parent) | — | 2, 3 | Contrast sampling set includes pane glyphs, headings, status text |
| VC-052 (parent) | — | 1 | Tab order includes `Symbols` and exactly one pane stop |
| VC-071 (parent) | — | 2 | Non-text sampling set includes pane borders, focus ring, copied highlight, edge |

**Final acceptance test**:

```bash
npm run build                       # tsc --noEmit + Vite, no new asset
npx vitest run                      # units, including tests/unit/symbols.test.ts
npx playwright test                 # every VC-3xx plus the whole spec-01 suite
npm run audit:contrast              # VC-322 and parent VC-051 / VC-071, both palettes
npm run audit:perf                  # VC-323: NFR-304 latencies + NFR-305 size delta
npm run test:matrix                 # VC-324: the six-VC subset on the pinned engines
RUN_LONG=1 npx playwright test --grep "VC-059"   # parent no-timeout check, unaffected
```

Then, once, by hand: confirm at a 375 px viewport on a touch device that a
character copied from the pane pastes into the editor via the on-screen
keyboard's paste affordance (A-303). If it does not, the clipboard-only design
of issue #1 delivers no value on that device class and
*Deliberately excluded → Insert-at-caret* is the follow-up spec, not a patch to
this one.
