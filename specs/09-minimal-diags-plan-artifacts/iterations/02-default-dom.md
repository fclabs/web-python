# Iteration 02 — Header-only default, DOM separator, first-paint bootstrap

## Criteria

| Criterion | Command | Result |
|---|---|---|
| `npm run build` exits 0 | `npm run build` | **PASS** |
| VC-901 partial: vertical ≥ 900×700, no height key → header-scale; entry/empty not in panel client rect | Playwright probe vs `PW_PORT_BASE=4473 npm run preview` (seed `pyplay.layout.v2=vertical`, remove height key, viewport 1100×800); client-rect intersection check | **PASS** — panel client height 26 px (title 20); entry/empty `targetTop === clientBottom`; console ≥ 80 |
| VC-902 partial: `.panel` order unchanged; `#diag-resizer` not a `.panel`, between editor and stdin in DOM | Same probe | **PASS** — panels Special characters → Console → Editor → Standard input → Diagnostics → Files; `editor.nextElementSibling === #diag-resizer`; resizer height 8 px |
| Unit suite green | `npm run test:unit` | **PASS** — 21 files, 260 tests |
| Artifacts updated | `CONTEXT.md`, `DECISIONS.md` D-02/D-03, this record | **PASS** |

## Commit-ready file list

- `index.html` (bootstrap + `#diag-resizer`)
- `src/styles.css` (vertical grid + header-only + resizer chrome)
- `specs/09-minimal-diags-plan-artifacts/CONTEXT.md`
- `specs/09-minimal-diags-plan-artifacts/DECISIONS.md`
- `specs/09-minimal-diags-plan-artifacts/iterations/02-default-dom.md` (this file)

## Deviations

None. Scope matched the plan. Visibility chosen as CSS `@media` +
`[data-layout='vertical']` rather than the `hidden` attribute so the control
is already showable for probes; Iteration 3 still must `setInert()`.

## Gotchas

- Geometric intersection against the panel **border box** falsely fails by ~1 px
  (border); VC-901's "client rect" is the right clip edge.
- Preview serves `dist/` — rebuild after CSS changes before probing.
- Worktree: set `PW_PORT_BASE` (here `4473`) so preview does not collide.

## For the next iteration

- Mount resize controller from `main.ts`; measure header-only min from title +
  padding; call `maxDiagHeight` (D-01); apply `--diagnostics-height` + aria values.
- On vertical ≥ 900: show resizer and clear inert; elsewhere `hidden` +
  `setInert()` (never `disabled`) — CSS already hides outside that case.
- Persist on pointerup / keyboard step; clamp-without-rewrite on viewport change.
- Grid area `diagsep`, variable `--diagnostics-height`, fallback D-02 are locked.
