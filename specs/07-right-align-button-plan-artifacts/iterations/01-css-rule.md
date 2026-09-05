# Iteration 01 — CSS rule and logical-property gate

**Goal**: Ship the presentational CSS so the Symbols / color-mode pair sits at
the toolbar inline-end at ≥ 900 px, and lock BR-702 with a grep-style unit test.

**Commit message (intended)**: `feat: right-align Symbols and color-mode via toolbar CSS`

## Criteria results

| Criterion | Command | Result |
|---|---|---|
| VC-706 (BR-702 logical properties) | `npx vitest run tests/unit/toolbar-align.test.ts` | **PASS** — 2 tests, exit 0 |
| Full unit suite still green | `npm run test:unit` | **PASS** — 21 files, 221 tests, exit 0 |
| `index.html` byte-identical (BR-701) | `git diff HEAD -- index.html` | **PASS** — empty diff (0 bytes) |
| Artifacts present | Inspect `CONTEXT.md`, `DECISIONS.md`, this file | **PASS** — created this iteration |

Manual spot-check after `npm run build` was **not** required this iteration
(plan: unit + file inspection confirm rule placement; geometry VCs → Iter 2).

## Commit-ready file list

- `src/styles.css` — `#btn-symbols { margin-inline-start: auto; }` inside `@media (min-width: 900px)` with FR-701 / FR-705 / BR-702 comment
- `tests/unit/toolbar-align.test.ts` — VC-706 gate
- `specs/07-right-align-button-plan-artifacts/CONTEXT.md`
- `specs/07-right-align-button-plan-artifacts/DECISIONS.md` (D-001)
- `specs/07-right-align-button-plan-artifacts/iterations/01-css-rule.md` (this file)

Not included (out of scope / pre-existing untracked): `specs/07-right-align-button.md`,
`specs/07-right-align-button-plan.md` — leave for the human unless a later
iteration says otherwise.

## Hands-off confirmation

- Exact CSS: `#btn-symbols { margin-inline-start: auto; }` only under `@media (min-width: 900px)`.
- VC-706 test path: `tests/unit/toolbar-align.test.ts`.
- `#btn-files` has no new CSS rule (leading cluster unchanged).
- e2e geometry / tab / behaviour VCs still open (VC-701–705, VC-707–708).

## Deviations from the plan

None.

## Gotchas

- Fresh worktree needed `npm ci` before vitest could resolve `vitest/config`.
- `src/styles.css` already has an unrelated `margin-left: -1px` (~line 890,
  layout-group). VC-706 scopes assertions to the `#btn-symbols` rule body
  inside the 900 px block so that existing physical property does not false-fail.
- Comment text on the new rule mentions “margin-left/right” in prose; the test
  strips `/* … */` before matching, so comment wording is safe.

## For the next iteration

Iteration 2 should:

1. Read this artifact directory (`CONTEXT.md`, `DECISIONS.md`, this record).
2. `npm run build`, then add `tests/e2e/toolbar-align.spec.ts` discharging
   VC-701–705, VC-707, VC-708 (name tests after VC ids).
3. Set `PW_PORT_BASE` for this worktree before Playwright (e.g. `4300`).
4. Measure VC-701 against **content-box** inline-end (padding-aware), not raw
   border-box alone.
5. Keep production JS/HTML untouched; fix CSS only if Iter 1 placement is wrong.
6. Leave VC-709 and `docs/architecture.md` for Iteration 3.
7. Record a pre-change / Iter-1 `dist/` JS byte baseline in artifacts when
   convenient so Iter 3 can prove NFR-704 (identical JS bytes).
