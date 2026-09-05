# CONTEXT — About control (Iteration 4)

Living snapshot for later iterations. Overwrite in place; do not append.

## Current state

- Pure build-metadata formatters in `scripts/build-metadata.mjs` (unit-tested).
- Vite `define` injects `__PYPLAY_BUILD_META__`; `src/build-meta.ts` exports `buildMeta`.
- About strings live in `src/format.ts`.
- **UI shipped**: `#btn-about` after `#btn-theme`; custom overlay modal (`#about-backdrop` + `#about-dialog`) wired by `bindAboutControl` in `src/about.ts`; bound from `src/main.ts` after theme.
- Interaction + offline e2e in `tests/e2e/about.spec.ts` (VC-801–808, 812, 818, 821, 823, 824).
- **NFR audits shipped (Iteration 4)**:
  - VC-815: contrast samples for About glyph, focus ring, open-dialog text/labels/Close, dialog border, backdrop (via `--about-backdrop` tokens).
  - VC-816: 375 × 667 geometry for `#btn-about` (≥ 32×32, unclipped) and open dialog (no horizontal page overflow).
  - VC-814: open/close ≤ 100 ms, no long task > 100 ms, zero requests on open, gzipped app-payload delta vs branch-point, precache URL count unchanged at 13.
- **Measured gzipped app-payload delta** vs branch-point `e569b8119e6ce797d49930fddcfb9fbec5fbd578`: **1266 B** (budget 4096 B) on `darwin-arm64 zlib 1.2.12` (see `tests/e2e/baseline-build-about.json`).
- Precache manifest URL count: **13**.
- **VC-817 matrix**: full eight pinned browsers **deferred** — engines for edge/firefox/safari pins unavailable on this host (NFR-011). Chromium coverage of VC-802/804/805/806 remains green; maintainer should run `MATRIX=1 npx playwright test --grep "VC-802|VC-804|VC-805|VC-806"` locally when engines are installed.
- Docs in `docs/deployment.md` / `docs/architecture.md` still open (Iteration 5).

## File map

| Path | Role |
|---|---|
| `scripts/build-metadata.mjs` | Pure formatters + `readBuildMetadata()` |
| `src/build-meta.ts` | App-facing `buildMeta` from `__PYPLAY_BUILD_META__` |
| `src/format.ts` | About string constants |
| `src/about.ts` | `bindAboutControl(button)` — glyph, fields, open/close/trap/backdrop |
| `src/main.ts` | Calls `bindAboutControl` after `bindThemeControl` |
| `index.html` | `#btn-about` after `#btn-theme`; dialog + backdrop markup (start `hidden`) |
| `src/styles.css` | `#btn-about` hit area; `.about-backdrop` / `.about-dialog`; `--about-backdrop` per palette |
| `tests/e2e/about.spec.ts` | Interaction VCs + VC-807 offline + VC-812 real-build DOM |
| `tests/e2e/presentation.spec.ts` | Contrast (VC-815) + 375 geometry (VC-816) + parent CONTROLS |
| `tests/e2e/perf.spec.ts` | VC-814 open/close/size/precache; reads `baseline-build-about.json` |
| `tests/e2e/baseline-build-about.json` | NFR-805 branch-point app size / shape for VC-814 |
| `tests/unit/build-metadata.test.ts` | Formatter units + VC-812 jsdom mount + VC-819 |
| `package.json` | `audit:perf` includes VC-814; `audit:contrast` includes VC-815 |

## Public interfaces

```ts
// src/about.ts
export function bindAboutControl(button: HTMLButtonElement): void

// src/build-meta.ts
export type BuildMeta = { version: string; branch: string; commit: string; built: string }
export const buildMeta: BuildMeta

// DOM (index.html + about.ts fill)
#btn-about, #about-backdrop, #about-dialog, #about-title, #about-close,
#about-version, #about-branch, #about-commit, #about-built
(+ label dts: #about-version-label … #about-built-label)
```

Injected constant: **`__PYPLAY_BUILD_META__`**.

CSS tokens (NFR-803): **`--about-backdrop`** — light: 50% black alpha; dark: 42% white alpha (lighten-on-dark so scrim vs `--bg` clears 3:1).

## Conventions & invariants

- Visitor-facing copy only from `src/format.ts` (BR-807).
- Commit field is plain text — no `a[href]` (BR-803).
- `#btn-about` never `disabled` / never `setInert` for About reasons (BR-806); still guards with `isInert()`.
- About must not import `EditorView`, touch the worker, or write `#notices` (BR-804 / BR-805).
- Custom overlay (not native `<dialog>`) — see DECISIONS D-003.
- Metadata is bundle-local (BR-801 / FR-810): open About performs zero network and does not read storage for metadata.
- Do not add About fields to the precache manifest (NFR-805). Do not relax NFR budgets.
- NFR-805 branch-point SHA: `e569b8119e6ce797d49930fddcfb9fbec5fbd578` (D-002).

## Commands

```bash
export PW_PORT_BASE=4473   # worktree: avoid colliding with other checkouts
npm run build
npx playwright test tests/e2e/about.spec.ts
npm run audit:contrast   # includes VC-815
npm run audit:perf       # includes VC-814
npx playwright test --grep VC-816
# Precache URL count spot-check (expect 13):
node -e "console.log(require('./dist/precache-manifest.json').urls.length)"
# Optional matrix (VC-817) when pinned engines exist:
MATRIX=1 npx playwright test --grep "VC-802|VC-804|VC-805|VC-806"
```

## Known gaps

- Docs in `docs/deployment.md` / `docs/architecture.md` (Iteration 5).
- VC-817 full eight-browser matrix deferred until pinned engines are available locally (Chromium stand-in green).
- About NFR gaps from Iterations 1–3 are closed (contrast, geometry, payload).
