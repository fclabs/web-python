# Spec 05 — User-Selectable Light / Dark Color Mode

| Field | Value |
|---|---|
| Version | 1.1.0 |
| Last Updated | 2026-09-02 |
| Status | **SHIPPED** |
| Owner | Federico Castañeda |
| Parent spec | `specs/01-static-python-web-frozen.md` (SHIPPED) |
| Sibling | `specs/03-vertical-pane.md` (SHIPPED) — toolbar / tab-order amendments |
| Source issue | [fclabs/web-python#3](https://github.com/fclabs/web-python/issues/3) — *Allow user to choose light or dark color mode* |

This is a **child spec**. New requirements use the `5xx` range (FR-501+,
BR-501+, NFR-501+, VC-501+). Requirements imported from the parent keep the
parent's identifiers (e.g. "per FR-049 from spec-01") and are never
renumbered.

> **Citation note.** The source issue cites "NFR-010 / NFR-013" for WCAG AA
> contrast. Those IDs are correct in spec-01 (text ≥ 4.5:1, non-text ≥ 3:1).
> Keyboard reachability is **FR-049** from spec-01, not an NFR.

---

## Purpose

Students using the playground today get light or dark chrome solely from the
operating-system `prefers-color-scheme` preference. Anyone who wants light UI
on a dark OS — or dark UI on a light OS — cannot override it. This spec adds a
**toolbar color-mode control** that lets the visitor force Light, force Dark,
or keep System (follow the OS preference sampled at page load). The choice
applies to page chrome and the CodeMirror editor together, and persists in
`localStorage` so it survives reloads.

---

## Scope

### In scope

- One new toolbar control: a compact icon button that **cycles** Light → Dark
  → System → Light on each activation.
- Visible glyphs only (sun / moon / letter `S`); no visible text label on the
  control. Native tooltip and accessible name carry the mode name.
- Applying the chosen mode to:
  - Page chrome (CSS custom-property palettes already defined in
    `src/styles.css`).
  - CodeMirror editor theme (`EditorView.darkTheme` in `src/editor.ts`).
- Persisting the choice under `localStorage` key `pyplay.theme.v1`.
- Defaulting new visitors (and every storage-failure / corrupt-value path) to
  **System**.
- Sampling the OS preference **once per page load** when resolving System;
  no live `matchMedia` updates while the page stays open.
- Immediate chrome + editor update when the visitor cycles the control (no
  reload).
- First paint already matches the resolved effective palette (inline
  bootstrap in `index.html`; no opposite-palette flash).
- `color-scheme` on the document root tracks the effective palette so native
  controls match custom tokens.
- Keyboard reachability and a visible focus indicator for the control
  (extends FR-049 from spec-01).
- The amendments this control forces on parent / sibling verification criteria
  (see *Parent-spec amendments* and *Sibling-spec amendments*).

### Out of scope

- Changing the **token values** of the existing light or dark palettes
  themselves. This spec only changes *which* palette is active.
- Per-token custom themes, user-authored colour schemes, or a theme editor.
- A separate high-contrast / forced-colors mode beyond what the OS and the
  existing palettes already provide.
- Syncing the preference across devices, browsers, or origins.
- Cookies, IndexedDB, `sessionStorage`, or any network request for the theme.
- Live reaction to OS preference changes while the page remains open (even
  when System is selected) — see BR-502.
- Altering lint, format, execution, the worker protocol, stdin, the service
  worker, or the Symbols pane behaviour beyond the toolbar / tab-order
  amendments listed below.
- Full screen-reader optimisation beyond the accessible name required by
  FR-504; an assistive-technology audit is not in scope (same posture as
  spec-01 / spec-03).

---

## Actors

| Actor | Description | Permissions |
|---|---|---|
| **Visitor** | Anyone who opens the page — unchanged from spec-01. No login, no identity, no roles. | Everything prior specs grant, plus: cycle the color mode among Light, Dark and System; have the choice persist on this origin when `localStorage` is writable. Cannot invent additional modes or edit palette tokens. |
| **Running Program** | The visitor's Python code executing inside the Web Worker — unchanged. | Unchanged. Theme is main-thread UI only; the worker is never told the theme exists. |
| **Maintainer** | Whoever builds and deploys the static bundle — unchanged. | Publishes assets. Palette token values remain code changes, not deployment-time configuration. |

---

## Functional Requirements

Priority is MoSCoW: **M**ust, **S**hould, **C**ould.

| ID | P | Requirement |
|---|---|---|
| **FR-501** | M | **Given** the page has loaded, **when** the toolbar is rendered, **then** it contains exactly one color-mode control as the **last** control in document order inside the toolbar, immediately after `Symbols`, identified by `id="btn-theme"`, with no visible text label — only the glyph of FR-503. |
| **FR-502** | M | **Given** the control is focused, **when** the visitor activates it by pointer, `Enter` or `Space`, **then** the in-memory preference advances exactly one step in the cycle `light` → `dark` → `system` → `light`, the page chrome and the CodeMirror editor both adopt the newly effective palette of BR-503 within the same turn (no reload), the control's glyph, `title`, and accessible name update to match FR-503 / FR-504, and persistence follows FR-512 (or FR-507 on write failure). |
| **FR-503** | M | **Given** the current preference is `P`, **when** the control is inspected, **then** its visible content is exactly the glyph for `P` from *Mode table* and nothing else (no adjacent text node naming the mode). |
| **FR-504** | M | **Given** the current preference is `P`, **when** the control is inspected, **then** its native tooltip (`title`) is exactly the English label for `P` from *Mode table*, and its accessible name is exactly `Color mode: <label>` for that same label. |
| **FR-505** | M | **Given** a new visitor whose origin has no `pyplay.theme.v1` entry (and no unreadable entry), **when** the page loads, **then** the preference is `system`, the effective palette follows the OS preference sampled for this load (BR-502), and the control shows the System glyph / name. |
| **FR-506** | M | **Given** `localStorage['pyplay.theme.v1']` holds exactly `light`, `dark` or `system`, **when** the page loads, **then** that value is the preference for the session, the chrome adopts the corresponding effective palette on **first paint** (FR-515), the editor adopts it as soon as CodeMirror mounts (still before the visitor can interact with the toolbar), and the control reflects it. |
| **FR-507** | M | **Given** on load `localStorage` is missing or throws on read, or `pyplay.theme.v1` holds any value other than exactly `light`, `dark` or `system` (including the empty string), **then** the preference is `system` for that session (FR-505 path), the page remains fully usable, and **no** notice is shown on account of the theme. **Given** a cycle (FR-502) where `localStorage` is missing, throws on write, or is quota-exceeded, **then** the in-memory preference still advances and chrome/editor still update per FR-502, persistence is skipped for that write, no notice is shown, and a later successful write stores only a canonical *Mode table* value. |
| **FR-508** | M | **Given** the visitor has selected `light` or `dark`, **when** the OS `prefers-color-scheme` would resolve to the opposite palette, **then** the forced preference wins: chrome tokens and `EditorView.darkTheme` match the forced mode, not the OS. |
| **FR-509** | M | **Given** the preference is `system`, **when** the OS preference is sampled for this page load (BR-502), **then** a dark OS yields the dark palette and a light (or no-preference) OS yields the light palette, for both chrome and editor. |
| **FR-510** | M | **Given** the preference is `system` and the page remains open, **when** the OS `prefers-color-scheme` value changes, **then** the chrome and editor do **not** change until the next full page load (BR-502). |
| **FR-511** | M | **Given** the visitor cycles from any mode to another, **when** the new preference is applied, **then** CodeMirror syntax highlighting / editor chrome update in the same activation — a reload is not required — and the editor document, caret, undo history, and scroll position are unchanged. |
| **FR-512** | M | **Given** a successful cycle to preference `P`, **when** `localStorage` is writable, **then** `pyplay.theme.v1` holds exactly the canonical string for `P` (`light`, `dark`, or `system`) with no wrapper JSON and no other theme key written. |
| **FR-513** | M | **Given** the page has loaded, **when** the visitor walks the tab order from the start of the toolbar, **then** the color-mode control is reached after `Symbols`, carries a visible focus indicator while focused, and is operable with `Enter` and `Space` per FR-502. |
| **FR-514** | M | **Given** the preference is `P` (on load or after a cycle), **when** the document root is inspected, **then** `document.documentElement` carries `data-theme` equal to exactly `light`, `dark` or `system` matching `P` (the preference, not the effective palette), so forced modes can override `@media (prefers-color-scheme)` in CSS and tests can observe the choice without reading `localStorage`. |
| **FR-515** | M | **Given** any cold load (with a stored preference, with System default, or after FR-507's load fallback), **when** the browser performs its **first paint** of the page chrome, **then** the painted effective palette already matches BR-503 — there is no frame whose background / foreground tokens belong to the opposite palette. Achieved by a render-blocking inline bootstrap in `index.html` that sets `data-theme` (and the load-time OS sample used for System) before the main stylesheet applies visible colours; the ES module may refine the control and editor afterwards but must not be the first writer of the chrome palette. |
| **FR-516** | M | **Given** the effective palette is `E` (`light` or `dark`), **when** the document root is inspected, **then** its used CSS `color-scheme` is exactly `E`, so native form controls and scrollbars follow the same palette as the custom tokens. |

---

## Business Rules

| ID | Rule | Rationale | Exceptions |
|---|---|---|---|
| **BR-501** | The only persisted theme values are the three canonical strings `light`, `dark`, `system` under key `pyplay.theme.v1`. No other theme key, cookie, or store is used. | Matches the `pyplay.*.v1` convention of spec-01 (`pyplay.program.v1`) and keeps BR-005 (nothing leaves the origin) intact. | None. |
| **BR-502** | The OS `prefers-color-scheme` media query is read **at most once per page load**, solely to resolve an effective palette when the preference is `system` (on load, and when a cycle lands on `system` using that same load-time sample). The page must not register a `change` listener (or equivalent) that updates chrome or the editor while the document stays loaded. | Issue #3's System option extends the frozen "respect OS dark-mode" behaviour without keeping a live coupling that would surprise a visitor who forced a mode, and the product decision is that System is load-scoped, not live. | None. |
| **BR-503** | Page chrome and the CodeMirror editor always share one **effective palette** (`light` or `dark`). The effective palette is: the forced mode when preference is `light` or `dark`; otherwise the load-time OS sample of BR-502. | Acceptance criteria require both surfaces to track the same choice; splitting them would look broken. | None. |
| **BR-504** | Theme storage failure degrades only persistence: the in-memory preference and UI still cycle and apply for the session; editing, running, formatting, stdin, Symbols, and program autosave are unaffected; no theme-specific notice is shown. | Instance of BR-009 from spec-01 — an optional subsystem's failure must never reach the core write-run-read loop. Mirrors how program autosave notices are scoped; theme is even quieter (no notice). | None. |
| **BR-505** | This feature adds no network request and no additional runtime asset beyond what the main bundle already ships; mode glyphs are plain text nodes from *Mode table*, never fetched images or font files. The FR-515 bootstrap is an inline `<script>` in `index.html` (no extra file, no network). | Preserves BR-001 and NFR-004's cold-transfer budget from spec-01. | None. |
| **BR-506** | `color-scheme` on the document root always tracks the **effective** palette (FR-516), while `data-theme` tracks the **preference** (FR-514). When preference is `system`, `data-theme="system"` and `color-scheme` is `light` or `dark` from the load-time OS sample. | Keeps native widgets aligned with painted chrome without collapsing the three-way preference into a two-way attribute. | None. |

---

## Non-Functional Requirements

Thresholds are measured on spec-01's reference profile: a 2020-or-later laptop
(4 cores, 8 GB RAM), current-stable Chrome, connection throttled to
10 Mbit/s down / 40 ms RTT.

Scalability, availability and observability remain **not applicable** — the
site has no server, no shared state and no operator.

| ID | Requirement | Threshold |
|---|---|---|
| **NFR-501** | Latency from activating the color-mode control to both chrome and editor reflecting the new effective palette. | ≤ 100 ms; no main-thread task longer than 100 ms is introduced (consistent with NFR-009 from spec-01). |
| **NFR-502** | Contrast of **text** under every effective palette the visitor can select — forced light, forced dark, and System resolving to each — including the control's glyph against its toolbar background. Extends NFR-010 from spec-01. | ≥ 4.5:1 against its background (WCAG 2.1 SC 1.4.3, AA). |
| **NFR-503** | Contrast of **non-text components** under every effective palette — control border/focus ring, toolbar edges, existing chrome already covered by VC-071 — when Light or Dark is forced against an opposite OS preference. Extends NFR-013 from spec-01. | ≥ 3:1 against adjacent colours (WCAG 2.1 SC 1.4.11, AA). |
| **NFR-504** | Layout at a 375 × 667 viewport with the color-mode control present. | `document.documentElement.scrollWidth` ≤ 375 px; the control remains reachable without horizontal *page* scrolling; the control's rendered hit area ≥ 32 × 32 px. |
| **NFR-505** | Bytes and requests this feature adds to a cold load, measured against the **baseline build of commit `0a4194f`** (`npm run build`, same Node and Vite versions, gzip), counting the app's own output the same way NFR-305 from spec-03 does (shell, JS/CSS chunks, worker chunk, `sw.js`, `precache-manifest.json`; vendored Pyodide / Ruff held to digest identity). The inline FR-515 bootstrap counts toward the HTML shell bytes in that budget. | ≤ 4 KB gzipped added to the baseline's app payload; **zero** additional network requests; **zero** new runtime asset files. NFR-004's 15 MB budget from spec-01 is unchanged. |
| **NFR-506** | Browser support, on the baseline pinned by NFR-011 from spec-01 (Chrome 141/140, Edge 141/140, Firefox 145/144, Safari 26.1/26.0). | Every Must-priority FR in this spec passes on each of the 8 versions. |

---

## Data & Interfaces

### Mode table

| Preference value (`pyplay.theme.v1`) | Label (tooltip + accessible name suffix) | Visible glyph | Effective palette |
|---|---|---|---|
| `light` | `Light` | Exactly U+2600 (`☀`) as the button's text content | Always light tokens; `EditorView.darkTheme` off |
| `dark` | `Dark` | Exactly U+263D (`☽`) as the button's text content | Always dark tokens; `EditorView.darkTheme` on |
| `system` | `System` | Exactly the Latin capital letter `S` as the button's text content | Light or dark per the **load-time** OS sample (BR-502); editor follows |

Accessible name form (FR-504): `Color mode: Light`, `Color mode: Dark`, or
`Color mode: System`.

### Persisted state (amendment to spec-01's table)

| Store | Key | Contents | On read failure / invalid value |
|---|---|---|---|
| `localStorage` | `pyplay.program.v1` | *(unchanged from spec-01)* | *(unchanged)* |
| `localStorage` | `pyplay.theme.v1` | Exactly one of `light`, `dark`, `system` — raw string, no JSON wrapper. | Treat as absent → preference `system` (FR-505, FR-507). |
| Cache Storage | `pyplay-assets-v<build>` | *(unchanged)* | *(unchanged)* |

No cookies, no IndexedDB, no session storage for theme (BR-501).

### DOM

| Element | id / attr | Contract |
|---|---|---|
| Color-mode control | `btn-theme` | `<button type="button">` inside the toolbar; last toolbar control; `title` and accessible name per FR-504; visible child is only the glyph of FR-503. |
| Document root | `data-theme` | `html[data-theme="light\|dark\|system"]` mirrors the preference (not the effective palette), per FR-514. Set by the FR-515 bootstrap before first paint, then kept in sync by the module on every cycle. |
| Document root | `color-scheme` | Used value is `light` or `dark` matching the **effective** palette (FR-516, BR-506) — via the CSS `color-scheme` property on `:root` / `html`. |

### Reused interfaces

- Existing light / dark CSS custom properties in `src/styles.css` — token
  *values* unchanged; selection mechanism changes (class / `data-theme` /
  equivalent instead of `@media (prefers-color-scheme: dark)` alone for the
  forced modes).
- CodeMirror `EditorView.darkTheme` compartment in `src/editor.ts` — must be
  driven by the effective palette (BR-503), not by a live `matchMedia`
  listener (BR-502).
- `src/storage.ts` patterns for safe `localStorage` access — theme may share
  or mirror that helper; program autosave behaviour is unchanged.

### User-visible strings

| String | Where |
|---|---|
| `Light` / `Dark` / `System` | Tooltip `title` and accessible-name suffix (FR-504). |
| `Color mode: Light` / `Color mode: Dark` / `Color mode: System` | Full accessible name (FR-504). |

No other new visitor-facing copy. No theme failure notice (FR-507, BR-504).

---

## Verification Criteria

Every FR and BR below has at least one criterion. Per spec-01's convention,
each test is named after the criterion it discharges, so
`--grep "VC-501"` finds it.

- **VC-501** *(FR-501)*: Load the page → `#btn-theme` is present, is the toolbar's last control, and is the next sibling after `#btn-symbols`.
- **VC-502** *(FR-502, FR-512, BR-501)*: With preference `light`, activate `#btn-theme` once → preference becomes `dark`, `localStorage['pyplay.theme.v1']` is exactly `dark`, chrome uses the dark palette, and the editor reports dark theme on; activate again → `system` and storage `system`; activate again → `light` and storage `light`.
- **VC-503** *(FR-503, FR-504)*: For each preference `light`, `dark`, `system` → the control's visible text/glyph matches *Mode table*, `title` equals the label, and the accessible name equals `Color mode: <label>`; no visible mode-name text appears beside the glyph.
- **VC-504** *(FR-505)*: With `pyplay.theme.v1` absent, load under `prefers-color-scheme: dark` → effective palette is dark and the control shows System; repeat under `light` → effective palette is light and the control shows System.
- **VC-505** *(FR-506, FR-515)*: Set `pyplay.theme.v1` to `light`, load under OS dark → chrome and editor are light and the control shows Light; repeat with stored `dark` under OS light → both surfaces are dark. In both cases `data-theme` is already set on `document.documentElement` when the first stylesheet-driven paint occurs (FR-515 / VC-521).
- **VC-506** *(FR-507, BR-504)*: In turn: make `localStorage` throw on read; set `pyplay.theme.v1` to `""`, to `Light`, and to `{"mode":"dark"}` → each load yields System behaviour, the page is usable (Run still executes `print("ok")`), and `#notices` contains no theme-related message. Separately: with a working load at preference `light`, make `setItem` throw, then activate `#btn-theme` → in-memory preference and UI become `dark` (chrome + editor + glyph), `localStorage['pyplay.theme.v1']` remains `light` or absent per the stub, no notice appears, and Run still works.
- **VC-507** *(FR-508, BR-503)*: Store `light`, load with OS dark → body background is the light token and `EditorView.darkTheme` is off; store `dark`, load with OS light → body background is the dark token and dark theme is on.
- **VC-508** *(FR-509, FR-510, BR-502)*: Load with preference `system` under OS light (effective light). Still on the same document, flip the emulated OS preference to dark without reloading → chrome and editor **remain light**. Reload under OS dark → effective palette becomes dark.
- **VC-509** *(FR-510, BR-502)*: Grep / inspect the loaded page's theme module → no `matchMedia('(prefers-color-scheme: dark)')` `change` listener (or `addListener`) remains registered that updates chrome or the editor after load.
- **VC-510** *(FR-511)*: With a non-empty editor document, caret mid-buffer, and undo depth ≥ 1, cycle Light → Dark → System → document text, caret offset, undo depth and scrollTop are unchanged after each cycle, and the editor's dark-theme flag matches the effective palette each time without a navigation.
- **VC-511** *(FR-513, FR-049 from spec-01)*: From page load press `Tab` through the toolbar → after `Symbols`, focus lands on `#btn-theme` with a visible focus ring; `Enter` and `Space` each advance the cycle once.
- **VC-512** *(FR-514, FR-516, BR-506)*: After each cycle → `document.documentElement.dataset.theme` equals the canonical preference string, and `getComputedStyle(document.documentElement).colorScheme` equals the effective palette (`light` or `dark`) per BR-503.
- **VC-513** *(NFR-501, NFR-505, BR-505)*: With a performance profile on the reference profile, activate `#btn-theme` → both chrome and editor reflect the new palette ≤ 100 ms after the click, no main-thread task exceeds 100 ms, the network panel records zero requests attributable to the click; compare the built bundle against the baseline build of commit `0a4194f` → gzipped app-payload increase ≤ 4 KB (HTML shell bootstrap included) and no new asset file appears in the precache manifest.
- **VC-514** *(NFR-502, NFR-503, extends VC-051 and VC-071 from spec-01)*: Force Light under OS dark and force Dark under OS light; sample the same text / non-text sets as the amended parent contrast suites plus the theme control glyph and its focus ring → every text ratio ≥ 4.5:1 and every non-text ratio ≥ 3:1.
- **VC-515** *(NFR-504, FR-047 from spec-01)*: Render at 375 × 667 → `document.documentElement.scrollWidth` ≤ 375; `#btn-theme` is unclipped; its hit box is ≥ 32 × 32 px.
- **VC-516** *(NFR-506)*: Execute VC-502, VC-505, VC-507, VC-508, VC-510 and VC-511 on each of the 8 pinned browser versions → all pass on all 8.
- **VC-517** *(BR-501, BR-504)*: After cycling through all three modes with storage available → the only theme key in `localStorage` is `pyplay.theme.v1`; `pyplay.program.v1` is untouched by theme cycles; `sessionStorage`, cookies and IndexedDB gain nothing from theme.
- **VC-518** *(BR-503)*: For each of the three preferences, compare a CSS custom-property used by page chrome (e.g. `--bg`) to the editor's dark-theme flag → they always agree on the same effective light/dark palette.
- **VC-519** *(sibling FR-301 / VC-301 amendment)*: Load the page → `#btn-symbols` still opens the Symbols pane per spec-03, and `#btn-theme` is the control after it (Symbols is no longer the toolbar's last control).
- **VC-520** *(regression)*: Run the automated spec-01 and spec-03 suites that do not depend on "Symbols is last" — `npm test` (Vitest + default Playwright project), `npm run audit:perf`, `npm run audit:contrast` — with the theme control present → every criterion those suites cover still passes under the amendments below.
- **VC-521** *(FR-515, FR-506)*: Set `pyplay.theme.v1` to `dark` and emulate OS `prefers-color-scheme: light`. Navigate with paint auditing (or assert in a Playwright `page.addInitScript` / CDP first-contentful check) → the first painted `body` / app background is the dark token (`rgb(20, 22, 26)` / `#14161a`), never the light `#ffffff`, and `document.documentElement.dataset.theme` is `"dark"` before the main module runs. Repeat with stored `light` under OS dark → first paint is light. Repeat with key absent under OS dark → first paint is dark with `data-theme="system"`.
- **VC-522** *(FR-516, BR-506)*: For preference `light`, `dark`, and `system` (under each OS), read `getComputedStyle(document.documentElement).colorScheme` → it equals the effective palette, not merely the preference string when preference is `system`.

---

## Parent-spec amendments

These parent criteria change because presentation and toolbar change. Nothing
else in spec-01 is amended.

| Parent VC / statement | Amendment |
|---|---|
| **Presentation** — "The page respects the OS dark-mode preference…" | Still true when preference is `system`. When preference is `light` or `dark`, the forced mode overrides the OS. |
| **VC-051** *(FR-048, NFR-010)* | Sampling must also pass when Light or Dark is **forced** against the opposite OS preference — see VC-514. |
| **VC-052** *(FR-049)* | Tab-order enumeration gains `#btn-theme` immediately after `Symbols` — see VC-511. |
| **VC-071** *(NFR-013)* | Non-text sampling must also pass under forced Light/Dark against the opposite OS preference — see VC-514. |
| **Persisted state table** | Gains `pyplay.theme.v1` as specified in *Data & Interfaces*. |

---

## Sibling-spec amendments (spec-03)

| Sibling item | Amendment |
|---|---|
| **FR-301** / **VC-301** | `Symbols` is no longer the toolbar's last control; `#btn-theme` follows it. `Symbols` labelling, `aria-expanded`, and `aria-controls` are otherwise unchanged. |
| **VC-315** | Tab-order list gains `#btn-theme` after `Symbols` and before the pane stop (when the pane is open). |

---

## Deliberately excluded

- **Live System tracking.** Updating chrome whenever the OS flips while the
  tab stays open was rejected: System is defined as a load-time sample
  (BR-502). A visitor who wants the new OS value reloads.
- **Segmented control with visible text.** Issue #3 allowed a segmented
  control; product choice is a single cycling icon button with tooltip
  (FR-501–FR-504).
- **Theme failure notices.** Storage problems fall back to System silently
  (FR-507) so the notice strip stays reserved for program / clipboard /
  runtime signals.
- **Custom palettes / high-contrast pack.** Would rewrite tokens and blow
  the NFR-505 budget; out of scope.

---

## Open Questions

None. All decisions are folded into the sections above.

---

## Assumptions

1. **A-501** — The existing `:root` and dark-palette token sets in
   `src/styles.css` already meet NFR-010 / NFR-013 when selected; this spec
   does not retune colours, only selection.
2. **A-502** — UI copy follows spec-01's English system-string assumption
   (A-05): mode labels are English even though `index.html` is `lang="es"`.
3. **A-503** — "No preference" / missing `prefers-color-scheme` support
   resolves like light for System (FR-509).
4. **A-504** — When the visitor cycles onto `system` mid-session, the
   effective palette uses the **same** OS sample taken at page load
   (BR-502), not a fresh `matchMedia` read.
5. **A-505** — The pinned Unicode glyphs (U+2600, U+263D, `S`) are legible
   at the control's ≥ 32 × 32 px hit area in the existing `--font-ui` stack on
   all pinned browsers; if a glyph fails that check on a matrix browser, the
   fix is a CSS sizing tweak, not a substitute character.
6. **A-506** — A short synchronous inline script in `index.html` that only
   reads `localStorage` and `matchMedia` once, sets `data-theme`, and does not
   touch the editor is acceptable under NFR-501 / NFR-009; it is not a
   "main-thread task longer than 100 ms" in practice on the reference profile.

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-09-02 | Resolved review action items: OQ-501 → FR-515 + VC-521 (before-first-paint bootstrap, no opposite-palette flash); pinned NFR-505 / VC-513 baseline to commit `0a4194f`; added FR-516 / BR-506 / VC-522 (`color-scheme` tracks effective palette). Open Questions cleared. |
| 1.0.1 | 2026-09-02 | Post-`/review-spec` fixes: split FR-507 load vs write-failure paths (no longer contradicts BR-504); promote FR-514 to Must; pin glyphs to U+2600 / U+263D / `S`; drop dangling `aria-pressed` mention; extend VC-506 for in-memory cycle when `setItem` throws. |
| 1.0.0 | 2026-09-02 | Initial draft from issue #3 and discovery answers: cycling icon control (sun / moon / `S`), System as Must with load-time OS sample only, `pyplay.theme.v1`, silent storage fallback, toolbar placement after Symbols. |

---

## Verification record

Implemented over four iterations against
[`specs/05-dark-mode-plan.md`](./05-dark-mode-plan.md); every `FR`, `BR` and
`NFR` above is discharged by the `VC` named beside it, and every one of those
criteria is an automated test named after it.

| Where | What it covers |
|---|---|
| `tests/unit/theme.test.ts` | parse / cycle / effective resolution (BR-501, BR-503; data half of FR-502 / FR-507) |
| `tests/e2e/theme.spec.ts` | VC-501 – VC-512, VC-517 – VC-519, VC-521, VC-522 |
| `tests/e2e/presentation.spec.ts` | VC-514, VC-515, and the amended parent VC-050, VC-051, VC-052, VC-071 |
| `tests/e2e/perf.spec.ts` | VC-513 against the recorded baseline build of `0a4194f` |
| `tests/e2e/matrix.spec.ts` | VC-516, opt-in via `MATRIX=1` |
| `tests/e2e/privacy.spec.ts` | amended VC-058 allow-list (`pyplay.theme.v1`) |
| `tests/e2e/symbols.spec.ts` | amended VC-301 / VC-315 / VC-320 (theme after Symbols) |

Implementation notes worth carrying forward:

- **Bootstrap vs module.** The inline `<head>` script and `src/theme.ts` share
  the three-value allow-list by convention (BR-501); the module re-applies
  `data-theme` / effective `color-scheme` idempotently after load.
- **`data-theme` vs `data-effective`.** Preference stays on `data-theme`; the
  effective palette is exposed as `data-effective` and as the used CSS
  `color-scheme` (BR-506). Forced modes never re-consult a live `@media`
  `(prefers-color-scheme)` listener for chrome or the editor (BR-502).
- **NFR-505.** The measured app-payload delta against `0a4194f` is **0.94 KiB
  gzipped** on linux zlib-ng (and slightly negative under macOS stock zlib),
  against a 4 KiB budget, with no added or removed asset file. Vendored
  megabytes stay pinned by digest as in VC-326.
- **VC-516.** The matrix subset reuses Playwright's `emulateMedia` for OS
  scheme and the same CodeMirror facet probe as `theme.spec.ts`; no
  clipboard permission is required. `#btn-theme` (and `#btn-symbols`) carry
  an explicit `tabindex="0"` so WebKit keeps them in sequential focus
  navigation — without it, Safari skipped the icon control entirely.
