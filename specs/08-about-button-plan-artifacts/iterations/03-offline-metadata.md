# Iteration 03 — Offline + zero-request + metadata edge e2e

## Criteria

| Criterion | Command | Result |
|---|---|---|
| VC-807 | `PW_PORT_BASE=4473 npm run build` then `npx playwright test --grep VC-807` | **PASS** |
| VC-812 (units: all-`unknown` + jsdom mount) | `npx vitest run tests/unit/build-metadata.test.ts` | **PASS** (13 tests; includes DOM mount) |
| VC-812 (e2e: real-build no link / non-empty) | `npx playwright test --grep VC-812` | **PASS** |
| VC-819 | same unit file — format.ts About exports | **PASS** |
| Full about e2e | `npx playwright test tests/e2e/about.spec.ts` | **PASS** (13 tests) |
| Full unit suite | `npx vitest run` | **PASS** (232 tests) |
| Precache URL count unchanged | `node -e "console.log(require('./dist/precache-manifest.json').urls.length)"` | **PASS** — **13** (same as post-Iteration-2) |
| Artifacts | `CONTEXT.md`, `DECISIONS.md` D-004, this file | **PASS** |

## Commit

- Message: `test(about): cover offline About open and unknown metadata`
- Tip: `git log -1 --format=%H` after this commit.

## Files touched

**Added**

- `specs/08-about-button-plan-artifacts/iterations/03-offline-metadata.md`

**Changed**

- `tests/e2e/about.spec.ts` — VC-807 offline describe (`serviceWorkers: 'allow'`); VC-812 real-build e2e; storage spy on open
- `tests/unit/build-metadata.test.ts` — VC-812 jsdom mount of all-`unknown` field nodes
- `specs/08-about-button-plan-artifacts/CONTEXT.md`
- `specs/08-about-button-plan-artifacts/DECISIONS.md` — D-004

## Deviations

- None material. Optional FR-810 storage spy included inside VC-807 (asserts zero `localStorage`/`sessionStorage` `getItem` during open).

## Gotchas

- VC-807 needs `test.use({ serviceWorkers: 'allow' })` in its describe — default Playwright config blocks SW.
- After `src/` changes, always `npm run build` before Playwright.
- Worktree: set `PW_PORT_BASE` (this run used `4473`).

## Playwright titles (hands-off)

- **VC-807**: `VC-807 (FR-810, BR-801, NFR-807): offline About open shows baked fields with zero requests`
- **VC-812**: `VC-812 (BR-803): real-build About fields are non-empty; commit is not a link`
  - Companion unit: `mounts all-unknown fields as plain-text DOM nodes (no link)` under `VC-812 (FR-815–FR-817, BR-802, BR-803): all inputs missing`

## Precache spot-check (hands-off)

```bash
node -e "console.log(require('./dist/precache-manifest.json').urls.length)"
# → 13
```

URLs remain: `/`, fingerprinted assets (js/css/worker), pyodide×5, ruff×2, `/precache-manifest.json`, `/sw.js`. No About/metadata URL added.

## For the next iteration

- Contrast / geometry / gzipped delta ≤ 4 KB vs branch-point `e569b8119e6ce797d49930fddcfb9fbec5fbd578` (Iteration 4).
- Do not add precache URLs; metadata stays inlined.
- VC-807 / VC-812 titles above are stable for `--grep`.
- Branch-point SHA unchanged.
