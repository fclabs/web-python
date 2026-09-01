# Implementation Plan: Static Python-in-the-Browser Playground

**Spec**: [`specs/01-static-python-web.md`](./01-static-python-web.md) (v1.3.0)

We build a static, backend-free single-page Python playground: a CodeMirror 6
editor plus a console, with a real CPython (Pyodide) interpreter running in a
Web Worker, suspended stdin over `SharedArrayBuffer` + `Atomics.wait`, Ruff-WASM
lint and format, and a single service worker that supplies cross-origin
isolation and offline precaching. Each iteration below delivers a working,
runnable increment and ends in one commit.

---

## Ground rules for every iteration

1. **Gate** — do not start iteration N+1 until every success criterion of
   iteration N has been verified, by hand or by an automated test.
2. **Tests green** — each iteration leaves its own tests passing. The full
   regression suite runs once, at *Final Verification*.
3. **Commit** — each iteration ends with exactly one git commit of all its
   changes, using the stated commit message.
4. **Docs last** — all documentation ships in Iteration 8. No half-documented
   intermediate states.
5. **No orphaned state** — if an iteration is abandoned mid-way, the build must
   still succeed and previously passing tests must still pass.

### Tooling decisions (spec is silent — flagged, not assumed silently)

The spec's *Reference implementation choices* pins Pyodide 0.28.x, CodeMirror
6.x, `@astral-sh/ruff-wasm-web` 0.14.x and "a directory of static files", but
names no build tool or test runner. This plan uses **Vite** (static build
output, easy dev-server header control) and **Playwright** (the Verification
Criteria are overwhelmingly browser-level: real workers, real
`SharedArrayBuffer`, real clipboard) plus **Vitest** for pure logic units
(stdin stream semantics, console truncation, diagnostic mapping). If the
maintainer prefers different tools, only Iteration 1 changes.

---

## Iteration 1: Static shell, editor, and persistence

**Goal**: A deployable static page whose editor is fully usable — typing,
highlighting, autosave, restore, copy, reset — with no Python involved.

**Scope**:
- Vite project producing a static `dist/` (`index.html`, hashed JS/CSS assets).
- Dev server configured to send `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`, so later iterations develop
  under the same isolation the deployment requires (BR-002, *Deployment*).
- Page layout skeleton per FR-065: toolbar (Run, Stop, Clear console, Copy
  code, Format — controls present, disabled/inert this iteration), status bar
  directly below it, console below that, editor, stdin field, diagnostics
  panel. Light/dark palette tokens defined up front.
- CodeMirror 6 editor with `@codemirror/lang-python`, line numbers, syntax
  highlighting (FR-001).
- Autosave to `localStorage` key `pyplay.program.v1`, 500 ms debounce (FR-002),
  plus synchronous flush on `pagehide` / `visibilitychange → hidden` (FR-050).
- Restore on load byte-for-byte (FR-003); fall back to the starter program from
  *Data & Interfaces* when absent or unreadable (FR-004, BR-010).
- Storage-failure path: one-shot `Autosave unavailable — your code will not
  survive a reload` notice, editing unaffected (FR-005, BR-009).
- Copy code with `Copied` state for 2 s (FR-006) and the rejection path with
  `Couldn't copy — select the code and press Ctrl/Cmd+C` plus selected contents
  (FR-007).
- Reset with `Discard your code?` confirmation (FR-010).
- Test harness wired up: Vitest for units, Playwright for browser VCs.

**Success criteria**:
- VC-001 (FR-001): typing `def f():\n    return 1` shows two lines, keyword
  highlighting on `def`/`return`, gutter line numbers 1 and 2.
- VC-002 (FR-002, FR-003): type `x = 42`, wait 1 s, reload → editor contains
  exactly `x = 42`.
- VC-003 (FR-050): type `x = 42`, fire `pagehide` 100 ms later, reload → editor
  contains exactly `x = 42`, never a truncated prefix.
- VC-004 (FR-004, BR-010): with `localStorage` cleared, the editor loads the
  starter program, which contains ≥ 1 `input(` and ≥ 1 `print(`.
- VC-005 (FR-005, BR-009): with `localStorage` filled to quota, typing still
  works and the `Autosave unavailable` notice appears exactly once per load.
- VC-006 (FR-006): copy `print("hi")` → clipboard holds exactly `print("hi")`,
  control reads `Copied` for ~2 s.
- VC-007 (FR-007): clipboard permission denied → `Couldn't copy` notice,
  contents selected, no uncaught exception.
- VC-010 (FR-010): Reset + confirm → starter program; Reset + cancel → buffer
  unchanged.
- `npm run build` emits a `dist/` of static files only; `npx playwright test`
  and `npx vitest run` both pass.

**Commit message**: `feat: static shell with CodeMirror editor, autosave and copy`

---

## Iteration 2: Pyodide worker, Run, and streaming output

**Goal**: The visitor can Run a program and watch its stdout/stderr stream into
the console, with the status bar reporting runtime state.

**Scope**:
- Web Worker hosting Pyodide 0.28.x, self-hosted from the site's own origin
  (BR-001, BR-003).
- Main↔worker protocol from *Data & Interfaces*: `init`/`run` outbound;
  `ready`/`initError`/`stdout`/`stderr`/`done`/`error` inbound. `runId`
  allocated by the main thread from 1, monotonically increasing; messages with
  a stale `runId` are discarded. (The `stdinBuffer` field of `init` is created
  now and consumed in Iteration 4.)
- Progressive enablement: editor/Copy/Format interactive before the runtime
  finishes downloading (FR-011); Run disabled with a determinate percentage
  during init (FR-012); enabled on ready with one `Python 3.x.y ready` console
  line (FR-013).
- Status bar (FR-065) rendering `Loading Python… N%`, `Python unavailable`, and
  the placeholder states later filled in by Iterations 3 and 7.
- Failure paths: `initError` → Run stays disabled, status `Python unavailable`,
  console shows `Python runtime failed to load. Check your connection and
  reload the page.` plus the underlying message (FR-014). Non-isolated page
  (`self.crossOriginIsolated === false`) → persistent non-modal banner, Run
  disabled, editing/format/copy still usable (FR-015).
- Run mechanics: execute editor contents as `__main__` in a fresh namespace
  (FR-016, BR-004); Run disabled for the whole run (FR-017); Stop enabled only
  during a run (FR-054, stop behaviour itself lands in Iteration 3); run
  separator `─── Run at HH:MM:SS ───` in 24-hour local time appended without
  clearing the console (FR-018).
- Output: stdout chunks painted within 100 ms preserving exact bytes (FR-019);
  stderr chunks prefixed with the literal `[stderr] ` **and** coloured
  distinctly (FR-020).
- Termination: full CPython traceback + `Program exited with an error.`
  (FR-021); `Program finished in N.NN s` (FR-022); empty/comment-only programs
  finish normally (FR-055).
- `Ctrl/Cmd+Enter` triggers Run from the editor (FR-008).
- Snapshot semantics: the executed bytes are those captured at Run activation
  (BR-006), which is what makes FR-067 possible later.

**Success criteria**:
- VC-011 (FR-011): during a cold load, a character typed at 2.0 s appears in
  the editor while the runtime is still loading.
- VC-012 (FR-012): Run is disabled during init and its progress value increases
  at least once.
- VC-013 (FR-013): after init, Run is enabled and the console holds exactly one
  `Python 3.<minor>.<patch> ready` line.
- VC-014 (FR-014, BR-009): with Pyodide assets 404ing, Run stays disabled, the
  failure message plus underlying error appear, and typing still works.
- VC-015 (FR-015, FR-065, BR-002, BR-009): served without COOP/COEP, the
  banner appears and references *Deployment*, status reads `Python
  unavailable`, Run is disabled, editing/Format/Copy still work, and nothing
  overlays the editor.
- VC-016 (FR-016, FR-019): `print("hello")` → `hello` on its own line.
- VC-017 (FR-019): the `time.sleep(1)` loop paints `0` at least 1.5 s before
  the program ends; lines appear one second apart.
- VC-018 (FR-019): `print("a\tb")` and `print("  indented")` preserve tab and
  leading spaces exactly.
- VC-019 (FR-017): during `time.sleep(3)`, Run is disabled and no second run
  starts.
- VC-020 (FR-018): consecutive runs show previous output, then a 24-hour
  separator, then new output.
- VC-021 (FR-020): `sys.stderr.write("boom\n")` renders `[stderr] boom` in a
  distinct colour, prefix still visible in greyscale.
- VC-022 (FR-021): a 3-line program with `1/0` on line 3 shows a traceback
  containing `ZeroDivisionError`, `division by zero` and `line 3`, then
  `Program exited with an error.`
- VC-023 (FR-022): `pass` → `Program finished in 0.NN s`.
- VC-065 (FR-055): empty editor, and an editor holding only `# nada` plus blank
  lines, both finish normally with no output and no traceback.
- VC-008 (FR-008): `Ctrl/Cmd+Enter` in the editor runs the program.
- VC-064 partial (FR-054): Stop is disabled with no run, enabled during a run,
  disabled again on completion.

**Commit message**: `feat: run Python in a Pyodide worker with streaming console output`

---

## Iteration 3: Stop, worker recovery, and run isolation

**Goal**: Any run — including a non-terminating one — can be killed instantly
and the runtime comes back ready without a page reload.

**Scope**:
- Stop implemented as `worker.terminate()` (never a message), followed by
  spawning a replacement worker, sending a fresh `init` with a **new**
  `SharedArrayBuffer`, and awaiting `ready` (FR-023, FR-024, BR-003,
  *Data & Interfaces*).
- Console shows `Program stopped.`; recovery is silent — no second
  `Python … ready` line is appended (FR-064).
- Status bar reads `Restarting Python…` while recovery runs; Run is disabled
  throughout and re-enabled on completion (FR-065, FR-064).
- Full Stop control state machine per FR-054, including non-activatability by
  pointer, `Enter` and `Space` when disabled.
- Fresh-namespace guarantee across stop, crash and normal completion (FR-025,
  BR-004).
- No execution timeout anywhere in the code path (BR-008).

**Success criteria**:
- VC-024 (FR-023, FR-024, NFR-006, NFR-014, BR-003): with `while True: pass`
  running, Stop shows `Program stopped.` within 500 ms; Run is enabled again
  within 5.0 s; the status bar no longer reads `Restarting Python…`; the next
  Run of `print("ok")` succeeds; the page accepted clicks throughout.
- VC-079 (FR-064, NFR-014, BR-003): after that stop-then-run cycle, the console
  shows `ok` and `Program finished`, with no page reload and no second
  `Python … ready` line.
- VC-025 (FR-025, BR-004): run `x = 5`, then `print(x)` → `NameError: name 'x'
  is not defined`.
- VC-026 (FR-025): run a raising program, then `print("ok")` → `ok`, no residue.
- VC-064 (FR-054): the complete disabled/enabled/disabled cycle, with click,
  `Enter` and `Space` all inert while disabled.
- VC-060 (BR-003): during `while True: pass`, typing in the editor and opening
  the diagnostics panel both respond normally.
- VC-059 (BR-008): `for i in range(400): time.sleep(1)` left for 6 minutes is
  still running with no timeout message.

**Commit message**: `feat: stop a running program and recover the worker silently`

---

## Iteration 4: Blocking stdin with terminal-equivalent semantics

**Goal**: `input()`, `readline()`, `read()` and `read(n)` suspend the
interpreter at any point in the program and resume with CPython-correct values.

**Scope**:
- `SharedArrayBuffer` stdin channel shared at `init`: worker parks on
  `Atomics.wait` on its control word; main thread writes a submitted line or an
  EOF flag and calls `Atomics.notify`; the cycle repeats until the read
  completes (*stdin channel*, BR-002).
- Worker-side stdin hook implementing the consumption table exactly:
  `input()`/`readline()` block for one line or EOF; `read()` blocks until EOF;
  `read(n)` blocks until `n` characters or EOF (FR-029, FR-031, FR-034,
  FR-060, FR-061).
- Unlimited reads at arbitrary program positions — top level, loop bodies,
  functions, `try` blocks, interleaved with output — with output ordering
  preserved (FR-057).
- `stdinRequest` prompt rendering: the prompt is written to the console exactly
  once, from the message, before the field is enabled; the worker's hook
  consumes the prompt so it never reaches the stdout stream (FR-030).
- stdin field state machine: enabled and focused only while a read is pending
  (FR-029, FR-032); cleared and disabled after each line for line-based reads
  (FR-031); cleared but **kept enabled** across submissions for `read()` /
  partial `read(n)` (FR-062); disabled on Stop (FR-033).
- Submitted text echoed into the console styled as input (FR-031, FR-062).
- `Send EOF` control and `Ctrl+D` in the field, with per-API EOF semantics —
  `EOFError` for `input()`, `''` for `readline()`, buffered content for
  `read()`/`read(n)` (FR-034).
- Line-length cap: > 65 536 code points is rejected with `Input line too long
  (max 65536 characters)`, the read stays blocked, the field stays enabled with
  its contents selected (FR-066).
- Vitest units for the stdin-stream state machine (buffering, EOF, partial
  `read(n)`) independent of the browser.

**Success criteria**:
- VC-030 (FR-029, FR-030, FR-031): `Name: ` appears **exactly once**, field
  enabled and focused, program suspended; submitting `Ana` echoes `Ana` styled
  as input, prints `Hi Ana`, clears and disables the field.
- VC-031 (FR-029): 10 s without submitting → the program has neither printed
  nor raised.
- VC-067 (FR-057): six reads at four depths (top level, 3× loop body, inside a
  function after 200 000 iterations, inside `try`) each suspend in source
  order, each enable the field exactly once, and the final output matches
  `python3` in a terminal fed the same lines.
- VC-068 (FR-057): the `before/after` loop prints in exactly the order
  `before 0, a, after a, before 1, b, after b, before 2, c, after c`.
- VC-032 (FR-032): with no run, the field is disabled and rejects typing.
- VC-033 (FR-032): during `time.sleep(5)`, the field is disabled.
- VC-034 (FR-033, FR-064): Stop while suspended → `Program stopped.`, field
  disabled, Run enabled again within 5.0 s without reload.
- VC-035 (FR-031): `2` then `3` → `5`.
- VC-036 (FR-031): an empty line → `''`.
- VC-037 (FR-034): `input()` + Send EOF → `EOFError` traceback.
- VC-073 (FR-060, FR-062): `read()` with `line1`, `line2`, EOF →
  `'line1\nline2\n'`.
- VC-074 (FR-061): `read(3)` with `abcdef` → `'abc'`.
- VC-075 (FR-061, FR-062): `read(5)` with `hi` then `abc` → `'hi\nab'`.
- VC-076 (FR-034, FR-060): `read()` + immediate EOF → `''`.
- VC-077 (FR-034): `readline()` + immediate EOF → `''`.
- VC-078 (FR-034, FR-061): `read(10)` with `hi` then EOF → `'hi\n'`.
- VC-082 (FR-066): a 65 537-character line is rejected with the notice, the
  read stays pending, and a subsequent `ok` completes the program.

**Commit message**: `feat: blocking stdin over SharedArrayBuffer with CPython semantics`

---

## Iteration 5: Console robustness and main-thread responsiveness

**Goal**: The console survives pathological output volumes without freezing the
page or exhausting memory.

**Scope**:
- Clear console, leaving the editor untouched (FR-026).
- Scroll behaviour: pinned to the bottom when already at the bottom, frozen
  when the visitor has scrolled up, re-pinning when they return (FR-028).
- Retention cap: 5 000 lines per run, older lines dropped, `… earlier output
  truncated …` marker at the top of the retained region (FR-027).
- Per-write cap: 100 000 characters, then `… line truncated (N characters
  dropped) …` (FR-056).
- Batched/`requestAnimationFrame`-scheduled console painting so continuous
  output at ≥ 10 000 lines/s never blocks the main thread for > 100 ms and Stop
  still lands inside NFR-006 (NFR-009).
- Vitest units for the ring-buffer retention and the write-truncation counter.

**Success criteria**:
- VC-027 (FR-026): Clear console empties the console and leaves `y = 1` in the
  editor.
- VC-028 (FR-027): `for i in range(20000): print(i)` → ~5 000 retained lines
  ending at `19999`, with the truncation marker at the top.
- VC-066 (FR-056): `print("x" * 5_000_000)` → 100 000 characters plus
  `… line truncated (4900000 characters dropped) …`, the run completes, and tab
  memory grows by ≤ 50 MB.
- VC-029 (FR-028): scrolling up during a long run freezes the viewport;
  returning to the bottom re-pins and follows.
- VC-054 (NFR-009): `while True: print("x")` profiled for 5 s → no main-thread
  task exceeds 100 ms and Stop completes within 500 ms.

**Commit message**: `feat: bound console output and keep the main thread responsive`

---

## Iteration 6: Lint and format with Ruff-WASM

**Goal**: Inline diagnostics, a diagnostics panel, and one-click PEP 8
formatting — all advisory, never gating execution.

**Scope**:
- `@astral-sh/ruff-wasm-web` 0.14.x, self-hosted, default rule selection and
  default formatter settings.
- Lint on a 400 ms idle debounce, each pass fully replacing the previous
  diagnostics (FR-035).
- `Diagnostic` shape from *Data & Interfaces* mapped to editor markers:
  severity-appropriate underline plus gutter icon over the exact source range
  (FR-036), with hover/focus tooltip `F821 · Undefined name 'foo'` (FR-037).
- Diagnostics panel listing `line:col · code · message` ordered by line then
  column with a live count (FR-038); activating an entry scrolls to and places
  the caret at the diagnostic start (FR-039); empty state `No problems found.`
  (FR-040).
- Syntax errors surface as error-severity diagnostics at the offending position
  with the parser's message (FR-041), and never block Run (FR-042, BR-006).
- Format: replaces the buffer with a PEP 8 reformatting (FR-043) as a single
  undoable edit (FR-044), idempotent (BR-007), preserving caret-to-statement
  mapping (FR-059), refusing on syntax errors with `Can't format — fix the
  syntax error first.` and a byte-identical buffer (FR-045).
- `Shift+Alt+F` shortcut (FR-009).
- Engine-failure degradation: panel reads `Linter unavailable.`, editing and
  Run keep working (FR-046, BR-009), and Format renders visibly disabled and is
  inert to pointer, keyboard and the shortcut (FR-058).
- Format during a run reformats the editor without touching the executing
  snapshot (FR-067, BR-006).

**Success criteria**:
- VC-038 (FR-035, FR-036, FR-037): `print(undefined_name)` produces an
  underline and gutter icon within 400 ms + 300 ms; the tooltip contains `F821`
  and `Undefined name`.
- VC-039 (FR-035): fixing the code removes the stale marker entirely.
- VC-040 (FR-038): two problems on lines 1 and 4 → exactly two entries, line-1
  first, `line:col · code · message`, count 2.
- VC-041 (FR-039): activating the line-40 entry of a 100-line file scrolls it
  into view and puts the caret at its start column.
- VC-042 (FR-040): `print("ok")` → `No problems found.`
- VC-043 (FR-041): `def f(:` → an error-severity diagnostic at the offending
  position with the parser's message.
- VC-044 (FR-042, BR-006): `import os\nprint("still runs")` runs with Run
  enabled throughout and prints `still runs`.
- VC-061 (FR-042, BR-006): with an error-severity `F821` displayed, Run
  executes and the failure is a CPython `NameError` traceback.
- VC-045 (FR-043): `x=1\ny   =    2` → `x = 1\ny = 2`.
- VC-046 (BR-007): two consecutive Formats produce byte-identical buffers.
- VC-047 (FR-044): one `Ctrl/Cmd+Z` after formatting a 50-line file restores
  the exact pre-format contents.
- VC-069 (FR-059): the caret lands on the first character of the same
  statement's reformatted counterpart.
- VC-048 (FR-045): `def f(:` + Format → buffer unchanged, `Can't format` notice.
- VC-049 (FR-046, BR-009): with the lint asset 404ing, the panel reads `Linter
  unavailable.` and typing plus Run still work.
- VC-070 (FR-058): with the engine blocked, Format is visibly disabled and
  inert to click, keyboard activation and `Shift+Alt+F`, raising no error.
- VC-009 (FR-009): `Shift+Alt+F` on `x=1` → `x = 1`.
- VC-083 (FR-067, BR-006): formatting mid-run reformats the buffer while the
  running program keeps printing `tick` and never prints `other`.

**Commit message**: `feat: Ruff-WASM lint diagnostics and PEP 8 formatting`

---

## Iteration 7: Offline precache, COI shim, and deployment shape

**Goal**: One service worker delivers both cross-origin isolation (where
headers are unavailable) and full offline operation after a first load.

**Scope**:
- Build-time precache manifest listing every URL the Run loop needs: page
  shell, application scripts and styles, all self-hosted Pyodide runtime and
  stdlib assets, the Ruff WASM bundle, and the service-worker script itself
  (*Deployment*).
- A **single** same-origin service worker registered at root scope `/`, which
  both injects COOP/COEP on same-origin HTML navigations
  (`coi-serviceworker`-style shim) and populates Cache Storage bucket
  `pyplay-assets-v<build>` with exactly the manifest URLs, deleting older
  `pyplay-assets-*` buckets on activation (BR-002, FR-051).
- Status bar states wired to precache: `Caching for offline…` between ready and
  precache completion, `Offline ready` on success, `Offline unavailable` on
  failure (FR-065, FR-051, FR-052).
- Precache failure degrades that feature only — Run, Format and autosave keep
  working online (FR-052, BR-009).
- Update flow: a waiting worker from a newer deployment surfaces `A new version
  is available — reload to update` while the current session continues
  uninterrupted (FR-053).
- Host configuration artefacts committed alongside the build: COOP/COEP headers
  for every HTML response, `Content-Type: application/wasm` for `.wasm`,
  long-cache for fingerprinted assets, `no-cache` for `index.html` and the
  service-worker script, gzip/Brotli enabled (*Deployment*, A-03).

**Success criteria**:
- VC-072 (FR-051, FR-065): after a cold load reaching ready, the status bar
  reads `Offline ready` and `pyplay-assets-v<build>` contains an entry for
  every manifest URL.
- VC-062 (FR-052, FR-065, BR-009): with one manifest asset returning 500, the
  status bar reads `Offline unavailable` and Run, Format and autosave still
  work online.
- VC-081 (FR-065, FR-052): the same failure is reflected in the status bar
  while online features continue.
- VC-063 (FR-053): after deploying a new build and reloading once, the `A new
  version is available — reload to update` notice appears and the open session
  keeps running programs.
- VC-080 (FR-065): a cold load shows `Loading Python… N%`, then `Caching for
  offline…`, then `Offline ready`, in a non-interactive line between toolbar
  and console.
- VC-056 (NFR-012, FR-051, BR-001): after reaching `Offline ready`, disconnect
  the network and reload → the runtime reaches ready and
  `n = input("? ")\nprint(n)` completes end to end.

**Commit message**: `feat: single service worker for cross-origin isolation and offline precache`

---

## Iteration 8: Presentation, accessibility, performance, privacy, and docs

**Goal**: The page meets its layout, contrast, keyboard, performance, privacy
and browser-matrix requirements, and ships documented.

**Scope**:
- Responsive layout verified at 375 px: every control reachable, nothing
  clipped, no horizontal page scroll; the editor and console scroll within
  their own bounds; the status bar sits between toolbar and console without
  overlapping the editor (FR-047, FR-065).
- Dark palette via `prefers-color-scheme`, with both palettes audited for text
  contrast ≥ 4.5:1 across UI labels, stdout, stderr, echoed input and
  diagnostics entries (FR-048, NFR-010).
- Non-text contrast ≥ 3:1 for diagnostic underlines, gutter icons, focus rings,
  control borders and the disabled states of Stop and Format (NFR-013).
- Complete keyboard reachability with visible focus indicators for Run, Stop,
  Clear console, Copy code, Format, editor, stdin field, Send EOF and
  diagnostics entries (FR-049). Screen-reader optimisation stays out of scope
  per *Scope*.
- Performance pass against NFR-001–NFR-005, NFR-007, NFR-008 on the reference
  profile, including the ≤ 15 MB compressed transfer budget (asset trimming if
  needed).
- Privacy audit: all network activity is same-origin static-asset fetches, no
  request body carries editor contents, and origin storage holds only
  `pyplay.program.v1` plus the current cache bucket (BR-001, BR-005).
- Cross-browser run of the pinned matrix (NFR-011).
- **Documentation deliverables** (all of them, here and nowhere earlier):
  - `README.md` — what the playground is, how to run it locally (including the
    COOP/COEP dev-server requirement), how to build.
  - `docs/deployment.md` — response headers, the COI service-worker fallback,
    WASM MIME type, compression, precache manifest, and the "hosts that cannot
    satisfy BR-002" case, mirroring the spec's *Deployment* section.
  - `docs/architecture.md` — main↔worker message protocol, `runId` discipline,
    the `SharedArrayBuffer` stdin channel and its consumption semantics, and
    the stop-and-replace worker recovery.
  - `CONTRIBUTING.md` or a README section covering how to run the Vitest and
    Playwright suites.

**Success criteria**:
- VC-050 (FR-047, FR-065): at 375 × 667, every control is reachable, the status
  bar sits between toolbar and console without overlapping the editor, and
  `document.documentElement.scrollWidth` ≤ viewport width.
- VC-051 (FR-048, NFR-010): every sampled text/background pair in both palettes
  measures ≥ 4.5:1.
- VC-071 (NFR-013): every sampled non-text component pair in both palettes
  measures ≥ 3:1.
- VC-052 (FR-049): tabbing from load reaches all nine control targets, each
  with a visible focus ring.
- VC-053 (NFR-001–NFR-005, NFR-007, NFR-008): shell interactive ≤ 2.0 s;
  runtime ready ≤ 10.0 s cold and ≤ 2.5 s warm; compressed transfer ≤ 15 MB;
  Run-to-first-output ≤ 250 ms; lint and format of a 500-line file ≤ 300 ms
  each.
- VC-055 (NFR-011): VC-016, VC-022, VC-024, VC-030, VC-067 and VC-045 pass on
  all 8 pinned browser versions.
- VC-057 (BR-001, BR-005): every recorded request is a same-origin static asset
  fetch and no request body contains editor contents.
- VC-058 (BR-005): origin storage holds only `pyplay.program.v1` and the
  current `pyplay-assets-v<build>` bucket — no cookies, IndexedDB or
  sessionStorage.
- All four documentation deliverables exist, and a reader following
  `docs/deployment.md` alone can deploy the build correctly.

**Commit message**: `feat: accessibility, performance and privacy pass with full documentation`

---

## Final Verification

| Requirement | VC(s) | Iteration(s) | Verification |
|---|---|---|---|
| FR-001 | VC-001 | 1 | Type a two-line def; check highlighting and gutter |
| FR-002, FR-003 | VC-002 | 1 | Type, wait 1 s, reload |
| FR-050 | VC-003 | 1 | Fire `pagehide` inside the debounce window, reload |
| FR-004 | VC-004 | 1 | Clear `localStorage`, load |
| FR-005 | VC-005 | 1 | Fill quota, type, count notices |
| FR-006 | VC-006 | 1 | Copy, paste, observe `Copied` |
| FR-007 | VC-007 | 1 | Deny clipboard permission, copy |
| FR-008 | VC-008 | 2 | `Ctrl/Cmd+Enter` in the editor |
| FR-009 | VC-009 | 6 | `Shift+Alt+F` on `x=1` |
| FR-010 | VC-010 | 1 | Reset, confirm and cancel |
| FR-011 | VC-011 | 2 | Type at 2.0 s of a cold load |
| FR-012 | VC-012 | 2 | Observe Run progress during init |
| FR-013 | VC-013 | 2 | Count `Python … ready` lines |
| FR-014 | VC-014 | 2 | 404 the Pyodide assets |
| FR-015 | VC-015 | 2 | Serve without COOP/COEP |
| FR-016, FR-019 | VC-016, VC-017, VC-018 | 2 | Run print/sleep/whitespace programs |
| FR-017 | VC-019 | 2 | Re-activate Run mid-run |
| FR-018 | VC-020 | 2 | Two consecutive runs |
| FR-020 | VC-021 | 2 | `sys.stderr.write`, check prefix in greyscale |
| FR-021 | VC-022 | 2 | `1/0` on line 3 |
| FR-022 | VC-023 | 2 | Run `pass` |
| FR-023, FR-024 | VC-024 | 3 | Stop `while True: pass` |
| FR-025 | VC-025, VC-026 | 3 | Run `x = 5` then `print(x)`; run after a crash |
| FR-026 | VC-027 | 5 | Clear console with editor content present |
| FR-027 | VC-028 | 5 | Print 20 000 lines |
| FR-028 | VC-029 | 5 | Scroll up mid-run, then back down |
| FR-029, FR-030, FR-031 | VC-030, VC-031, VC-035, VC-036 | 4 | Prompted and unprompted `input()` flows |
| FR-032 | VC-032, VC-033 | 4 | Field state with no run and mid-sleep |
| FR-033 | VC-034 | 4 | Stop while suspended on a read |
| FR-034 | VC-037, VC-076, VC-077, VC-078 | 4 | Send EOF against each stdin API |
| FR-035–FR-041 | VC-038–VC-043 | 6 | Lint debounce, markers, panel, syntax error |
| FR-042 | VC-044, VC-061 | 6 | Run with warning and with error diagnostics |
| FR-043, FR-044 | VC-045, VC-047 | 6 | Format, then single undo |
| FR-045 | VC-048 | 6 | Format a syntax error |
| FR-046, FR-058 | VC-049, VC-070 | 6 | 404 the lint engine |
| FR-047 | VC-050 | 8 | Render at 375 × 667 |
| FR-048 | VC-051 | 8 | Dark-mode contrast sampling |
| FR-049 | VC-052 | 8 | Tab traversal |
| FR-051 | VC-072, VC-080 | 7 | Inspect Cache Storage after cold load |
| FR-052 | VC-062, VC-081 | 7 | 500 on one manifest asset |
| FR-053 | VC-063 | 7 | Deploy a new build, reload once |
| FR-054 | VC-064 | 2, 3 | Stop control state cycle |
| FR-055 | VC-065 | 2 | Empty and comment-only programs |
| FR-056 | VC-066 | 5 | `print("x" * 5_000_000)` |
| FR-057 | VC-067, VC-068 | 4 | Multi-depth reads; interleaved output ordering |
| FR-059 | VC-069 | 6 | Caret position after Format |
| FR-060, FR-061, FR-062 | VC-073–VC-078 | 4 | `read()` and `read(n)` matrix |
| FR-064 | VC-024, VC-034, VC-079 | 3 | Post-Stop recovery without reload |
| FR-065 | VC-015, VC-050, VC-072, VC-080, VC-081 | 2, 7, 8 | Status-bar text per state |
| FR-066 | VC-082 | 4 | 65 537-character stdin line |
| FR-067 | VC-083 | 6 | Format during a run |
| BR-001, BR-005 | VC-056, VC-057, VC-058 | 7, 8 | Network recording and storage enumeration |
| BR-002 | VC-015 | 2, 7 | Non-isolated serve; SW shim |
| BR-003 | VC-024, VC-060, VC-079 | 3 | Kill a runaway loop; main thread stays live |
| BR-004 | VC-025 | 3 | Fresh namespace per run |
| BR-006 | VC-044, VC-061, VC-083 | 6 | Diagnostics never gate or alter execution |
| BR-007 | VC-046 | 6 | Format twice |
| BR-008 | VC-059 | 3 | 6-minute run untouched |
| BR-009 | VC-005, VC-014, VC-015, VC-049, VC-062 | 1, 2, 6, 7 | Each optional subsystem failure |
| BR-010 | VC-004 | 1 | Starter program contains `input(` and `print(` |
| NFR-001–NFR-005, NFR-007, NFR-008 | VC-053 | 8 | Reference-profile cold load and scripted session |
| NFR-006, NFR-014 | VC-024, VC-054 | 3, 5 | Stop latency and recovery latency |
| NFR-009 | VC-054 | 5 | 5 s profile under continuous output |
| NFR-010 | VC-051 | 8 | Text contrast sampling |
| NFR-011 | VC-055 | 8 | 8-version browser matrix |
| NFR-012 | VC-056 | 7 | Offline reload |
| NFR-013 | VC-071 | 8 | Non-text contrast sampling |

**Final acceptance test**

```bash
npm ci
npx vitest run                     # stdin stream, console retention, diagnostic mapping units
npm run build                      # static dist/, precache manifest emitted
npx playwright test                # full browser VC suite against the built dist/
npx playwright test --project=chrome-141 --project=chrome-140 \
                    --project=edge-141   --project=edge-140 \
                    --project=firefox-145 --project=firefox-144 \
                    --project=safari-26.1 --project=safari-26.0 \
                    --grep "VC-016|VC-022|VC-024|VC-030|VC-067|VC-045"   # NFR-011
npm run audit:perf                 # VC-053 reference-profile thresholds, NFR-004 budget
npm run audit:contrast             # VC-051, VC-071
```

Manual sign-off items that no script can assert: VC-056 (physically
disconnect the network and reload), VC-059 (6-minute untouched run), VC-063
(deploy a second build and observe the update notice), and VC-021's greyscale
check.
