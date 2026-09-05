# Iteration 03 — Pointer/keyboard resize, persistence, inert outside vertical

## Criteria

| Criterion | Command | Result |
|---|---|---|
| `npm run build` exits 0 | `npm run build` | **PASS** |
| `diag-resize` unit suite | `npx vitest run tests/unit/diag-resize.test.ts` | **PASS** — 42 tests (incl. `minDiagHeightFromMeasurements`) |
| VC-903 drag to max ≤40% / console ≥80 | Playwright smoke vs `vite preview --port 4473` | **PASS** — diagH=277 ratio=0.400 console=337 |
| VC-904 drag to min = header-only | same | **PASS** — diagH=26 = valuemin |
| VC-905 arrow steps 16/48 | same | **PASS** — 16/48/-16/-48 |
| VC-906 horizontal + 375px hide/inert | same | **PASS** — hidden + `aria-disabled=true`; ArrowUp no-ops valuenow/css |
| VC-907 reload restores mid height | same | **PASS** — restored 170, stored=`170` |
| VC-908 oversize clamps without rewrite | same | **PASS** — now=max=277, stored remains `9999` |
| VC-910 failed setItem notice once | same | **PASS** — one notice; in-memory height grew |
| VC-911 never `disabled` | same | **PASS** |
| Artifacts updated | CONTEXT, DECISIONS D-04–D-06, this record | **PASS** |

## Commit-ready file list

- `src/diag-resize.ts` (`mountDiagResizer`, `minDiagHeightFromMeasurements`)
- `src/main.ts` (mount + `renderLayout` → `sync`)
- `tests/unit/diag-resize.test.ts` (min-from-measurements cases)
- `specs/09-minimal-diags-plan-artifacts/CONTEXT.md`
- `specs/09-minimal-diags-plan-artifacts/DECISIONS.md`
- `specs/09-minimal-diags-plan-artifacts/iterations/03-resize-wire.md` (this file)

## Deviations

None. Scope matched the plan. Interactive smoke used a one-off Playwright
script against `vite preview --port 4473` (vite preview ignores `PW_PORT_BASE`;
port set explicitly). Full e2e suite remains Iteration 4.

## Gotchas

- `addInitScript` that clears the height key runs on every navigation — smoke
  must seed only once (session flag) or VC-907/908 falsely fail.
- Measuring max without first pinning to min lets an oversize bootstrap height
  inflate the right-column measure (D-06).
- In horizontal layout, panel client height is not a reliable inertness signal;
  assert `aria-valuenow` / `--diagnostics-height` unchanged instead.

## For the next iteration

- Hands-off for e2e: `mountDiagResizer` from `src/diag-resize.ts`; `main.ts`
  calls it once and `diagResizer.sync()` inside `renderLayout`.
- Persist on pointerup/cancel and on keyboard steps that change height; never
  on viewport/layout clamp alone.
- Min selectors: `.panel--diagnostics .panel-title` + panel computed padding.
- Grid `diagsep`, `--diagnostics-height`, D-01–D-06 locked.
- Iteration 4: add `tests/e2e/diag-resize.spec.ts` (VC-901–911, VC-913), keep
  VC-409/435 green, extend contrast/perf for NFR-901–905 / VC-912.
