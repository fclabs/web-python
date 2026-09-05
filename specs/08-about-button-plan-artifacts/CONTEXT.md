# CONTEXT — About control (Iteration 1)

Living snapshot for later iterations. Overwrite in place; do not append.

## Current state

- Pure build-metadata formatters live in `scripts/build-metadata.mjs` and are unit-tested (VC-809–813, VC-825).
- About user-visible strings are exported from `src/format.ts` (VC-819 / BR-807).
- Vite `define` injects `__PYPLAY_BUILD_META__` at config load for both `dev` and `build` (BR-801); `src/build-meta.ts` re-exports it as `buildMeta` and retains the object via a `globalThis` side effect so Rollup does not drop the literals.
- No About UI yet — `#btn-about` / dialog ids from the spec are still free.
- NFR-805 branch-point (tip before About code): `e569b8119e6ce797d49930fddcfb9fbec5fbd578`.

## File map

| Path | Role |
|---|---|
| `scripts/build-metadata.mjs` | Pure formatters + `readBuildMetadata()` git/env collector |
| `scripts/build-metadata.d.mts` | Type declarations for the `.mjs` module |
| `scripts/derive-version.mjs` | Reused `highestVersion` / `BOOTSTRAP_VERSION` / `parseVersion` (do not fork) |
| `src/format.ts` | About string constants (`ABOUT_*`, `UNKNOWN`) |
| `src/build-meta.ts` | App-facing `buildMeta` from `__PYPLAY_BUILD_META__` |
| `src/main.ts` | Side-effect `import './build-meta'` so the shell keeps the baked object |
| `vite.config.ts` | Calls `readBuildMetadata()` and `define`s `__PYPLAY_BUILD_META__` |
| `tests/unit/build-metadata.test.ts` | VC-809–813, VC-819, VC-825 |

## Public interfaces

```ts
// scripts/build-metadata.mjs
shortSha(fullSha: string | null | undefined): string
formatBuilt(isoOrDate: string | Date | null | undefined): string
formatVersion({ tags, headSha, headExactVersionTag }): string
resolveBranch({ gitBranch, envBranch }): string
collectBuildMetadata(inputs?): { version: string; branch: string; commit: string; built: string }
readBuildMetadata(options?: { cwd?: string }): { version; branch; commit; built }

// src/build-meta.ts
export type BuildMeta = { version: string; branch: string; commit: string; built: string }
export const buildMeta: BuildMeta  // from Vite define __PYPLAY_BUILD_META__

// src/format.ts (About)
ABOUT_GLYPH = 'i'
ABOUT_LABEL = 'About'
ABOUT_VERSION_LABEL | ABOUT_BRANCH_LABEL | ABOUT_COMMIT_LABEL | ABOUT_BUILT_LABEL
ABOUT_CLOSE_LABEL = 'Close'
UNKNOWN = 'unknown'
```

Injected compile-time constant name: **`__PYPLAY_BUILD_META__`** (JSON object via Vite `define`).

## Conventions & invariants

- Cite FR/BR/VC ids on non-obvious lines.
- Visitor-facing copy only in `src/format.ts`, quoted from the spec.
- Version semver order must keep using `highestVersion` from `derive-version.mjs`.
- Missing git/host inputs → literal `unknown` (BR-802); never empty string.
- Commit is plain text / never a URL (BR-803) — formatters must not invent links.
- Do not add About UI, dialog markup, or toolbar button until Iteration 2.

## Commands

```bash
npm ci
npx vitest run tests/unit/build-metadata.test.ts
npx vitest run tests/unit/
npx tsc --noEmit
npm run build
# prove injection: grep dist/assets/*.js for this build's short SHA or version
```

## Known gaps

- About toolbar control and modal dialog (Iteration 2).
- Offline / zero-request e2e (Iteration 3).
- Contrast, geometry, payload delta vs branch-point (Iteration 4) — use SHA `e569b8119e6ce797d49930fddcfb9fbec5fbd578`.
- Docs in `docs/deployment.md` / `docs/architecture.md` (Iteration 5).
