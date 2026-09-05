# Iteration 05 — Human documentation + final verification

## Criteria

| Criterion | Command / check | Result |
|---|---|---|
| VC-820 docs topics | Read `docs/deployment.md` / `docs/architecture.md` | **PASS** — see headings below |
| Getting-started build | `npm run build` | **PASS** |
| Final: build | `npm run build` | **PASS** |
| Final: typecheck | `npx tsc --noEmit` (also via build) | **PASS** |
| Final: unit | `npm run test:unit` | **PASS** (232) |
| Final: Playwright | `PW_PORT_BASE=4473 npx playwright test` | **PASS** (243 passed, 34 skipped — matrix engines unavailable; Chromium green) |
| Final: contrast | `npm run audit:contrast` | **PASS** (8) |
| Final: perf | `npm run audit:perf` | **PASS** (5 passed, 1 skipped = VC-623 platform baseline; VC-814 delta **1270 B**, precache 13) |
| No plan/artifact/VC-8xx in shipped docs | `rg '08-about-button-plan\|plan-artifacts\|VC-8[0-9]{2}' docs/` | **PASS** (no matches) |
| Artifacts | `CONTEXT.md` shipped snapshot; this file; DECISIONS reflection | **PASS** |

## VC-820 evidence (section headings)

Required topics (build-time bake, preferred sources, `unknown` fallbacks, no required deploy env) appear under:

1. **`docs/deployment.md` → `## 5e. About dialog build metadata`**
   - Intro: four fields collected at Vite load / inlined; no fetch; no deploy-time env required.
   - **`### How each field is produced`** — table for Version / Branch / Commit / Built with preferred git/env sources and `unknown` fallbacks; notes that missing inputs do not fail the build.
2. **`docs/architecture.md` → `## About dialog`**
   - **`### Toolbar placement and binding`**
   - **`### Custom overlay (not `<dialog>`)**`
   - **`### Bundle-local metadata`** — injection via `__PYPLAY_BUILD_META__` / `buildMeta`; plain-text commit; tag-based version; `--about-backdrop` tokens.

## DECISIONS reflection

| ID | Decision | Docs vs internal |
|---|---|---|
| D-001 | Vite `define` `__PYPLAY_BUILD_META__` + `buildMeta` | **Docs** — `deployment.md` § 5e (collector + inject); `architecture.md` § Bundle-local metadata |
| D-002 | NFR-805 branch-point SHA `e569b811…` | **Internal** — audit baseline / artifact CONTEXT only; not a maintainer deploy concern |
| D-003 | Custom overlay modal (not `<dialog>`) | **Docs** — `architecture.md` § Custom overlay |
| D-004 | VC-812 coverage split (units + real-build e2e) | **Internal** — test strategy; no shipped-doc surface |
| D-005 | `--about-backdrop` dual palette tokens | **Docs** — `architecture.md` § Bundle-local metadata (scrim tokens) |
| D-006 | VC-817 matrix deferred on this host | **Internal** (noted in CONTEXT Known gaps); shipped docs must not claim matrix PASS — browser-matrix section unchanged; About not asserted there |

No new DECISIONS this iteration.

## Commit

- Message: `docs(about): document build metadata and About dialog`
- Tip: `git log -1 --format=%H` after this commit.

## Files touched

**Added**

- `specs/08-about-button-plan-artifacts/iterations/05-docs.md`

**Changed**

- `docs/deployment.md` — § 5e About dialog build metadata
- `docs/architecture.md` — § About dialog
- `specs/08-about-button-plan-artifacts/CONTEXT.md` — shipped-system snapshot

## Deviations

- None. Feature code untouched.
- Gzipped About delta on this final run measured **1270 B** (Iteration 4 recorded 1266 B); still ≤ 4096. CONTEXT updated to the final-verification figure.

## Gotchas

- Worktree: `PW_PORT_BASE=4473`.
- Shipped docs must not name the plan, artifact directory, or VC-8xx identifiers.
- Full `npx playwright test` skips unavailable matrix engines (34 skips here); exit 0 with Chromium green is the acceptance gate.

## For the next iteration

None — this is the last iteration. CONTEXT is the final build snapshot.
