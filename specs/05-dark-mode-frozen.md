# Frozen: User-Selectable Light / Dark Color Mode

Source: `specs/05-dark-mode.md` (v1.1.0)
Status: SHIPPED
Frozen: 2026-09-02
PR / commit: https://github.com/fclabs/web-python/pull/9 (`98ee032`)
Parent: `specs/01-static-python-web-frozen.md`
Sibling: `specs/03-vertical-pane-frozen.md`

## Purpose

Students using the playground today get light or dark chrome solely from the
operating-system `prefers-color-scheme` preference. Anyone who wants light UI
on a dark OS — or dark UI on a light OS — cannot override it. This spec adds a
**toolbar color-mode control** that lets the visitor force Light, force Dark,
or keep System (follow the OS preference sampled at page load). The choice
applies to page chrome and the CodeMirror editor together, and persists in
`localStorage` so it survives reloads.

## What it does

- The toolbar's last control is `#btn-theme`, immediately after `Symbols`, with no visible text — only the glyph for the current preference.
- Activating the control (pointer, Enter, Space) advances the preference `light` → `dark` → `system` → `light`. Chrome and the CodeMirror editor adopt the new effective palette in the same turn, without a reload, and without changing the editor document, caret, undo history or scroll position.
- The control's visible content is exactly the *Mode table* glyph; its `title` is the English label and its accessible name is `Color mode: <label>`.
- A missing, unreadable or non-canonical `pyplay.theme.v1` yields preference `system` for the session, with no theme notice. A failed persist still applies the in-memory cycle; a later successful write stores only a canonical value.
- A stored `light`, `dark` or `system` is the session preference. First paint of the chrome already matches the effective palette (inline bootstrap in `index.html`); the editor adopts it as soon as CodeMirror mounts. Forced `light`/`dark` wins over an opposite OS preference.
- When preference is `system`, a dark OS yields the dark palette and a light or no-preference OS yields the light palette. The OS query is sampled at most once per page load; a change while the tab stays open does not update chrome or the editor until the next full load.
- A successful cycle writes exactly `light`, `dark` or `system` to `localStorage['pyplay.theme.v1']` — raw string, no JSON, no other theme key.
- Tab order reaches `#btn-theme` after `Symbols`, with a visible focus ring. `document.documentElement` carries `data-theme` equal to the preference and a used CSS `color-scheme` equal to the effective palette (`light` or `dark`).

## Public interfaces / data

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

## Key decisions

- **Three canonical strings only** (BR-501): `light`, `dark`, `system` under `pyplay.theme.v1`. Matches spec-01's `pyplay.*.v1` convention and keeps nothing leaving the origin.
- **System is load-scoped, not live** (BR-502): `prefers-color-scheme` is read at most once per load. No `change` listener updates chrome or the editor while the document stays loaded. Cycling onto `system` mid-session reuses that same sample.
- **Chrome and editor share one effective palette** (BR-503): forced mode when preference is `light`/`dark`; otherwise the load-time OS sample.
- **`data-theme` is the preference; `color-scheme` is the effective palette** (BR-506): when preference is `system`, `data-theme="system"` while `color-scheme` is `light` or `dark`. Implementation also exposes the effective palette as `data-effective`; that attribute is not in the DOM contract above.
- **Storage failure is silent** (BR-504): persistence degrades; the session still cycles; no theme notice, so the strip stays reserved for program / clipboard / runtime signals.
- **No extra request or runtime asset** (BR-505): glyphs are plain text; the first-paint bootstrap is an inline `<script>` in `index.html`.

## Known limits (still true at freeze)

- **Apply ≤ 100 ms** (NFR-501); no new main-thread task longer than 100 ms.
- **Contrast** extends spec-01 under every selectable effective palette, including Light or Dark forced against the opposite OS: text ≥ 4.5:1 (NFR-502), non-text ≥ 3:1 (NFR-503). Existing token values are assumed already AA; this spec does not retune colours.
- **375 × 667** (NFR-504): `scrollWidth` ≤ 375 px; `#btn-theme` unclipped; hit area ≥ 32 × 32 px.
- **Budget** (NFR-505): ≤ 4 KB gzipped added to the app payload of commit `0a4194f`; zero extra requests; zero new runtime asset files. Measured delta at ship: **0.94 KiB** gzipped on linux zlib-ng (slightly negative on macOS stock zlib).
- **Browsers** (NFR-506): every Must FR on the eight pinned versions. `#btn-theme` (and `#btn-symbols`) carry explicit `tabindex="0"` so WebKit keeps the icon controls in sequential focus.
- **Parent amendments**: OS dark-mode respect still holds only when preference is `system`; forced modes override. VC-051 / VC-071 also sample forced-against-opposite-OS; VC-052 tab-order gains `#btn-theme` after `Symbols`; the persisted-state table gains `pyplay.theme.v1`.
- **Sibling (spec-03) amendments**: `Symbols` is no longer the toolbar's last control; VC-315 tab-order gains `#btn-theme` after `Symbols` and before the pane stop.

## Deliberately excluded

- Live System tracking while the tab stays open; a segmented control with visible text; theme-failure notices; custom palettes, a theme editor, or a separate high-contrast pack.
- Changing the existing light/dark token *values*; syncing the preference across devices or origins; any change to lint, format, execution, the worker, stdin, the service worker, or Symbols behaviour beyond the toolbar / tab-order amendments above.
