# Iteration 01 — Build-metadata collector + version formatter

## Criteria

| Criterion | Command | Result |
|---|---|---|
| VC-809–813, VC-825 | `npx vitest run tests/unit/build-metadata.test.ts` | **PASS** (12 tests) |
| VC-819 | same file — asserts `src/format.ts` About exports | **PASS** |
| Full unit suite (no regress) | `npx vitest run tests/unit/` | **PASS** (231 tests) |
| Typecheck | `npx tsc --noEmit` | **PASS** |
| BR-801 injection in bundle | `npm run build` then grep `dist/assets/*.js` for this machine's Version (`0.3.0`) and Commit (`e569b81`) | **PASS** — object present as `globalThis.__pyplayBuildMeta={version:\`0.3.0\`,…,commit:\`e569b81\`,…}` |
| Artifacts | `CONTEXT.md`, `DECISIONS.md`, this file | **PASS** |

## Commit

- Message: `feat(about): bake build metadata and About format strings`
- SHA: `daca3e60da052fbcab69766c9b12882620f60df1`

## Files touched

**Added**

- `scripts/build-metadata.mjs`
- `scripts/build-metadata.d.mts`
- `src/build-meta.ts`
- `tests/unit/build-metadata.test.ts`
- `specs/08-about-button-plan-artifacts/CONTEXT.md`
- `specs/08-about-button-plan-artifacts/DECISIONS.md`
- `specs/08-about-button-plan-artifacts/iterations/01-build-metadata.md`

**Changed**

- `src/format.ts` — About string constants
- `src/main.ts` — `import './build-meta'`
- `vite.config.ts` — `readBuildMetadata` + `define`

## Deviations

- Retained baked metadata via `globalThis.__pyplayBuildMeta` side effect in `src/build-meta.ts` because a bare `void buildMeta` import was tree-shaken and failed the dist grep criterion. Documented in D-001.

## Gotchas

- Rollup drops unused `define` replacements unless the importing module has a real side effect.
- `highestVersion([])` returns bootstrap `0.1.0`; formatters must detect “any parseable version tag” separately so FR-814 / all-`unknown` stay distinct from “tags exist”.
- Detached git `HEAD` branch name is the literal `HEAD` — treat as missing so Netlify `BRANCH` / `HEAD` env can win.

## For the next iteration

- Import `buildMeta` from `src/build-meta.ts`; strings from `src/format.ts`.
- Dialog / `#btn-about` ids are still free; place control immediately after `#btn-theme`.
- Branch-point for NFR-805: `e569b8119e6ce797d49930fddcfb9fbec5fbd578`.
- Amend theme/symbols tab-order tests that assume theme is last.
- Hands off from plan: metadata module paths, `{ version, branch, commit, built }` shape, `__PYPLAY_BUILD_META__` / `buildMeta`, no UI yet.
