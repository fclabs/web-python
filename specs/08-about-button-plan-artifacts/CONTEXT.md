# CONTEXT — About control (Iteration 2)

Living snapshot for later iterations. Overwrite in place; do not append.

## Current state

- Pure build-metadata formatters in `scripts/build-metadata.mjs` (unit-tested).
- Vite `define` injects `__PYPLAY_BUILD_META__`; `src/build-meta.ts` exports `buildMeta`.
- About strings live in `src/format.ts`.
- **UI shipped**: `#btn-about` after `#btn-theme`; custom overlay modal (`#about-backdrop` + `#about-dialog`) wired by `bindAboutControl` in `src/about.ts`; bound from `src/main.ts` after theme.
- Interaction e2e in `tests/e2e/about.spec.ts` (VC-801–806, 808, 818, 821, 823, 824).
- Sibling theme/symbols/presentation/layout tab-order assertions amended for About-as-last.
- NFR-805 branch-point (unchanged): `e569b8119e6ce797d49930fddcfb9fbec5fbd578`.

## File map

| Path | Role |
|---|---|
| `scripts/build-metadata.mjs` | Pure formatters + `readBuildMetadata()` |
| `src/build-meta.ts` | App-facing `buildMeta` from `__PYPLAY_BUILD_META__` |
| `src/format.ts` | About string constants |
| `src/about.ts` | `bindAboutControl(button)` — glyph, fields, open/close/trap/backdrop |
| `src/main.ts` | Calls `bindAboutControl` after `bindThemeControl` |
| `index.html` | `#btn-about` after `#btn-theme`; dialog + backdrop markup (start `hidden`) |
| `src/styles.css` | `#btn-about` hit area; `.about-backdrop` / `.about-dialog` tokens |
| `tests/e2e/about.spec.ts` | Iteration 2 interaction VCs |
| `tests/e2e/theme.spec.ts` | Amended VC-501 / VC-511 / VC-519 |
| `tests/e2e/symbols.spec.ts` | Amended VC-301 / VC-315 tab order |
| `tests/e2e/presentation.spec.ts` | CONTROLS + VC-052 targets include `#btn-about` |
| `tests/e2e/layout.spec.ts` | VC-407 enumeration includes `btn-about` |
| `tests/unit/build-metadata.test.ts` | Iteration 1 units (unchanged) |

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

## Conventions & invariants

- Visitor-facing copy only from `src/format.ts` (BR-807).
- Commit field is plain text — no `a[href]` (BR-803).
- `#btn-about` never `disabled` / never `setInert` for About reasons (BR-806); still guards with `isInert()`.
- About must not import `EditorView`, touch the worker, or write `#notices` (BR-804 / BR-805).
- Custom overlay (not native `<dialog>`) — see DECISIONS D-003.
- Geometric click on dimmed area → backdrop dismiss (FR-806); synthetic click on chrome under modal → swallowed, dialog stays open (FR-819).

## Commands

```bash
export PW_PORT_BASE=4473   # worktree: avoid colliding with other checkouts
npm run build
npx playwright test tests/e2e/about.spec.ts
npx playwright test tests/e2e/theme.spec.ts tests/e2e/symbols.spec.ts
npx vitest run
```

## Known gaps

- Offline / zero-request e2e (Iteration 3).
- Contrast, geometry, payload delta vs branch-point (Iteration 4) — SHA `e569b8119e6ce797d49930fddcfb9fbec5fbd578`.
- Docs in `docs/deployment.md` / `docs/architecture.md` (Iteration 5).
