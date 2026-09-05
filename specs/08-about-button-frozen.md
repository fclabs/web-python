# Frozen: About Control (Deployment Version, Branch, Commit, Build Time)

Source: `specs/08-about-button.md` (v0.1.0)
Status: IMPLEMENTED on branch (not yet merged); Open Questions none
Frozen: 2026-09-05
PR / commit: https://github.com/fclabs/web-python/pull/26 (`5050d04` … `f6e6613`)
Parent: `specs/01-static-python-web-frozen.md`
Sibling: `specs/05-dark-mode-frozen.md` (toolbar / tab-order amendments)
Source issue: https://github.com/fclabs/web-python/issues/23

## Purpose

Visitors and maintainers currently have no in-app way to tell which build they
are looking at. Version is defined by the highest `vX.Y.Z` git tag (BR-102 from
spec-02; not `package.json`), Netlify deploys from git, and the only public
signals are the GitHub Release / tag. When debugging a preview, a production
regression, or a cached offline session, it is hard to confirm which commit and
branch produced the page. This spec adds a **toolbar About control** that opens
a modal dialog showing the **version**, **branch**, **commit** (short SHA), and
**build time** baked into the static bundle at build time.

## What it does

- `#btn-about` is last in the toolbar (after `#btn-theme`); glyph `i`; name/tooltip `About`; never About-inert / HTML-`disabled`.
- Opens a focus-trapped modal (`#about-dialog`) with Version → Branch → Commit → Built from bake-time metadata; dismiss via Escape / Close / backdrop; focus returns to `#btn-about`; zero network/storage I/O on open.
- Version: exact-tag `X.Y.Z`, else `{highest}+{shaPart}`, else `0.1.0+{shortsha}`, else `unknown`; Commit is 7 lowercase hex plain text (never a link); missing inputs → `unknown`.
- Presentation-only: no editor/worker/runId/console/stdin/`#notices` side effects; copy in `src/format.ts`. Tab order becomes Symbols → theme → About.

## Public interfaces / data

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

## Key decisions

- Bake four fields into the static bundle at build time — survives Cache Storage / airplane mode; no runtime fetch.
- Missing inputs → `unknown` (fields always defined); Commit never a link (issue #23).
- Presentation-only (no worker/editor side effects); Spec-07 may right-align the cluster but must keep Symbols → theme → About with nothing between theme and About.

## Known limits (still true at freeze)

- Open/close ≤ 100 ms; no attributable main-thread task > 100 ms; ≤ 4 KB gzipped app delta; zero runtime requests / new precache URLs.
- Text ≥ 4.5:1; non-text ≥ 3:1 both palettes; 375×667: no page horizontal overflow; `#btn-about` ≥ 32×32 hit area.
- Eight pinned browsers; `#btn-about` needs `tabindex="0"` for WebKit sequential focus.

## Deliberately excluded

- Help/docs beyond the four fields; dependency versions; commit links; release-pipeline changes; About storage keys; About-inert under load/run/offline/COI; AT audit beyond required names.
