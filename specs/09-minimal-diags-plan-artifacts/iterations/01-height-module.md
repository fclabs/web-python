# Iteration 01 — Height preference module and strings

## Criteria

| Criterion | Command | Result |
|---|---|---|
| `diag-resize` unit suite | `npx vitest run tests/unit/diag-resize.test.ts` | **PASS** — 41 tests |
| `format` unit suite | `npx vitest run tests/unit/format.test.ts` | **PASS** — 7 tests (suite does not list layout/theme strings; new quotes covered in `diag-resize.test.ts`, same pattern as layout) |
| VC-909 unit slice: non-canonical not overwritten; `saveDiagHeight` false on `setItem` throw | Covered inside `tests/unit/diag-resize.test.ts` (`VC-909: loadDiagHeight`, `saveDiagHeight` rejection case) | **PASS** |
| Artifacts: this record + CONTEXT file map + DECISIONS formula | Written under `specs/09-minimal-diags-plan-artifacts/` | **PASS** |

## Commit-ready file list

- `src/diag-resize.ts` (new)
- `src/format.ts` (add two string constants)
- `tests/unit/diag-resize.test.ts` (new)
- `specs/09-minimal-diags-plan-artifacts/CONTEXT.md` (new)
- `specs/09-minimal-diags-plan-artifacts/DECISIONS.md` (new)
- `specs/09-minimal-diags-plan-artifacts/iterations/01-height-module.md` (this file)

## Deviations

None. Scope matched the plan. `format.test.ts` was not extended because it does
not assert layout/theme string exports; diagnostics strings are asserted in
`diag-resize.test.ts` (mirrors `layout.test.ts`).

## Gotchas

- Canonical regex rejects leading zeros (`036`) and `0` — treat as absent, leave store alone.
- `saveDiagHeight` truncates with `Math.trunc` then re-checks canonicity so `0` / negatives never write.
- `npm ci` was required before vitest on a fresh worktree.

## For the next iteration

- Helpers and strings are ready to import; wire DOM / CSS / bootstrap only (no
  pointer persistence yet per Iteration 2 scope).
- Use `DIAG_RESIZER_LABEL` (or the identical literal) for `#diag-resizer` aria-label.
- `maxDiagHeight` formula is locked in D-01 — call it once right-column height is measurable.
- Header-only CSS fallback mechanism is still undecided — record it in DECISIONS when chosen.
- Keep document order: insert `#diag-resizer` immediately after editor, before stdin; do not re-parent panels.
