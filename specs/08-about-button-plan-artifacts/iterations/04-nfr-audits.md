# Iteration 04 — Contrast, geometry, perf budget, regression hardening

## Criteria

| Criterion | Command | Result |
|---|---|---|
| VC-814 | `PW_PORT_BASE=4473 npm run build` then `npx playwright test --grep VC-814` | **PASS** (open/close ≤ 100 ms; long tasks 0; 0 requests; delta **1266 B**; precache **13**) |
| VC-815 | `npm run audit:contrast` (titles include VC-815) | **PASS** (8 tests) |
| VC-816 | `npx playwright test --grep VC-816` | **PASS** |
| VC-822 unit | `npm run test:unit` | **PASS** (232) |
| VC-822 Chromium e2e | `npx playwright test --project=chromium` after build | **PASS** (243 passed, 2 skipped) |
| VC-822 `audit:perf` | `npm run audit:perf` | **PASS** (5 passed, 1 skipped = VC-623 uncovered darwin compressor for completion baseline — pre-existing) |
| VC-822 `audit:contrast` | `npm run audit:contrast` | **PASS** |
| Gzipped delta ≤ 4 KB | vs `e569b8119e6ce797d49930fddcfb9fbec5fbd578` via `baseline-build-about.json` | **PASS** — **1266 B** (`darwin-arm64 zlib 1.2.12`) |
| Precache URL count | `node -e "…manifest.urls.length"` | **PASS** — **13** |
| VC-817 matrix | `MATRIX=1 npx playwright test --grep "VC-802\|VC-804\|VC-805\|VC-806"` | **DEFERRED** — only Chromium ran (4/4 green); edge/firefox/safari pins unavailable (NFR-011). See D-006 / CONTEXT. |
| Artifacts | `CONTEXT.md`, `DECISIONS.md` D-005/D-006, this file | **PASS** |

## Commit

- Message: `test(about): meet About contrast, geometry, and payload budgets`
- Tip: `git log -1 --format=%H` after this commit.

## Files touched

**Added**

- `tests/e2e/baseline-build-about.json` — branch-point size record for VC-814
- `specs/08-about-button-plan-artifacts/iterations/04-nfr-audits.md`

**Changed**

- `src/styles.css` — `--about-backdrop` light/dark tokens; backdrop uses the token
- `tests/e2e/presentation.spec.ts` — About contrast samples (VC-815); VC-816 geometry
- `tests/e2e/perf.spec.ts` — VC-814 open/close/size/precache
- `tests/e2e/completion.spec.ts` — platform-aware redo chord for VC-611 on darwin
- `package.json` — `audit:perf` / `audit:contrast` greps include VC-814 / VC-815
- `specs/08-about-button-plan-artifacts/CONTEXT.md`
- `specs/08-about-button-plan-artifacts/DECISIONS.md` — D-005, D-006

## Deviations

- **VC-611 redo key**: `ControlOrMeta+y` does not redo on macOS (`historyKeymap` uses `Mod-Shift-z`). Test updated to press `Meta+Shift+z` on darwin so local Chromium VC-822 matches Linux CI. Unrelated to About UI; required for green full suite on this host.
- **VC-817**: deferred per D-006 rather than claimed PASS.

## Gotchas

- After `src/` changes, always `npm run build` before Playwright.
- Worktree: `PW_PORT_BASE=4473`.
- Re-record About baseline on a new compressor: `node scripts/record-baselines.mjs e569b8119e6ce797d49930fddcfb9fbec5fbd578 --build tests/e2e/baseline-build-about.json`.
- Dark backdrop must *lighten* the page; black alpha on near-black fails 3:1 by construction.

## Measured payload (hands-off)

| Field | Value |
|---|---|
| Branch-point | `e569b8119e6ce797d49930fddcfb9fbec5fbd578` |
| Compressor | `darwin-arm64 zlib 1.2.12` |
| Branch-point app gzip | 162773 B |
| Current app gzip | 164039 B |
| **Delta** | **1266 B** (≤ 4096) |
| Precache URLs | 13 |

## CSS tokens (hands-off)

- Light: `--about-backdrop: color-mix(in srgb, #000000 50%, transparent);`
- Dark: `--about-backdrop: color-mix(in srgb, #ffffff 42%, transparent);`

## For the next iteration

- Synthesize docs into `docs/deployment.md` and `docs/architecture.md` (VC-820) — no plan/artifact/VC language in shipped docs.
- Record D-001–D-005 (and D-006 as internal if desired) as reflected or internal in `iterations/05-docs.md`.
- Measured delta **1266 B**; precache still 13; `--about-backdrop` dual tokens are load-bearing for contrast.
- VC-817 still deferred unless maintainer has matrix engines.
- Do not ship half-updated docs earlier — this is Iteration 5’s job only.
