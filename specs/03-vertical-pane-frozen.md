# Frozen: Vertical Special-Character Pane

Source: `specs/03-vertical-pane.md` (v1.1.0)
Status: SHIPPED
Frozen: 2026-09-02
PR / commit: https://github.com/fclabs/web-python/pull/5 (`0a4194f`)
Parent: `specs/01-static-python-web-frozen.md`

## Purpose

Students on keyboards or on-screen keyboards that make Python punctuation hard
to reach — Spanish/Latin-American layouts where `[`, `]`, `{`, `}`, `\` and `|`
sit behind `AltGr`, tablets whose soft keyboard buries symbols two panels deep,
and locale keyboards that autocorrect `"` into curly quotes — currently have to
copy those characters from somewhere outside the playground before they can
type valid Python. This spec adds a **vertical, dismissible pane of
Python-relevant characters** to the playground page. Clicking a character
copies exactly that character to the clipboard, so the student can paste it
into the editor. The pane is non-modal: it never disables editing, running,
stopping, or stdin.

## What it does

- The toolbar's last control is labelled exactly `Symbols`, carries `aria-expanded` and `aria-controls` pointing at the pane, and the pane is hidden on load.
- Activating `Symbols` (pointer, Enter, Space) opens the pane, sets `aria-expanded="true"`, and moves focus to the first character button; activating it again closes the pane, sets `aria-expanded="false"`, and returns focus to `Symbols`.
- `Escape` with focus on a character button closes the pane the same way and returns focus to `Symbols`.
- The open pane contains exactly one button per *Character set* row, in table order, under the five group headings, and no other character button.
- Activating a button copies exactly that row's `value` to the clipboard — no extra whitespace, newline or quotes — and leaves the editor buffer, caret and undo history unchanged.
- A successful copy paints `Copied V` in the pane's `role="status"` region and `data-state="copied"` on the button; both revert after 2 000 ms (`COPIED_MS`, shared with **Copy code**). A further success inside that window replaces the text and restarts the timer.
- A rejected clipboard write (permission, insecure context, missing API) shows `Couldn't copy — select the character and press Ctrl/Cmd+C` in the existing notice strip, selects the button's glyph, keeps the pane open, clears the status region, and cancels any pending revert timer. Editing, running and **Copy code** are unaffected.
- Closing the pane while a write is in flight produces no feedback; the write itself is not cancelled and may still succeed.
- The pane is a single tab stop (exactly one button `tabindex="0"`, the rest `-1`). Arrow keys move within the visual grid currently rendered — left/right stay in the same visual row, up/down keep the column index (or land on that row's last button if it is shorter); Home/End go to the first/last button; focus never wraps or leaves the pane. At ≥ 700 px every visual row holds one button, so left/right never move. Enter/Space on the focused button copies.
- Opening, copying and closing the pane never interrupts a running program, its console output, a pending stdin read, or spec-01's Run/Stop enablement, and never injects a character into stdin.
- At ≥ 700 px the open pane is a vertical column at the inline-end of the console + editor region, 44–96 px inline and at least as tall as the editor. Below 700 px it is a full-width wrapping band immediately below the toolbar. Console, editor, stdin and every toolbar control stay reachable and unclipped.
- `#symbol-pane` sits immediately after `#notices` and before the console in the document at both breakpoints; the wide column is flex/grid placement, never a DOM move. Sequential focus order therefore does not change with viewport width.
- The pane closes only via the toggle or `Escape`. Clicking the editor, console or background, Tabbing out, and activating Run, Stop, Clear console, Copy code, Format or Reset leave it open, scrolled and navigable.
- Reload finds the pane closed; the pane writes or reads no `localStorage`, `sessionStorage`, cookie or IndexedDB entry.
- Each button's visible label is the row's `glyph` and its accessible name and native tooltip are the row's `name`.

## Public interfaces / data

### Character set

29 entries, in this order. `value` is what FR-306 puts on the clipboard;
`glyph` is the visible button label; `name` is the accessible name (FR-314) and
tooltip (FR-315). Group headings are rendered as the pane's section labels
(FR-305). Every row cites the Python construct that justifies it, per BR-302.

**Quotes**

| # | value | glyph | name | Python use |
|---|---|---|---|---|
| 1 | `"` | `"` | Double quote | String literal |
| 2 | `'` | `'` | Single quote | String literal |

**Brackets**

| # | value | glyph | name | Python use |
|---|---|---|---|---|
| 3 | `(` | `(` | Left parenthesis | Call, grouping, tuple |
| 4 | `)` | `)` | Right parenthesis | Call, grouping, tuple |
| 5 | `[` | `[` | Left square bracket | List, index, slice |
| 6 | `]` | `]` | Right square bracket | List, index, slice |
| 7 | `{` | `{` | Left brace | Dict, set, f-string field |
| 8 | `}` | `}` | Right brace | Dict, set, f-string field |

**Operators**

| # | value | glyph | name | Python use |
|---|---|---|---|---|
| 9 | `+` | `+` | Plus | Addition, concatenation |
| 10 | `-` | `-` | Minus | Subtraction, negation |
| 11 | `*` | `*` | Asterisk | Multiplication, unpacking |
| 12 | `/` | `/` | Slash | True division |
| 13 | `//` | `//` | Floor division | `7 // 2` |
| 14 | `%` | `%` | Percent | Modulo, `%`-formatting |
| 15 | `**` | `**` | Power | `2 ** 8`, `**kwargs` |
| 16 | `==` | `==` | Equal to | Comparison |
| 17 | `!=` | `!=` | Not equal to | Comparison |
| 18 | `<` | `<` | Less than | Comparison |
| 19 | `>` | `>` | Greater than | Comparison |
| 20 | `<=` | `<=` | Less than or equal to | Comparison |
| 21 | `>=` | `>=` | Greater than or equal to | Comparison |

**Punctuation**

| # | value | glyph | name | Python use |
|---|---|---|---|---|
| 22 | `:` | `:` | Colon | Block header, slice, annotation |
| 23 | `,` | `,` | Comma | Argument and element separator |
| 24 | `.` | `.` | Period | Attribute access, float literal |
| 25 | `#` | `#` | Hash | Comment |
| 26 | `_` | `_` | Underscore | Identifier, `snake_case`, `1_000` |
| 27 | `\` | `\` | Backslash | Escape, line continuation |
| 28 | `\|` | `\|` | Pipe | Union type `int \| None`, bitwise or |

**Ellipsis**

| # | value | glyph | name | Python use |
|---|---|---|---|---|
| 29 | `...` | `...` | Ellipsis | `Ellipsis`, stub body, `x[...]` |

The `value` column is normative and exact. Row 28's value is the single
character U+007C; the backslash in the table is markdown escaping only.

### User-visible strings

Per spec-01's convention, these live in `src/format.ts` and are quoted
verbatim from this spec. Nothing else may be rendered by the pane.

| Constant | Value |
|---|---|
| `SYMBOLS_LABEL` | `Symbols` |
| `formatSymbolCopied(value)` | `Copied ${value}` — e.g. `Copied **` (FR-307) |
| `SYMBOL_COPY_FAILED` | `Couldn't copy — select the character and press Ctrl/Cmd+C` (FR-308) |
| `SYMBOL_GROUPS` | The five group headings, in order: `Quotes`, `Brackets`, `Operators`, `Punctuation`, `Ellipsis` (FR-305) |
| `SYMBOLS` | The 29 rows of *Character set* as `{ value, glyph, name }`, in table order. The *Character set* table is the normative source for all three fields, including the accessible names of FR-314; this constant is its transcription and nothing else may be rendered by a character button. |

The 2 000 ms revert window of FR-307 reuses the existing `COPIED_MS` constant
that FR-006 already uses for **Copy code**, so the two feedback timings cannot
drift apart.

### DOM contract

Added to `index.html`. The pane is a sibling of the existing panels, not a
child of the editor or console.

| Element | Id | Contract |
|---|---|---|
| Toggle button | `btn-symbols` | Last control in `header.toolbar`, after `#btn-reset`. `type="button"`, `aria-expanded`, `aria-controls="symbol-pane"`. Never inert — it has no disabled state, so it does **not** use `setInert()`. |
| Pane | `symbol-pane` | `<section class="panel panel--symbols" role="toolbar" aria-label="Special characters" aria-orientation="vertical\|horizontal">`, `hidden` on load. `aria-orientation` is `vertical` in the ≥ 700 px layout of FR-311 and `horizontal` below it, matching the arrow-key model of FR-309. `role="toolbar"` — not `role="group"` — is what conveys the composite widget whose arrow keys navigate (BR-305). Toggled with the `hidden` property, never `style.display`. Positioned in the document per FR-317. |
| Feedback region | `symbol-status` | `role="status"`, inside the pane, empty on load. Carries the FR-307 text only. |
| Character button | — | `<button type="button" class="symbol" data-value="<value>" aria-label="<name>" title="<name>" tabindex="0\|-1">`. Text content is `<glyph>`. |
| Notice strip | `notices` (existing) | Reused unchanged for FR-308 via the existing `Notices` class. |

### Reused interfaces

- `writeClipboard(text)` from `src/clipboard.ts` — unchanged. It already
  returns `false` rather than throwing on every rejection path, which is
  exactly what FR-308 and FR-313 need.
- `Notices.show(text)` from `src/notices.ts` — unchanged.
- No change to `src/protocol.ts`, `src/runtime.ts`, `src/worker/`,
  `src/stdin-*.ts`, `src/lint/`, `src/offline.ts`, `src/storage.ts` or
  `scripts/`.

### Persisted state

None. The table in spec-01's *Public interfaces / data* is unchanged: still
one `localStorage` key and one cache, still no cookies, no IndexedDB, no
session storage (BR-304, FR-312).

## Key decisions

- **Clipboard only, never insert-at-caret** (BR-301): the pane's only document effects are the clipboard write, copy/fallback feedback, and its own open/closed state. That keeps it out of the editor transaction, undo, autosave and lint paths, so it cannot regress spec-01, and it is what issue #1 asked for.
- **Python 3 tokens only** (BR-302): every entry must name the Python construct that uses it. Characters that merely look like operators (`≤`, `≠`, `“`, full-width punctuation) are forbidden because pasting them produces a `SyntaxError` the student cannot diagnose.
- **Clipboard failure degrades the pane only** (BR-303): instance of spec-01 BR-009 — an optional subsystem must never reach the write-run-read loop.
- **No persisted state, no request, no runtime asset** (BR-304): the set is a compile-time constant, preserving spec-01's static-files, origin-isolation and 15 MB cold-transfer rules.
- **One tab stop, not 29** (BR-305): 29 extra stops between the toolbar and the editor would violate spec-01 FR-049, so the pane uses a roving-tabindex toolbar.
- **`role="toolbar"` with `aria-orientation`**, not `role="group"`: that is what conveys the composite widget whose arrows navigate.
- **Document position is pinned** (FR-317): `#symbol-pane` stays after `#notices` and before the console at both breakpoints; the ≥ 700 px column is CSS grid/`grid-area`, and `.app` becomes that grid **only while the pane is open**, so a closed pane leaves spec-01's layout untouched.
- **Firefox fallback**: `.symbol` sets `user-select: text` because Firefox otherwise refuses to select content inside a `<button>`, which would make the FR-308 notice advise an action the visitor cannot perform.

## Known limits (still true at freeze)

- **375 × 667 with the pane open** (NFR-301): `document.documentElement.scrollWidth` ≤ 375 px; every button reachable without horizontal *page* scrolling (the pane may scroll internally); every hit area ≥ 32 × 32 px.
- **Contrast** extends spec-01: pane text (glyphs, group headings, `Copied V`) ≥ 4.5:1 (NFR-302); pane non-text (borders, focus ring, `data-state="copied"`, pane edge) ≥ 3:1 (NFR-303); both palettes.
- **Latency** (NFR-304): open-to-paint and click-to-`Copied V` each ≤ 100 ms; no new main-thread task longer than 100 ms.
- **Budget** (NFR-305): ≤ 4 KB gzipped added to the app payload of commit `8df7fa5` (shell, JS/CSS/worker chunks, `sw.js`, `precache-manifest.json`); zero extra requests; zero new runtime assets. Measured delta at ship: **2.18 KiB** gzipped (1.08 KiB on stock zlib). Vendored Pyodide/Ruff are held to byte-identity by digest, not gzip size.
  - **Amended by spec-04**: the ship measurement above is frozen, but VC-323 keeps *re-running* the subtraction on later trees, where it charges this budget for every feature that has landed since — spec-05's color mode took it to 3.12 KiB on `main`, and spec-04's layout control to 4874 B, red, for 1.62 KiB of its own. So the criterion now measures from the branch point (`98ee032` while spec-04 is in flight), for the reason spec-04 already records for NFR-405: a budget asks what its own feature adds. The 4 KB does not move, and VC-326 still compares the build's *shape* against `8df7fa5`.
- **Browsers** (NFR-306): every Must FR on Chrome 141/140, Edge 141/140, Firefox 145/144, Safari 26.1/26.0. Clipboard-*read* observation is Chromium-only; other engines verify copy by pasting into the editor.
- **Parent criteria amended**: VC-050 also asserts the 375 px layout with the pane open; VC-051/VC-071 sampling sets gain the pane's text and non-text; VC-052 tab-order gains `Symbols` after `Reset` plus exactly one stop for the open pane.
- **A-303 is still outstanding**: no recorded check that an on-screen keyboard's paste affordance at 375 px can paste a copied character into the editor. If it cannot, insert-at-caret is a follow-up spec, not a patch to this one.
- The set is sized for spec-01's audience (short single-file stdlib programs). Adding `@`, `:=` or similar is a new spec under BR-302, not an ad-hoc extension.

## Deliberately excluded

- **Insert-at-caret**, matched-pair insertion, snippets and triple quotes — all require the editor mutation BR-301 forbids.
- Any character that is not Python 3 syntax or a typing idiom; a configurable, searchable or favourited set; remembering the pane's open state across reloads.
- Any change to lint, format, execution, the worker protocol, stdin, the service worker or the deployment shape. Full assistive-technology audit and touch ergonomics beyond the 32 × 32 px hit area.
