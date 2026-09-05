# CONTEXT — About control (shipped)

Final build snapshot after Iteration 5. Overwrite in place; do not append.

## Current state

About is **shipped**: toolbar `#btn-about` (glyph `i`) after `#btn-theme` opens a
custom overlay modal showing Version / Branch / Commit / Built baked into the
bundle at Vite config load. No runtime fetch; no deploy-time env var required;
missing git/host inputs become the literal `unknown`.

- Pure formatters + collector: `scripts/build-metadata.mjs` (`readBuildMetadata`).
- Injection: Vite `define` `__PYPLAY_BUILD_META__` → `src/build-meta.ts` → `buildMeta`.
- UI: `bindAboutControl` in `src/about.ts`; markup in `index.html`; strings in `src/format.ts`.
- Maintainer docs: `docs/deployment.md` § *5e. About dialog build metadata*;
  `docs/architecture.md` § *About dialog*.
- Tests: unit formatters + jsdom; e2e interaction / offline / geometry; contrast
  and perf audits include About samples and the ≤ 4 KB gzipped delta gate.
- Measured gzipped app-payload delta vs branch-point
  `e569b8119e6ce797d49930fddcfb9fbec5fbd578`: **1270 B** on final verification
  (budget 4096 B; Iteration 4 recorded 1266 B on the same compressor);
  precache URL count **13**.
- Full eight-browser matrix for About interaction VCs is a **maintainer-local**
  optional gate (`MATRIX=1`); Chromium is the CI stand-in. Do not claim matrix
  PASS from Chromium alone.

## File map

| Path | Role |
|---|---|
| `scripts/build-metadata.mjs` | Pure formatters + `readBuildMetadata()` |
| `src/build-meta.ts` | App-facing `buildMeta` from `__PYPLAY_BUILD_META__` |
| `src/format.ts` | About string constants |
| `src/about.ts` | `bindAboutControl(button)` — glyph, fields, open/close/trap/backdrop |
| `src/main.ts` | Calls `bindAboutControl` after `bindThemeControl` |
| `index.html` | `#btn-about` after `#btn-theme`; dialog + backdrop markup (start `hidden`) |
| `src/styles.css` | `#btn-about` hit area; `.about-backdrop` / `.about-dialog`; `--about-backdrop` |
| `vite.config.ts` | Calls `readBuildMetadata()`; `define` injects `__PYPLAY_BUILD_META__` |
| `docs/deployment.md` | § 5e — field sources, `unknown` fallbacks, no required deploy env |
| `docs/architecture.md` | § About dialog — placement, overlay, bundle-local meta, invariants |
| `tests/e2e/about.spec.ts` | Interaction + offline + real-build plain-text commit |
| `tests/e2e/presentation.spec.ts` | Contrast + 375 geometry + parent CONTROLS |
| `tests/e2e/perf.spec.ts` | Open/close latency, zero-request, size/precache vs baseline |
| `tests/e2e/baseline-build-about.json` | NFR-805 branch-point app size record |
| `tests/unit/build-metadata.test.ts` | Formatter units + all-`unknown` jsdom mount + format exports |

## Public interfaces

```ts
// src/about.ts
export function bindAboutControl(button: HTMLButtonElement): void

// src/build-meta.ts
export type BuildMeta = { version: string; branch: string; commit: string; built: string }
export const buildMeta: BuildMeta

// DOM
#btn-about, #about-backdrop, #about-dialog, #about-title, #about-close,
#about-version, #about-branch, #about-commit, #about-built
(+ label dts: #about-version-label … #about-built-label)
```

Injected constant: **`__PYPLAY_BUILD_META__`**.

CSS tokens: **`--about-backdrop`** — light 50% black alpha; dark 42% white alpha.

## Conventions & invariants

- Visitor-facing copy only from `src/format.ts`.
- Commit field is plain text — no `a[href]`.
- `#btn-about` never `disabled` / never `setInert` for About reasons; still guards with `isInert()`.
- About must not import `EditorView`, touch the worker, or write `#notices`.
- Custom overlay (not native `<dialog>`).
- Metadata is bundle-local: open About performs zero network and does not read storage for metadata.
- Do not add About fields to the precache manifest. Do not relax NFR budgets.
- Version display reuses `highestVersion` / tag ordering from the release pipeline — not `package.json`.
- NFR-805 branch-point SHA: `e569b8119e6ce797d49930fddcfb9fbec5fbd578`.

## Commands

```bash
export PW_PORT_BASE=4473   # worktree: avoid colliding with other checkouts
npm run build
npx playwright test tests/e2e/about.spec.ts
npm run audit:contrast
npm run audit:perf
# Optional matrix when pinned engines exist:
MATRIX=1 npx playwright test --grep "VC-802|VC-804|VC-805|VC-806"
```

## Known gaps

- Maintainer-local only: full eight-browser About matrix deferred until pinned
  Edge/Firefox/Safari engines are available on the machine (Chromium stand-in
  green). No product or docs gap.
