# Contributing

## Layout

```
index.html                 the single page shell
src/                       application code (TypeScript, no framework)
  main.ts                  wiring: every FR is hooked up here
  controls.ts              the inert-but-focusable control pattern
  editor.ts                CodeMirror 6 setup
  console.ts               console rendering; console-buffer.ts caps it
  runtime.ts               owns the Pyodide worker, runIds, stop-and-replace
  worker/pyodide.worker.ts the worker: Pyodide, the Python runner, the stdin shim
  stdin-channel.ts         the SharedArrayBuffer wire format
  stdin-stream.ts          the pure CPython stdin semantics
  lint/                    Ruff engine, diagnostics, markers, panel, format
  offline.ts               service-worker registration and status wiring
scripts/                   build-time and test-time tooling
  precache.mjs             manifest + service-worker generation (shared)
  sw-template.js           the single service worker's source
  serve-plain.mjs          a non-isolated origin, for VC-015
  serve-deploy.mjs         a second deployment, for VC-063
tests/unit/                Vitest units
tests/e2e/                 Playwright specs, one test per Verification Criterion
docs/                      deployment and architecture references
specs/                     the spec and its implementation plan
```

Every test is named after the Verification Criterion it discharges
(`VC-030 (FR-029, FR-030, FR-031): …`), so `--grep "VC-030"` finds it and the
spec's *Verification Criteria* table is directly traceable to the suite.

## Running the test suites

Install the browsers once:

```bash
npm ci
npx playwright install chromium firefox webkit
```

### Unit tests (Vitest)

Pure logic only — the stdin stream state machine, console retention and write
truncation, diagnostic mapping, autosave debouncing, the storage layer, the
`runId` discipline. No browser, no Pyodide.

```bash
npx vitest run             # or: npm run test:unit
npx vitest                 # watch mode
npx vitest run tests/unit/stdin-stream.test.ts
```

### Browser tests (Playwright)

These run against the **built** site. `playwright.config.ts` starts three
servers for you and waits for them:

| Port | What | Why |
|---|---|---|
| 4173 | `npm run build && vite preview` | the site under test, with COOP/COEP |
| 4174 | `scripts/serve-plain.mjs` | the same build with **no** isolation headers, for VC-015 |
| 4175 | `scripts/serve-deploy.mjs` | a private copy that can publish a second deployment, for VC-063 |

```bash
npx playwright test                          # or: npm run test:e2e
npx playwright test tests/e2e/stdin.spec.ts
npx playwright test --grep "VC-030"
npx playwright test --headed --debug
```

Service workers are **blocked** by default (`use.serviceWorkers: 'block'`) so a
cache-first worker cannot mask the deliberately-404ed assets of VC-014 and
VC-049, and VC-015 can observe the page "with the service worker
unregistered". The offline and storage specs opt back in with
`test.use({ serviceWorkers: 'allow' })`.

Both suites together:

```bash
npm test                   # vitest run && playwright test
```

### Audits

```bash
npm run audit:perf         # VC-053: NFR-001–NFR-005, NFR-007, NFR-008 + the NFR-004 15 MB budget
npm run audit:contrast     # VC-051 (text >= 4.5:1) and VC-071 (non-text >= 3:1), light and dark
```

`audit:perf` prints every measurement next to its threshold. `audit:contrast`
samples `getComputedStyle` on the rendered page in both palettes, so a token
that is defined but never applied cannot make a sample pass.

### The browser matrix (VC-055, NFR-011)

```bash
npm run test:matrix
# or, spelled out:
npx playwright test --project=chrome-141 --project=chrome-140 \
                    --project=edge-141   --project=edge-140 \
                    --project=firefox-145 --project=firefox-144 \
                    --project=safari-26.1 --project=safari-26.0
```

Those eight projects run `tests/e2e/matrix.spec.ts` only; the default
`chromium` project runs everything else, so a plain `npx playwright test` runs
each spec exactly once. A project whose engine cannot be launched on this
machine is **omitted** from the config rather than stubbed, and the runner
prints which ones — see
[`docs/architecture.md` → *Browser matrix*](docs/architecture.md#browser-matrix)
for what each pinned name is actually mapped onto.

### Long-running and manual criteria

- `RUN_LONG=1 npx playwright test --grep "VC-059"` runs the real six-minute
  no-timeout check (skipped by default).
- Four criteria no script can assert: VC-056 (physically disconnect the
  network and reload), VC-059 (a six-minute untouched run), VC-063 (deploy a
  second build and watch for the update notice) and VC-021's greyscale check
  that the `[stderr] ` prefix survives without colour.

## Conventions

- **TypeScript is strict** and the build type-checks before it bundles
  (`npm run build` runs `tsc --noEmit`). `noUnusedLocals` and
  `verbatimModuleSyntax` are on.
- **Every non-obvious line cites its requirement.** Comments name the FR, BR,
  NFR or VC that forces the behaviour, so a future change knows what it is
  allowed to break.
- **User-visible strings live in `src/format.ts`** and are quoted verbatim from
  the spec. Change the spec first.
- **Never use the `disabled` attribute on a conditionally-inert control.** Use
  `setInert()` from `src/controls.ts` — see
  [`docs/architecture.md` → *Inert controls*](docs/architecture.md#inert-controls-fr-049-vs-fr-054--fr-058).
- **Docs are part of the change.** If you touch the worker protocol, the stdin
  channel or the deployment shape, update `docs/architecture.md` or
  `docs/deployment.md` in the same commit.
