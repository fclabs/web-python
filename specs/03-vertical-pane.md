# Spec 03 — Vertical Special-Character Pane

| Field | Value |
|---|---|
| Version | 1.1.0 |
| Last Updated | 2026-09-02 |
| Status | **SHIPPED** — implemented and verified 2026-09-02 (see *Verification record*) |
| Owner | Federico Castañeda |
| Parent spec | `specs/01-static-python-web-frozen.md` (SHIPPED) |
| Source issue | [fclabs/web-python#1](https://github.com/fclabs/web-python/issues/1) — *Add special-character picker for Python symbols* |

This is a **child spec**. New requirements use the `3xx` range (FR-301+,
BR-301+, NFR-301+, VC-301+). Requirements imported from the parent keep the
parent's identifiers (e.g. "per FR-047 from spec-01") and are never
renumbered.

> **Citation correction.** The source issue cites "NFR-010 / NFR-013" for
> keyboard accessibility and "NFR-009" for the 375 px requirement. In spec-01
> the keyboard requirement is **FR-049**, the contrast requirements are
> **NFR-010** (text) and **NFR-013** (non-text), and the 375 px requirement is
> **FR-047**. NFR-009 is main-thread responsiveness under heavy output. This
> spec cites the correct identifiers.

---

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

---

## Scope

### In scope

- One new toolbar control that opens and closes the pane.
- A **vertical** pane listing exactly the 29 characters and character sequences
  enumerated in *Data & Interfaces → Character set*.
- Click / `Enter` / `Space` on a character copies that exact character
  sequence to the system clipboard.
- Success feedback and clipboard-denial fallback, matching the existing
  **Copy code** pattern (FR-006 / FR-007 from spec-01).
- Keyboard operation of the pane as a single tab stop with arrow-key
  navigation, plus visible focus indicators.
- Layout behaviour of the pane at viewport widths down to 375 px, and the
  pane's fixed position in the document independent of that layout (FR-317).
- Dismissal semantics: the pane closes only by its toggle or `Escape`, and
  survives focus loss, editing, running, stopping and formatting (FR-318).
- The amendments the pane forces on parent verification criteria VC-050,
  VC-051, VC-052 and VC-071 (see *Parent-spec amendments*).

### Out of scope

- **Inserting the character into the editor at the caret.** The pane copies to
  the clipboard only; see BR-301 for why, and *Deliberately excluded* for the
  trade-off this accepts.
- Any character that is not Python 3 syntax or a Python typing idiom: no
  currency symbols, no emoji, no mathematical glyphs (`≤`, `≠`, `×`, `÷`), no
  curly/typographic quotes (`“`, `”`, `‘`, `’`), no full-width punctuation, no
  Greek letters, no arrows. See BR-302.
- Multi-character snippets, templates or code completion: no `if __name__ ==
  "__main__":`, no `def f():`, no matched-pair insertion, no `"""` triple
  quotes. The pane's longest entries are the two-character operators and `...`,
  which are single Python *tokens*, not snippets.
- Persisting whether the pane is open across reloads (FR-312) — and therefore
  any new `localStorage`, cookie, IndexedDB or session-storage key (BR-304).
- Customising, reordering, filtering, searching or favouriting the character
  set. The set is fixed at build time.
- Any change to lint, format, execution, the worker protocol, the stdin
  channel, the service worker, or the deployment shape. This spec adds no
  network request and no runtime asset (NFR-304).
- Full screen-reader optimisation, as in spec-01: accessible names (FR-314)
  and a `role="status"` feedback region (FR-307) are in scope; an
  assistive-technology audit is not.
- Touch ergonomics beyond the 32 × 32 px minimum hit area of NFR-301.

---

## Actors

| Actor | Description | Permissions |
|---|---|---|
| **Visitor** | Anyone who opens the page — unchanged from spec-01. No login, no identity, no roles. | Everything spec-01 grants, plus: open the pane, close the pane, and copy one character sequence from it to the clipboard. Cannot alter the character set, reorder it, or persist the pane's open state. |
| **Running Program** | The visitor's Python code executing inside the Web Worker — unchanged from spec-01. | Unchanged. The pane is main-thread UI only; the worker is never told the pane exists, and the pane never reads or writes the worker protocol, the stdin channel, or the editor buffer (BR-301). |
| **Maintainer** | Whoever builds and deploys the static bundle — unchanged from spec-01. | Publishes assets. The character set is compiled into the bundle; changing it is a code change gated by BR-302, not a deployment-time configuration. |

---

## Functional Requirements

Priority is MoSCoW: **M**ust, **S**hould, **C**ould.

| ID | P | Requirement |
|---|---|---|
| **FR-301** | M | **Given** the page has loaded, **when** the toolbar is rendered, **then** it contains a control labelled exactly `Symbols` carrying `aria-expanded="false"` and `aria-controls` pointing at the pane, and the pane is not rendered to the accessibility tree or the visual layout. |
| **FR-302** | M | **Given** the pane is closed, **when** the visitor activates the `Symbols` control by pointer, `Enter` or `Space`, **then** the pane becomes visible, the control's `aria-expanded` becomes `"true"`, and keyboard focus moves to the pane's first character button. |
| **FR-303** | M | **Given** the pane is open, **when** the visitor activates the `Symbols` control again, **then** the pane becomes hidden, `aria-expanded` becomes `"false"`, and keyboard focus moves to the `Symbols` control. |
| **FR-304** | M | **Given** the pane is open and focus is on one of its character buttons, **when** the visitor presses `Escape`, **then** the pane closes, `aria-expanded` becomes `"false"`, and focus moves to the `Symbols` control. |
| **FR-305** | M | **Given** the pane is open, **when** its contents are enumerated, **then** it contains exactly one character button for each of the 29 rows of *Character set*, in that table's order, grouped under the five group headings named there, and contains no other character button. |
| **FR-306** | M | **Given** the pane is open and the clipboard write succeeds, **when** the visitor activates the character button for row *R*, **then** the system clipboard holds exactly `R.value` — no leading or trailing whitespace, no newline, no surrounding quotes — and the editor buffer is byte-for-byte unchanged. |
| **FR-307** | M | **Given** a clipboard write succeeded for value `V`, **when** the write resolves, **then** the pane's `role="status"` feedback region reads exactly `Copied V`, the activated button carries `data-state="copied"`, and both revert 2 000 ms later; **and** a further successful copy within that window replaces the text with the new value and restarts the 2 000 ms timer from zero. |
| **FR-308** | M | **Given** the pane is open, **when** the visitor activates a character button and the clipboard write is rejected for any reason (permission denied, insecure context, unsupported API), **then** a notice reading exactly `Couldn't copy — select the character and press Ctrl/Cmd+C` appears in the existing notice strip, the document selection is set to that button's glyph text and nothing else, the pane stays open, the feedback region of FR-307 is cleared, and any FR-307 revert timer still pending from an earlier successful copy is cancelled so no `Copied V` text and no `data-state="copied"` survives the failure. |
| **FR-309** | M | **Given** the pane is open, **when** the visitor navigates it with the keyboard, **then** the whole pane is a single tab stop (exactly one character button has `tabindex="0"`, all others `tabindex="-1"`) and focus moves within the **visual grid the pane currently renders** — *visual rows* being the rendered rows of character buttons ordered top to bottom across the whole pane, group headings taking no part: `ArrowRight`/`ArrowLeft` move to the next/previous button **in the same visual row**; `ArrowDown`/`ArrowUp` move to the button in the next/previous visual row **at the same column index**, or that row's last button when the target row is shorter; `Home` focuses the pane's first button and `End` its last; focus never wraps and never leaves the pane, so a move with no target in that direction leaves focus where it is. `Enter` or `Space` on the focused button performs FR-306. In the ≥ 700 px layout of FR-311 every visual row holds exactly one button, so `ArrowRight`/`ArrowLeft` never move focus there and `ArrowDown`/`ArrowUp` step through all 29 buttons in *Character set* order. |
| **FR-310** | M | **Given** a Python program is running, **when** the visitor opens the pane, copies a character, and closes it, **then** Run stays disabled and Stop stays enabled per spec-01, the program is neither interrupted nor restarted, its console output continues uninterrupted, a pending stdin read stays pending with its field still enabled, and no character reaches the running program's stdin. |
| **FR-311** | M | **Given** a viewport at least 700 px wide, **when** the pane is open, **then** it renders as a vertical column at the inline-end edge of the console + editor region, its buttons stacked in column order, its inline size between 44 px and 96 px, and its block size at least that of the editor panel; **and given** a viewport narrower than 700 px, **then** it renders as a full-width band immediately below the toolbar whose buttons wrap into rows. In both cases the console, editor, stdin field and every toolbar control remain reachable and unclipped per FR-047 from spec-01. |
| **FR-312** | S | **Given** the visitor opened the pane, **when** they reload the page, **then** the pane is closed, and no `localStorage`, `sessionStorage`, cookie or IndexedDB entry was written or read on account of the pane. |
| **FR-313** | S | **Given** a browser or context where `navigator.clipboard.writeText` is absent, **when** the visitor opens the pane and activates any character button, **then** the pane opens and navigates normally and every activation takes the FR-308 fallback path; **Copy code**, editing and running are unaffected. |
| **FR-314** | S | **Given** the pane is open, **when** each character button is inspected, **then** its visible label is `R.glyph` and its accessible name is exactly `R.name` from *Character set*, so no button is announced or tooltipped as bare punctuation. |
| **FR-315** | C | **Given** the pane is open, **when** the visitor hovers a character button with a pointer, **then** a native tooltip shows `R.name`. |
| **FR-316** | M | **Given** a clipboard write is in flight, **when** the pane closes — by the toggle (FR-303) or `Escape` (FR-304) — before that write resolves, **then** the resolution produces no feedback: the region of FR-307 is cleared, no `data-state="copied"` is set, no FR-308 notice is shown, and the pane's closed state is unaffected. The clipboard write itself is not cancelled and may still succeed. |
| **FR-317** | M | **Given** the page is rendered at any viewport width, **when** the document's element order is inspected, **then** `#symbol-pane` sits immediately after `#notices` and before the console panel, at **both** breakpoints of FR-311 — the inline-end column of the wide layout is achieved by flex/grid placement (`order`, `grid-area` or equivalent), never by moving the element in the document. Sequential focus order therefore follows document order and does not change with viewport width. |
| **FR-318** | M | **Given** the pane is open, **when** anything happens other than activating the `Symbols` control (FR-303) or pressing `Escape` with focus inside the pane (FR-304) — the visitor clicks the editor, the console or the page background, focus leaves the pane by `Tab`, or Run, Stop, Clear console, Copy code, Format or Reset is activated — **then** the pane stays open with `aria-expanded="true"`, keeps its scroll position, and stays keyboard-navigable per FR-309. |

---

## Business Rules

| ID | Rule | Rationale | Exceptions |
|---|---|---|---|
| **BR-301** | The pane's only effect on the document is the clipboard write of FR-306, the feedback of FR-307/FR-308, and its own open/closed state. It never mutates the editor buffer, the CodeMirror undo history, the caret position, the console, or the stdin field. | Keeps the parent's BR-006 discipline intact — the bytes executed are always exactly what the visitor typed into the editor — and keeps this change out of the autosave (FR-002) and lint (FR-035) trigger paths, so it cannot regress spec-01's shipped behaviour. It is also what issue #1 asks for. | None. Caret-insertion is out of scope; see *Deliberately excluded*. |
| **BR-302** | Every entry in the character set must be a Python 3 token or a punctuation character that appears in Python 3 source. Adding an entry requires naming the Python construct that uses it. Characters that merely *look* like Python operators — `≤`, `≠`, `×`, `÷`, `“`, `”`, `‘`, `’`, full-width `（`, `）` — are forbidden. | A generic Unicode palette would actively harm this audience: a student who pastes `“` gets `SyntaxError: invalid character '“' (U+201C)` with no idea why, which is strictly worse than not offering the character at all. | None. |
| **BR-303** | A clipboard failure degrades the pane only: the pane stays open and usable, and editing, running, formatting, stdin and **Copy code** are unaffected. | Instance of BR-009 from spec-01 — an optional subsystem's failure must never reach the core write-run-read loop. | None. |
| **BR-304** | The pane adds no persisted state, no request to any origin, and no additional runtime asset; its character set is a compile-time constant in the bundle. | Preserves BR-001 (static files only), BR-005 (nothing leaves the origin) and NFR-004's 15 MB cold-transfer budget from spec-01. | None. |
| **BR-305** | The pane's character buttons form a single tab stop; they are never 29 separate tab stops. | FR-049 from spec-01 requires that `Tab` from page load reach every control. 29 extra stops between the toolbar and the editor would make keyboard operation of the playground's core loop materially worse, so the pane uses the standard roving-tabindex toolbar pattern instead. | None. |

---

## Non-Functional Requirements

Thresholds are measured on spec-01's reference profile: a 2020-or-later laptop
(4 cores, 8 GB RAM), current-stable Chrome, connection throttled to
10 Mbit/s down / 40 ms RTT.

Scalability, availability and observability remain **not applicable** — the
site has no server, no shared state and no operator.

| ID | Requirement | Threshold |
|---|---|---|
| **NFR-301** | Layout at a 375 × 667 viewport with the pane open. | `document.documentElement.scrollWidth` ≤ 375 px; every one of the 29 buttons reachable without horizontal *page* scrolling (the pane may scroll within its own bounds); every button's rendered hit area ≥ 32 × 32 px. |
| **NFR-302** | Contrast of pane **text** — character glyphs, group headings, the FR-307 feedback text — in both light and dark palettes. Extends NFR-010 from spec-01. | ≥ 4.5:1 against its background (WCAG 2.1 SC 1.4.3, AA). |
| **NFR-303** | Contrast of pane **non-text components** — button borders, the focus indicator of FR-309, the `data-state="copied"` highlight of FR-307, the pane's edge against the editor panel — in both palettes. Extends NFR-013 from spec-01. | ≥ 3:1 against adjacent colours (WCAG 2.1 SC 1.4.11, AA). |
| **NFR-304** | Latency from activating `Symbols` to the pane being painted, and from activating a character button to `Copied V` being painted. | ≤ 100 ms each; no main-thread task longer than 100 ms is introduced (consistent with NFR-009 from spec-01). |
| **NFR-305** | Bytes and requests this feature adds to a cold load, measured against the **baseline build of commit `8df7fa5`** (`npm run build`, same Node and Vite versions, gzip). Bytes are counted over the app's own output — the shell, the JS/CSS chunks, the worker chunk, `sw.js`, `precache-manifest.json`; the vendored Pyodide and Ruff blobs are held to byte-identity by digest instead (VC-326), because they are 9 MB of the 9.2 MB cold load and gzip them ~152 KB apart on stock zlib and on zlib-ng, which would swamp a 4 KB budget with compressor noise. | ≤ 4 KB gzipped added to the baseline's app payload; **zero** additional network requests; **zero** new runtime assets. NFR-004's 15 MB budget from spec-01 is unchanged. |
| **NFR-306** | Browser support, on the baseline pinned by NFR-011 from spec-01 (Chrome 141/140, Edge 141/140, Firefox 145/144, Safari 26.1/26.0). | Every Must-priority FR in this spec passes on each of the 8 versions. |

---

## Data & Interfaces

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

---

## Verification Criteria

Every FR and BR below has at least one criterion. Per spec-01's convention,
each test is named after the criterion it discharges, so
`--grep "VC-301"` finds it.

- **VC-301** *(FR-301)*: Load the page → the toolbar's last control reads `Symbols` with `aria-expanded="false"`, its `aria-controls` resolves to `#symbol-pane`, and `#symbol-pane` has the `hidden` property set.
- **VC-302** *(FR-302)*: With the pane closed, click `Symbols` → the pane is visible, `aria-expanded` is `"true"`, and `document.activeElement` is the button whose `data-value` is `"`.
- **VC-303** *(FR-302, FR-309)*: With the pane closed, focus `Symbols` and press `Space`; repeat with `Enter` → in both cases the pane opens and focus lands on the first character button.
- **VC-304** *(FR-303)*: With the pane open, click `Symbols` → the pane is hidden, `aria-expanded` is `"false"`, and `document.activeElement` is the `Symbols` control.
- **VC-305** *(FR-304)*: Open the pane, `ArrowDown` twice, press `Escape` → the pane is hidden, `aria-expanded` is `"false"`, and focus is on the `Symbols` control.
- **VC-306** *(FR-305, BR-302)*: Open the pane and read every `.symbol` button → their `data-value` list equals the 29 *Character set* values in table order, with no extra and no missing button, and the five group headings `Quotes`, `Brackets`, `Operators`, `Punctuation`, `Ellipsis` appear in that order.
- **VC-307** *(FR-306, BR-301)*: **Chromium only** (see VC-324). For each of the 29 buttons in turn: note the editor contents, click the button, read the clipboard → the clipboard holds exactly that row's `value` with no added whitespace or newline, and the editor contents, caret offset and undo depth are unchanged.
- **VC-308** *(FR-306)*: Click the `**` button, then paste into the editor with `Ctrl/Cmd+V` → the editor gains exactly the two characters `**` at the caret and nothing else.
- **VC-309** *(FR-307)*: Click the `(` button → within 100 ms `#symbol-status` reads exactly `Copied (` and the clicked button has `data-state="copied"`; 2 000 ms later `#symbol-status` is empty and the attribute is gone.
- **VC-310** *(FR-307)*: Click `(`, wait 1 200 ms, click `:` → `#symbol-status` reads `Copied :`; at 1 900 ms after the first click it still reads `Copied :`; it clears 2 000 ms after the **second** click.
- **VC-311** *(FR-308, BR-303, FR-313)*: With clipboard permission denied, open the pane and click `{` → a notice reads exactly `Couldn't copy — select the character and press Ctrl/Cmd+C`, `window.getSelection().toString()` is `{`, `#symbol-status` is empty, no button carries `data-state="copied"`, the pane is still open and still navigable, and typing in the editor and clicking **Copy code** still behave as spec-01 requires.
- **VC-312** *(FR-313)*: With `navigator.clipboard` deleted before load, open the pane and click `+` → the FR-308 fallback fires with no uncaught exception in the console, and Run still executes `print("ok")` successfully.
- **VC-313** *(FR-309, BR-305)*: At a 1 280 × 800 viewport, where FR-311 renders one button per visual row, open the pane → exactly one `.symbol` button has `tabindex="0"` and the other 28 have `tabindex="-1"`; press `ArrowDown` 28 times → focus reaches the `...` button and a 29th `ArrowDown` leaves it there; press `Home` → focus is on `"`; press `End` → focus is on `...`; a further `ArrowUp` moves to `\|` and no further wrap occurs at the top after 40 more `ArrowUp` presses; `ArrowRight` and `ArrowLeft` never move focus in this layout.
- **VC-314** *(FR-309, FR-306)*: Focus the `//` button with arrow keys and press `Enter`; repeat with `Space` → in both cases the clipboard holds `//` and FR-307 feedback appears.
- **VC-315** *(FR-049 from spec-01, BR-305)*: From page load press `Tab` repeatedly with the pane open → Run, Stop, Clear console, Copy code, Format, Reset, Symbols, the pane (**one** stop), the editor, the stdin field, Send EOF and the diagnostics entries are each reached, each with a visible focus ring, and the total number of stops contributed by the pane is exactly 1.
- **VC-316** *(FR-310, BR-301)*: Run `import time\nfor i in range(20):\n    print(i)\n    time.sleep(0.2)`; while it runs, open the pane, click `%`, and close the pane → the clipboard holds `%`, Run stayed disabled and Stop stayed enabled throughout, the console shows `0`–`19` in order with no gap or duplicate, and `Program finished in N.NN s` appears.
- **VC-317** *(FR-310)*: Run `x = input("? ")\nprint(x)`; when the stdin field enables, open the pane, click `,`, then submit `a,b` → the stdin field was enabled the whole time, the program prints `a,b`, and no `,` was injected into the stdin stream by the pane.
- **VC-318** *(FR-311)*: Render at 1 280 × 800 with the pane open → the pane's bounding box starts at or after the editor panel's inline-end edge, its inline size is between 44 px and 96 px, and its block size is ≥ the editor panel's block size.
- **VC-319** *(FR-311, FR-047 from spec-01, NFR-301)*: Render at 375 × 667 with the pane open → `document.documentElement.scrollWidth` ≤ 375; the pane's top edge is above the editor panel's top edge and its inline size equals the app content width; every `.symbol` button is reachable by scrolling the pane only; every button's rendered box is ≥ 32 × 32 px; the console, editor, stdin field and every toolbar control are unclipped.
- **VC-320** *(FR-312, BR-304)*: Open the pane, snapshot `localStorage`, `sessionStorage`, `document.cookie` and `indexedDB.databases()`, then reload → the pane is closed and all four snapshots are identical to their pre-open values, with `pyplay.program.v1` the only `localStorage` key.
- **VC-321** *(FR-314, FR-315)*: For each of the 29 buttons → its accessible name equals the row's `name`, its `title` equals the row's `name`, and its text content equals the row's `glyph`.
- **VC-322** *(NFR-302, NFR-303, extends VC-051 and VC-071 from spec-01)*: With the pane open and a copy just performed — so that the FR-307 text and the `data-state="copied"` highlight are both present and within their 2 000 ms window — in light mode and in dark mode, sample every glyph, group heading and feedback-text pair against its background, and sample button borders, the focus ring, the `data-state="copied"` highlight and the pane's edge against adjacent colours → every text ratio ≥ 4.5:1 and every non-text ratio ≥ 3:1.
- **VC-323** *(NFR-304, NFR-305)*: With a performance profile recording on the reference profile, click `Symbols` then click `#` → the pane is painted ≤ 100 ms after the first click, `Copied #` is painted ≤ 100 ms after the second, no main-thread task exceeds 100 ms, and the network panel records zero requests attributable to either click; compare the built bundle's compressed size against the pre-change build → the increase is ≤ 4 KB and no new asset file appears in the precache manifest.
- **VC-324** *(NFR-306)*: Execute VC-302, **VC-308**, VC-311, VC-313, VC-316 and VC-319 on each of the 8 pinned browser versions → all pass on all 8. The copy itself is verified here by **pasting into the editor** (VC-308), never by reading the clipboard: `clipboard-read` permission is grantable under Playwright on Chromium but not on Firefox or WebKit, so VC-307's clipboard-read observation runs on Chromium only and is deliberately excluded from the matrix.
- **VC-325** *(BR-302)*: Grep the compiled character set for characters outside `[A-Za-z0-9]` that are not in *Character set*, and specifically for U+2018, U+2019, U+201C, U+201D, U+2264, U+2265, U+2260, U+00D7, U+00F7, U+FF08, U+FF09 and any code point ≥ U+1F000 → no match.
- **VC-326** *(BR-304, NFR-305)*: Diff the built output against the baseline build of commit `8df7fa5` → the **set** of emitted files is unchanged except for the content hash of the main JS chunk and the main CSS file (no new asset file, no removed asset file); every Pyodide and Ruff asset is byte-identical; and the precache manifest and generated `sw.js` differ **only** in the hashed filenames of those two entries, with the same number of precached URLs and the same cache-name scheme. (Vite content-hashes bundle filenames, so those two entries necessarily change; asserting byte-identity of the manifest would be unsatisfiable by construction.)
- **VC-327** *(BR-301)*: Run the automated spec-01 suites — `npm test` (Vitest + the default Playwright project), `npm run audit:perf` and `npm run audit:contrast` — twice: once with the pane present but never opened, once with the pane opened before each spec's first assertion → every criterion those suites cover passes in both configurations, with the four amendments of *Parent-spec amendments* applied. The opt-in matrix (`npm run test:matrix`, VC-055) is covered by VC-324 instead. The four criteria no script can assert — VC-056 (physical network disconnect), VC-059 (six-minute run, `RUN_LONG=1`), VC-063 (second deployment) and VC-021's greyscale check — are **not** re-run: this spec touches no code on their paths (BR-304, VC-326), and that non-involvement is what VC-326 establishes.
- **VC-328** *(FR-307, FR-308)*: Click `(` with the clipboard working, then 500 ms later click `)` with clipboard permission revoked → `#symbol-status` is empty, no button carries `data-state="copied"`, the FR-308 notice is present, and no `Copied (` text reappears at any point up to 3 000 ms after the first click.
- **VC-329** *(FR-309, FR-311)*: At a 375 × 667 viewport, where FR-311 renders wrapping rows, open the pane and read the rendered geometry to derive the visual rows → from the first button of the second visual row, `ArrowLeft` does not move focus; `ArrowRight` moves to the second button of that row; `ArrowUp` moves to the button of the first visual row at the same column index; from the last button of a full row, `ArrowRight` does not move focus; from a button whose column index exceeds the next row's length, `ArrowDown` moves to that row's last button; `Home` focuses `"` and `End` focuses `...`.
- **VC-330** *(FR-311)*: Render with the pane open at 700 × 800 and at 699 × 800 → at 700 px the pane's box starts at or after the editor panel's inline-end edge and its inline size is between 44 px and 96 px; at 699 px its top edge is above the editor panel's top edge and its inline size equals the app content width; `document.documentElement.scrollWidth` exceeds neither viewport width.
- **VC-331** *(FR-317)*: At 375 px and at 1 280 px with the pane open → `#notices.nextElementSibling` is `#symbol-pane` and `#symbol-pane.nextElementSibling` is the console panel at both widths, while the *rendered* position differs per FR-311; the sequential focus order observed in VC-315 is identical at both widths.
- **VC-332** *(FR-318)*: Open the pane, then in turn: click the editor and type `x = 1`, press `Tab` until focus leaves the pane, click the page background, activate Clear console, activate Copy code, activate Format, and activate Run followed by Stop → after every one of those the pane is still visible with `aria-expanded="true"`, its scroll position is unchanged, and `ArrowDown` still moves focus between its buttons.
- **VC-333** *(FR-316)*: With the clipboard write artificially delayed by 300 ms, click `#` and press `Escape` 50 ms later → the pane closes, and 500 ms after the click `#symbol-status` is empty, no button carries `data-state="copied"`, no notice was shown, and the pane is still closed.

---

## Parent-spec amendments

These parent criteria change because the toolbar and layout change. Nothing
else in spec-01 is amended.

| Parent VC | Amendment |
|---|---|
| **VC-050** *(FR-047, FR-065)* | Also assert the 375 px layout with the pane **open**, per VC-319. The closed-pane assertion is unchanged. |
| **VC-051** *(FR-048, NFR-010)* | Sampling set gains the pane's glyphs, group headings and feedback text — see VC-322. |
| **VC-052** *(FR-049)* | Tab-order enumeration gains `Symbols` after `Reset`, plus exactly one stop for the pane when it is open — see VC-315. |
| **VC-071** *(NFR-013)* | Sampling set gains the pane's button borders, focus ring, copied-state highlight and pane edge — see VC-322. |

---

## Deliberately excluded

- **Insert-at-caret.** Copying to the clipboard costs the student a second
  action (`Ctrl/Cmd+V`) that inserting at the caret would not, and on the
  tablet keyboards this feature targets, paste is itself awkward. It is
  nevertheless what issue #1 specifies, and it is the cheaper and safer
  change: it keeps the pane entirely outside the editor's transaction, undo,
  autosave and lint paths (BR-301), so it cannot regress any shipped spec-01
  behaviour. If student feedback shows the paste step is the friction point,
  insert-at-caret is a follow-up spec that reuses this pane's character set,
  layout and keyboard model wholesale — it is not a change to this one.
- **Matched-pair insertion** (typing `(` yielding `()`), snippet templates and
  triple quotes — out of scope above, and each would require the caret access
  BR-301 forbids.
- **Remembering the pane's open state** — FR-312. It would add the first new
  persisted key since spec-01 for a control that costs one click to reopen.
- **A configurable or searchable character set** — 29 fixed entries need
  neither, and both would grow the bundle against NFR-305.

---

## Open Questions

None. All decisions are folded into the sections above.

---

## Assumptions

1. **A-301** — Every character in *Character set* is typeable on the target
   audience's physical keyboards *in principle*; the barrier is ergonomic
   (modifier chords, soft-keyboard panels, locale autocorrect), not absence.
   The pane is therefore an accelerator, not a prerequisite for writing Python
   on this page.
2. **A-302** — The audience is spec-01's: introductory-programming students
   writing short single-file stdlib-only console programs. 29 characters is
   sized for that; a course covering decorators, walrus operators or matrix
   multiplication (`@`, `:=`) would revise this spec's character set under
   BR-302 rather than extend it ad hoc.
3. **A-303** — Pasting from the system clipboard into the CodeMirror editor
   works on all 8 pinned browsers (spec-01's NFR-011), including via the
   on-screen keyboard's paste affordance on touch devices. If it does not on
   some target device, the clipboard-only design of issue #1 delivers no value
   there and *Deliberately excluded → Insert-at-caret* becomes the fix.
4. **A-304** — UI copy follows spec-01's A-05: system strings in English,
   quoted verbatim from *User-visible strings*. Character names are English;
   no i18n layer is required for this version.
5. **A-305** — The visible glyph is legible at the pane's rendered size in the
   existing `--font-mono` stack on all pinned browsers, including the
   two-character entries (`//`, `**`, `==`, `!=`, `<=`, `>=`) and `...`, which
   are rendered as their literal characters and never as a ligature or the
   single code point U+2026.

---

## Verification record

Implemented over four iterations against
[`specs/03-vertical-pane-plan.md`](./03-vertical-pane-plan.md); every `FR`,
`BR` and `NFR` above is discharged by the `VC` named beside it, and every one
of those criteria is an automated test named after it.

| Where | What it covers |
|---|---|
| `tests/unit/symbols.test.ts` | VC-306 (data half), VC-325 |
| `tests/e2e/symbols.spec.ts` | VC-301 – VC-306, VC-307 – VC-321, VC-325, VC-328 – VC-333, A-305 |
| `tests/e2e/presentation.spec.ts` | VC-322, and the amended parent VC-050, VC-051, VC-052, VC-071 |
| `tests/e2e/perf.spec.ts` | VC-323, VC-326, against the recorded baseline build of `8df7fa5` |
| `tests/e2e/matrix.spec.ts` | VC-324, opt-in via `MATRIX=1` |

Implementation notes worth carrying forward:

- **Wide layout.** `.app` becomes a CSS grid at ≥ 700 px *only while the pane
  is open*, and the pane is placed by `grid-area`. A closed pane therefore
  leaves spec-01's shipped layout exactly as it was, and the element never
  moves in the document at either breakpoint (FR-317).
- **Firefox.** `.symbol` sets `user-select: text`: Firefox refuses to select
  content inside a `<button>` otherwise, which would have left FR-308's
  fallback advising an action the visitor could not perform. Found by VC-324.
- **NFR-305.** The measured app-payload delta against `8df7fa5` is **2.18 KiB
  gzipped** (1.08 KiB where Node links stock zlib rather than CI's zlib-ng),
  against a 4 KiB budget, with no added or removed asset file. The vendored
  megabytes are excluded from the delta and pinned by digest instead: the two
  zlib flavours compress them 152 KB apart for byte-identical input, which is
  noise 37× the budget.
- **VC-324 on Chromium.** `clipboard-write` is granted per-context in the
  matrix spec; the pinned Chromium projects do not carry the default project's
  permissions, and that is Playwright's model rather than the app's.

Still outstanding, as *Final Verification* in the plan requires: the manual
touch-device check of **A-303** — that a character copied from the pane pastes
into the editor via an on-screen keyboard's paste affordance at a 375 px
viewport. If it does not, *Deliberately excluded → Insert-at-caret* is the
follow-up spec, not a patch to this one.

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-09-02 | Post-review revision. Resolved the FR-307/FR-308 feedback contradiction (failure now clears the region and cancels the pending timer). Added FR-316 (pane closed while a write is in flight), FR-317 (pane's document position pinned; visual placement by flex/grid order), FR-318 (pane closes only via the toggle or `Escape`). Rewrote FR-309's arrow model for both FR-311 layouts (row-wise `ArrowLeft`/`ArrowRight`, column-wise `ArrowUp`/`ArrowDown`). Pane role changed from `group` to `toolbar` with `aria-orientation`. Added `SYMBOL_GROUPS` and `SYMBOLS` to *User-visible strings* and declared *Character set* their normative source. Pinned NFR-305's baseline to commit `8df7fa5`. Rewrote VC-326 against Vite's hashed output and VC-327 against the executable suites; moved the matrix's copy check from clipboard-read (VC-307, now Chromium-only) to paste (VC-308). Scoped VC-313 to the wide layout; VC-322 now samples inside the copied-state window. Added VC-328 – VC-333. |
| 1.0.0 | 2026-09-02 | Initial draft from issue #1. Child of spec-01; `3xx` requirement range. |
