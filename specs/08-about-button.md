# Spec 08 — About Control (Deployment Version, Branch, Commit, Build Time)

| Field | Value |
|---|---|
| Version | 0.1.0 |
| Last Updated | 2026-09-05 |
| Status | **READY FOR PLAN** |
| Owner | Federico Castañeda |
| Parent spec | `specs/01-static-python-web-frozen.md` (SHIPPED) |
| Sibling | `specs/05-dark-mode-frozen.md` (SHIPPED) — toolbar / tab-order amendments |
| Source issue | [fclabs/web-python#23](https://github.com/fclabs/web-python/issues/23) — *Add About control showing deployment version, branch, and commit* |

This is a **child spec**. New requirements use the `8xx` range (FR-801+,
BR-801+, NFR-801+, VC-801+). Requirements imported from a parent keep the
parent's identifiers (e.g. "per FR-049 from spec-01") and are never
renumbered. Spec-07 (toolbar presentation / right-align, issue #22) may claim
the `7xx` range; this spec does not depend on it shipping first — About is
always the control immediately after `#btn-theme`.

---

## Purpose

Visitors and maintainers currently have no in-app way to tell which build they
are looking at. Version is defined by the highest `vX.Y.Z` git tag (BR-102 from
spec-02; not `package.json`), Netlify deploys from git, and the only public
signals are the GitHub Release / tag. When debugging a preview, a production
regression, or a cached offline session, it is hard to confirm which commit and
branch produced the page. This spec adds a **toolbar About control** that opens
a modal dialog showing the **version**, **branch**, **commit** (short SHA), and
**build time** baked into the static bundle at build time.

---

## Scope

### In scope

- One new toolbar control `#btn-about`, immediately after `#btn-theme` (new
  last control in document order inside `header.toolbar`).
- Visible glyph only: the Latin small letter `i` (U+0069). Accessible name and
  native tooltip are exactly `About`.
- A modal **About** dialog opened by activating the control (pointer, Enter,
  Space), with focus trapped while open; dismissed by Escape, an explicit Close
  control, or a click on the backdrop; focus returns to `#btn-about`.
- Dialog fields, always present, labeled and valued from build-time metadata:
  **Version**, **Branch**, **Commit**, **Built** (ISO 8601 UTC timestamp).
- Build-time injection of those four values into the static bundle (no runtime
  network call to obtain them). Documented fallbacks when git / host env cannot
  supply a field.
- User-visible strings centralized in `src/format.ts`, quoted from this spec.
- Keyboard reachability and a visible focus indicator for the control (extends
  FR-049 from spec-01).
- Docs updates in `docs/deployment.md` and/or `docs/architecture.md` describing
  how the four fields are produced per environment.
- The toolbar / tab-order amendments this control forces on parent / sibling
  verification criteria (see *Parent-spec amendments* and *Sibling-spec
  amendments*).

### Out of scope

- A full product documentation site, external docs browser, or in-app help
  beyond the four metadata fields.
- Changing the release / tagging pipeline (BR-102 from spec-02 stays).
- Showing Pyodide, Ruff, Node, or other dependency package versions.
- Linking the commit (or any field) to GitHub or any off-origin URL.
- Runtime fetches, cookies, `localStorage` / `sessionStorage` / IndexedDB keys
  for About metadata.
- Altering lint, format, execution, the worker protocol, stdin, the service
  worker, Symbols, theme cycling, or layout behaviour beyond the toolbar /
  tab-order amendments listed below.
- Making the About control inert / disabled under any normal page state
  (including while Python is loading, running, offline, or COI-degraded).
- Full screen-reader optimisation beyond the accessible names required here; an
  assistive-technology audit is not in scope (same posture as spec-01 / spec-05).

---

## Actors

| Actor | Description | Permissions |
|---|---|---|
| **Visitor** | Anyone who opens the page — unchanged from spec-01. No login, no identity, no roles. | Everything prior specs grant, plus: open and dismiss the About dialog; read the four metadata fields. Cannot change the baked values. |
| **Running Program** | The visitor's Python code executing inside the Web Worker — unchanged. | Unchanged. Opening or closing About never stops, pauses, or signals the worker. |
| **Maintainer** | Whoever builds and deploys the static bundle. | Produces the four metadata fields at build time (git and/or host env). Hosts that omit branch/SHA/time still ship defined `unknown` fallbacks. |

---

## Functional Requirements

Priority is MoSCoW: **M**ust, **S**hould, **C**ould.

| ID | P | Requirement |
|---|---|---|
| **FR-801** | M | **Given** the page has loaded, **when** the toolbar is rendered, **then** it contains exactly one About control as the **last** control in document order inside the toolbar, immediately after `#btn-theme`, identified by `id="btn-about"`, with no visible text label — only the glyph of FR-803. |
| **FR-802** | M | **Given** `#btn-about` is reachable, **when** the visitor activates it by pointer, `Enter`, or `Space`, **then** the About dialog (FR-805) opens within the same turn and focus moves into the dialog per FR-808. |
| **FR-803** | M | **Given** the About control is rendered, **when** it is inspected, **then** its visible content is exactly the Latin small letter `i` (U+0069) and nothing else (no adjacent text node naming the control). |
| **FR-804** | M | **Given** the About control is rendered, **when** it is inspected, **then** its native tooltip (`title`) is exactly `About` and its accessible name is exactly `About`. |
| **FR-805** | M | **Given** the dialog is open, **when** it is inspected, **then** it is the element `#about-dialog` with `role="dialog"` and `aria-modal="true"`, is labelled via `aria-labelledby` pointing at a visible heading whose text is exactly `About`, and contains exactly four labeled fields in this order: **Version**, **Branch**, **Commit**, **Built**, each showing the corresponding build-time value from *Build metadata* (or that field's fallback). |
| **FR-806** | M | **Given** the dialog is open, **when** the visitor presses `Escape`, activates the Close control, or activates (pointer-down then pointer-up) the backdrop outside the dialog panel, **then** the dialog closes, the backdrop is removed or hidden, and focus returns to `#btn-about`. |
| **FR-807** | M | **Given** the dialog is open, **when** it is inspected, **then** it contains exactly one Close control `#about-close` that is a `<button type="button">` whose accessible name and visible label are exactly `Close`. |
| **FR-808** | M | **Given** the dialog opens (FR-802), **when** focus is observed, **then** focus is inside `#about-dialog` (on `#about-close` or another focusable descendant of the dialog panel), and subsequent `Tab` / `Shift+Tab` cycles only among focusable descendants of the dialog panel until the dialog closes. |
| **FR-809** | M | **Given** the page has loaded, **when** the visitor walks the tab order from the start of the toolbar, **then** `#btn-about` is reached immediately after `#btn-theme`, carries a visible focus indicator while focused, and is operable with `Enter` and `Space` per FR-802. |
| **FR-810** | M | **Given** any cold load of a production-like build (including offline after a successful precache), **when** the About dialog is opened, **then** the four field values are already present in the page bundle — opening the dialog performs **zero** network requests and does not consult `localStorage`, `sessionStorage`, cookies, or IndexedDB. |
| **FR-811** | M | **Given** the visitor opens or closes About, **when** the editor and runtime are inspected afterwards, **then** the editor document, caret, undo history, and scroll position are unchanged, About has created no undo entry, scheduled no lint or autosave by itself, written no `#notices` entry, and left any running program, console output, and pending stdin read undisturbed. |
| **FR-812** | M | **Given** a build whose HEAD commit is exactly a git tag matching `vX.Y.Z`, **when** the Version field is shown, **then** its value is exactly `X.Y.Z` (no `v` prefix, no `+` suffix). |
| **FR-813** | M | **Given** a build whose HEAD is **not** exactly on a `vX.Y.Z` tag and at least one such tag exists in the repository at build time, **when** the Version field is shown, **then** its value is exactly `{highest}+{shaPart}` where `highest` is the highest `vX.Y.Z` tag with the `v` stripped (semver order per BR-102 / `highestVersion`) and `shaPart` is the Commit field value (the 7-hex short SHA when known, or `unknown` when HEAD SHA is missing). |
| **FR-814** | M | **Given** a build with **no** `vX.Y.Z` tag available at build time and a resolvable HEAD SHA, **when** the Version field is shown, **then** its value is exactly `0.1.0+{shortsha}` (bootstrap base from BR-102 of spec-02, plus the Commit short SHA). |
| **FR-815** | M | **Given** HEAD SHA is known at build time, **when** the Commit field is shown, **then** its value is exactly the first 7 lowercase hexadecimal characters of that SHA, as plain text (not a link). **Given** HEAD SHA is unknown, **then** the Commit value is exactly `unknown`. |
| **FR-816** | M | **Given** the git branch or host-provided branch name is known at build time, **when** the Branch field is shown, **then** its value is exactly that branch name as plain text. **Given** it is unknown, **then** the Branch value is exactly `unknown`. |
| **FR-817** | M | **Given** the build timestamp is known at build time, **when** the Built field is shown, **then** its value is exactly an ISO 8601 UTC timestamp with second precision ending in `Z` (example shape: `2026-09-05T19:09:35Z`). **Given** it is unknown, **then** the Built value is exactly `unknown`. |
| **FR-818** | M | **Given** a cold load, **when** the page is ready and the visitor has not activated `#btn-about`, **then** `#about-dialog` is not visible and is absent from the accessibility tree (e.g. `hidden` or equivalent), and `#about-backdrop` is not presented as an active dismiss layer. |
| **FR-819** | M | **Given** the dialog is open, **when** the visitor pointer-activates a toolbar control, the editor, the console, or any other page chrome that lies under the backdrop, **then** that activation is swallowed by the backdrop (those controls do not run their actions); only the dialog panel and the backdrop dismiss path (FR-806) receive pointer input. |

---

## Business Rules

| ID | Rule | Rationale | Exceptions |
|---|---|---|---|
| **BR-801** | Build metadata is **injected at build time** into the static bundle (e.g. Vite `define` or a generated module). The running page never fetches version/branch/commit/built from the network. | The product is backend-free and offline-capable; identity of the deployment must survive Cache Storage and airplane mode. | None. |
| **BR-802** | Missing or unreadable git / host inputs at build time yield the literal fallback string `unknown` for that field. Version follows FR-812–FR-814 when tags and/or SHA partially resolve (including `{highest}+unknown` when tags exist but SHA does not). When **neither** any `vX.Y.Z` tag **nor** HEAD SHA can be resolved, Version is `unknown`. A shipped build always has all four fields defined — never empty string, never omitted DOM. | Maintainers and VCs need an unconditional observable. | None. |
| **BR-803** | The Commit field is **always plain text**. It is never an `<a href>`, never opens a new browsing context, and never encodes a GitHub (or other) URL. | Simpler offline story; issue #23 chose plain text over linking. | None. |
| **BR-804** | Opening or closing About does not call `worker.terminate()`, does not allocate a new `runId`, does not clear the console, and does not touch the stdin `SharedArrayBuffer`. | Same spirit as Symbols staying non-disruptive to execution; About is presentation-only. | None. |
| **BR-805** | About does not hold an `EditorView` reference and must not dispatch editor transactions. | Same spirit as BR-301 (symbol pane must never touch the editor). | None. |
| **BR-806** | `#btn-about` is never given the HTML `disabled` attribute and is never passed through `setInert()` for About-related reasons. Activation paths still guard with `isInert()` only if some *other* future feature marks it inert. | Matches toolbar convention (FR-049 / Symbols / theme): keyboard traversal must always reach the control. | None for this spec's states. |
| **BR-807** | Field labels and chrome strings are exactly the *User-visible strings* table; they live in `src/format.ts` and are not hard-coded as one-off literals in markup beyond what the module writes. | Spec-01 convention: visitor-facing copy is centralized and quoted from the spec. | None. |

---

## Non-Functional Requirements

| ID | Requirement | Threshold |
|---|---|---|
| **NFR-801** | Dialog open / close latency on the reference profile. | From activation to dialog visible (and from dismiss to dialog gone + focus restored) ≤ 100 ms; no new main-thread task longer than 100 ms attributable to open or close. |
| **NFR-802** | Text contrast for dialog chrome and field text under every selectable effective palette (spec-05). | ≥ 4.5:1 (extends NFR-010 / VC-051 from spec-01 and VC-514 from spec-05). |
| **NFR-803** | Non-text contrast for dialog border, backdrop distinction, focus rings, and the About glyph. | ≥ 3:1 (extends NFR-013 / VC-071 / VC-514). |
| **NFR-804** | Narrow viewport. | At 375 × 667: `document.documentElement.scrollWidth` ≤ 375; `#btn-about` unclipped; hit area ≥ 32 × 32 px; open dialog content remains within the viewport (vertical scroll inside the dialog panel is allowed; the page itself must not gain horizontal overflow). |
| **NFR-805** | Bundle and network cost of this feature over its branch-point commit. | ≤ 4 KB gzipped added to the app payload; **zero** extra runtime requests when opening About; **zero** new emitted asset URL / precache-manifest entry beyond the existing app CSS/JS shells (metadata is inlined). |
| **NFR-806** | Browser matrix. | Every Must FR passes on the eight pinned browser versions of spec-01. `#btn-about` carries explicit `tabindex="0"` so WebKit keeps the icon control in sequential focus (same rationale as `#btn-theme`). |
| **NFR-807** | Offline. | After a successful precache, with the network offline, opening About still shows the four baked fields (FR-810). |

---

## Data & Interfaces

### Build metadata

Produced once per `npm run build` (and the `vendor`+Vite path used by `dev` /
CI). Normative field semantics:

| Field | Display label | Value rules | Fallback |
|---|---|---|---|
| Version | `Version` | FR-812 / FR-813 / FR-814; BR-802 | If neither tags nor SHA can be resolved: `unknown` |
| Branch | `Branch` | Git branch at build, or host env commonly used by Netlify (`BRANCH` / `HEAD`) when git cannot name the branch | `unknown` |
| Commit | `Commit` | First 7 lowercase hex characters of `HEAD` (FR-815) | `unknown` |
| Built | `Built` | ISO 8601 UTC second precision ending in `Z` (FR-817) | `unknown` |

The injection mechanism (Vite `define`, generated `.ts` module, etc.) is an
implementation choice; the observable contract is that the running page can
read all four values synchronously with no I/O.

### DOM

| Element | id / attr | Contract |
|---|---|---|
| About control | `btn-about` | `<button type="button">` inside `header.toolbar`; last toolbar control; immediately after `#btn-theme`; `tabindex="0"`; `title` and accessible name per FR-804; visible child is only the glyph of FR-803. |
| About dialog | `about-dialog` | Element with `role="dialog"` and `aria-modal="true"` when open; `aria-labelledby` references the About heading element; contains the four fields and the Close control. Hidden or absent from the accessibility tree when closed (FR-818). |
| About heading | `about-title` | Visible heading (e.g. `<h2>`) whose text is exactly `About`; the target of `#about-dialog`'s `aria-labelledby`. |
| Backdrop | `about-backdrop` | Full-viewport (or full-`#app`) clickable dismiss layer outside the dialog panel (FR-806, FR-819). Present only while open, or always present but inert/hidden while closed (FR-818). |
| Close control | `about-close` | `<button type="button">` inside the dialog; accessible name and visible label exactly `Close`. |
| Version value | `about-version` | Text content equals the Version metadata string. |
| Branch value | `about-branch` | Text content equals the Branch metadata string. |
| Commit value | `about-commit` | Text content equals the Commit metadata string (plain text, not a link). |
| Built value | `about-built` | Text content equals the Built metadata string. |

### User-visible strings

| String | Where |
|---|---|
| `i` (U+0069) | Visible glyph of `#btn-about` (FR-803). |
| `About` | `#btn-about` `title` and accessible name (FR-804); dialog heading text (FR-805). |
| `Version` / `Branch` / `Commit` / `Built` | Field labels inside the dialog (FR-805). |
| `Close` | Close control visible label and accessible name (FR-807). |
| `unknown` | Per-field fallback when build-time input is missing (BR-802). |

No other new visitor-facing copy. No About-related notice in `#notices`.

### Reused interfaces

- Toolbar conventions from spec-01 / spec-05: `tabindex="0"` on icon buttons;
  never HTML `disabled` for conditional inertness (`setInert` / `isInert` from
  `src/controls.ts` only if some other feature needs it — not About itself).
- Theme palettes (spec-05): dialog chrome uses existing CSS tokens; both
  effective palettes must meet NFR-802 / NFR-803.
- Offline precache (spec-01): About metadata is part of the already-cached app
  shell; no new precache URL.
- Version source of truth remains git tags (BR-102 from spec-02); this spec
  only *displays* a build-time snapshot, it does not retag or bump.

### Docs surface

`docs/deployment.md` and/or `docs/architecture.md` must describe:

1. That the four fields are baked at build time.
2. Preferred sources (git describe / highest tag, `rev-parse HEAD`, branch from
   git or host env, UTC clock for Built).
3. The `unknown` fallback when a host cannot supply a value.
4. That no deploy-time env var is *required* for the page to load — missing
   values degrade to `unknown`, they do not fail the build unless the
   implementation chooses to hard-fail (hard-fail is not required by this
   spec).

---

## Verification Criteria

Every FR and BR below has at least one criterion. Per repository convention,
each test is named after the criterion it discharges, so `--grep "VC-801"`
finds it.

- **VC-801** *(FR-801)*: Load the page → `#btn-about` is present, is the toolbar's last control, and is the next sibling after `#btn-theme`.
- **VC-802** *(FR-802, FR-805)*: Activate `#btn-about` by pointer → `#about-dialog` is visible with `role="dialog"`, `aria-modal="true"`, `aria-labelledby` referencing `#about-title`, heading text `About`, and the four fields present in order Version → Branch → Commit → Built with non-empty values.
- **VC-803** *(FR-803, FR-804)*: Inspect `#btn-about` → visible text content is exactly `i`, `title` is `About`, accessible name is `About`; no visible "About" text appears beside the glyph.
- **VC-804** *(FR-806, FR-807)*: Open the dialog; press `Escape` → dialog closes and focus is on `#btn-about`. Re-open; activate `#about-close` → same. Re-open; click `#about-backdrop` → same. Close control's accessible name is `Close`.
- **VC-805** *(FR-808)*: Open the dialog → focus is inside `#about-dialog`; pressing `Tab` repeatedly cycles only among focusable elements inside the dialog panel; focus never lands on `#btn-run`, the editor, or `#btn-about` until dismiss.
- **VC-806** *(FR-809, FR-049 from spec-01)*: From page load press `Tab` through the toolbar → after `#btn-theme`, focus lands on `#btn-about` with a visible focus ring; `Enter` and `Space` each open the dialog once.
- **VC-807** *(FR-810, BR-801, NFR-807)*: With the network offline (after precache), open About → four fields show non-empty values (baked or `unknown`); the network log records zero requests attributable to the open.
- **VC-808** *(FR-811, BR-805)*: With a non-empty editor document, caret mid-buffer, undo depth ≥ 1, open and close About → document text, caret offset, undo depth and scrollTop are unchanged; no About string appears in `#notices`.
- **VC-809** *(FR-812, FR-815)*: Build (or test double) with HEAD exactly at tag `v1.2.3` and SHA `abcdef0123456789…` → Version text is `1.2.3`, Commit text is `abcdef0`.
- **VC-810** *(FR-813, FR-815)*: Build (or test double) with highest tag `v1.2.3`, HEAD not at that tag, SHA `abcdef0123456789…` → Version text is `1.2.3+abcdef0`, Commit text is `abcdef0`.
- **VC-811** *(FR-814, FR-815)*: Build (or test double) with no `vX.Y.Z` tags and SHA `abcdef0123456789…` → Version text is `0.1.0+abcdef0`.
- **VC-812** *(FR-815, FR-816, FR-817, BR-802, BR-803)*: Build (or test double) with all git/host inputs missing → each of Version, Branch, Commit, Built is exactly `unknown`; `#about-commit` contains no `a[href]` descendant and its text is not a URL.
- **VC-813** *(FR-816, FR-817)*: Build (or test double) with branch `main` and Built `2026-09-05T19:09:35Z` → Branch text is `main`, Built text is exactly that timestamp.
- **VC-814** *(NFR-801, NFR-805, BR-801)*: On the reference profile, open and close About → each transition completes ≤ 100 ms, no attributable main-thread task exceeds 100 ms, network panel records zero requests; compare the built bundle against this feature's branch-point commit → gzipped app-payload increase ≤ 4 KB and no new precache-manifest URL appears for About metadata.
- **VC-815** *(NFR-802, NFR-803)*: Extend the rendered light/dark contrast audit to the About glyph, focus ring, open dialog text, field labels, Close control, and dialog border/backdrop → text ≥ 4.5:1, non-text ≥ 3:1 under both effective palettes.
- **VC-816** *(NFR-804)*: Render at 375 × 667 → `scrollWidth` ≤ 375; `#btn-about` unclipped with hit box ≥ 32 × 32 px; open the dialog → no horizontal page overflow; dialog content is reachable within the viewport.
- **VC-817** *(NFR-806)*: Execute VC-802, VC-804, VC-805, and VC-806 on each of the 8 pinned browser versions → all pass on all 8.
- **VC-818** *(FR-811, BR-804, BR-806)*: Start a long-running program so Stop is enabled; open About → Run/Stop enablement and any pending stdin prompt stay as they were, console output is unchanged, `#btn-about` has no `disabled` attribute, and `aria-disabled` is not `true` solely because About exists.
- **VC-819** *(BR-807)*: Grep / unit-assert `src/format.ts` exports the About strings (`About`, field labels, `Close`, glyph) and the dialog/button UI reads those exports rather than duplicate literals.
- **VC-820** *(docs)*: `docs/deployment.md` and/or `docs/architecture.md` describe build-time injection, preferred sources, and the `unknown` fallback for each of the four fields.
- **VC-821** *(sibling / parent tab-order amendment)*: Load the page → `#btn-theme` still cycles color mode per spec-05; `#btn-about` is the control after it (theme is no longer the toolbar's last control).
- **VC-822** *(regression)*: Run the automated suites that do not depend on "theme is last" — unit tests, default Playwright project, `audit:perf`, `audit:contrast` — with About present → every criterion those suites cover still passes under the amendments below.
- **VC-823** *(FR-818)*: Cold load without activating About → `#about-dialog` is not visible / not exposed in the accessibility tree; `#about-backdrop` is not an active dismiss layer.
- **VC-824** *(FR-819)*: Open About; click `#btn-run` (or another toolbar control under the backdrop) → that control's action does not fire; dialog stays open until an FR-806 dismiss.
- **VC-825** *(FR-813, BR-802)*: Build (or test double) with highest tag `v1.2.3`, HEAD not at that tag, and SHA unresolved → Version text is `1.2.3+unknown`, Commit text is `unknown`.

---

## Parent-spec amendments

These parent criteria change because the toolbar gains a control. Nothing else
in spec-01 is amended.

| Parent VC / statement | Amendment |
|---|---|
| **VC-052** *(FR-049)* | Tab-order enumeration gains `#btn-about` immediately after `#btn-theme` — see VC-806. |
| **Presentation / toolbar** | Last control is `#btn-about`, not `#btn-theme`. |

---

## Sibling-spec amendments

| Sibling VC / statement | Amendment |
|---|---|
| **spec-05 FR-501 / VC-501** | `#btn-theme` is no longer the toolbar's last control; it remains immediately after `#btn-symbols`, and `#btn-about` follows it — see VC-801 / VC-821. |
| **spec-05 VC-511** | Tab order after `Symbols` is `#btn-theme` then `#btn-about`. |
| **spec-03 VC-315** (if still enumerated as ending at theme) | Gains `#btn-about` after `#btn-theme` before any pane stop. |

---

## Open Questions

None.

---

## Assumptions

- Short SHA length is exactly **7** characters (git's common default abbrev), lowercase hex.
- "Highest tag" uses the same semver ordering as `highestVersion` in `scripts/derive-version.mjs` (BR-102).
- Host branch env names `BRANCH` and `HEAD` (Netlify) are acceptable sources when `git` cannot name the branch at build time; other hosts map equivalently in docs.
- Spec-07 (issue #22, right-align presentation cluster) may move Symbols / theme / About as a group to the inline-end; it must preserve document order `… → Symbols → theme → About` and must not insert controls between theme and About.
- The Latin small letter `i` is an acceptable "info" glyph without requiring the INFORMATION SOURCE symbol (U+2139).
- The NFR-805 branch-point commit is the merge-base / tip at which implementation begins; it is recorded in the implementing PR like prior child specs.
- Opening About while the Symbols pane is open leaves the pane's open/closed state unchanged (Symbols stays open behind the modal until the visitor toggles it after dismiss).