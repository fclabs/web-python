# Frozen: Static Python-in-the-Browser Playground

Source: `specs/01-static-python-web.md`
Status: SHIPPED
Frozen: 2026-09-02
PR / commit: `bb8e687` (branch `main`, 10 commits ahead of `origin/main` at freeze time; no formal `/verify-spec` record on file)

## Purpose

Students learning introductory programming need to write, run and debug Python
without installing anything. This spec defines a **static, JavaScript-only web
site** (no backend, no accounts, no server-side execution) whose single
playground page lets a visitor type a Python program, run it, watch console
output appear, type input into the running program, copy the program to the
clipboard, and get inline lint diagnostics plus one-click PEP 8 formatting.
Everything executes in the visitor's own browser via WebAssembly, so the site
can be hosted on any static file host and costs nothing per user.

## What it does

### Editor
- The playground exposes a multi-line Python editor with line numbers and syntax highlighting.
- The editor autosaves its full contents to `localStorage` key `pyplay.program.v1` after 500 ms of idle typing, flushing synchronously on `pagehide` or `visibilitychange` to `hidden`.
- On load the editor restores from `pyplay.program.v1` byte-for-byte, or from the built-in starter program when the key is absent or unreadable.
- Autosave failure shows a one-per-load notice and does not interrupt editing.
- **Copy code** places the exact editor contents on the clipboard and shows `Copied` for 2 s; clipboard denial shows fallback guidance and selects the editor contents.
- `Ctrl/Cmd+Enter` triggers Run; `Shift+Alt+F` triggers Format.
- **Reset** (with confirmation) replaces the editor with the starter program and autosaves.

### Runtime lifecycle
- The editor, Copy, and Format controls are interactive before the Python runtime finishes downloading.
- While the runtime initialises, Run is disabled with a determinate progress indication mirrored in the status bar.
- When ready, Run enables and the console shows one line naming the Python version (e.g. `Python 3.13.2 ready`).
- Runtime init failure disables Run, sets status to `Python unavailable`, and shows an error in the console while editing continues.
- Without cross-origin isolation, Run stays disabled, status reads `Python unavailable`, and a persistent non-modal banner explains the deployment requirement without blocking editing, formatting, or copying.
- After first successful load, a service worker precaches every asset the Run loop needs; status reads `Offline ready`.
- Precache failure sets status to `Offline unavailable` while all online features continue.
- When a newer deployment waits to activate, a non-modal update notice appears without interrupting the current session.
- After Stop, a replacement worker spawns with a fresh `SharedArrayBuffer`, emits `ready` silently (no second ready line), and re-enables Run within 5.0 s.

### Execution
- Run executes the current editor contents as `__main__` in a Web Worker with a fresh namespace each time.
- At most one program runs at a time; Run is disabled for the duration.
- Stop is always visible, enabled only while a program runs.
- Each run appends a `─── Run at HH:MM:SS ───` separator without clearing prior console output.
- `stdout` streams to the console within 100 ms preserving exact characters; `stderr` is prefixed with `[stderr] ` and uses a distinct colour.
- Uncaught exceptions show the full CPython traceback followed by `Program exited with an error.`; normal exit shows `Program finished in N.NN s`.
- An empty or whitespace/comments-only editor runs successfully with no output.
- Stop terminates immediately (including infinite loops), shows `Program stopped.`, and triggers worker recovery.
- **Clear console** removes console output without touching the editor.
- The console retains the most recent 5 000 lines per run with a truncation marker; single writes cap at 100 000 characters.
- When scrolled to the bottom the console auto-follows new output; when scrolled up it does not.

### Standard input
- Blocking reads (`input()`, `sys.stdin.readline()`, `sys.stdin.read()`, `sys.stdin.read(n)`) suspend the program at any point in the source until a line is submitted, EOF is sent, or Stop is activated.
- `input(prompt)` renders the prompt exactly once via `stdinRequest`, not through stdout.
- Line-based reads echo submitted text, append `\n` to the stdin stream, and disable the field after each submission with CPython-correct return values.
- The stdin field is disabled whenever no read is pending.
- Send EOF (`Ctrl+D` or control) delivers CPython-correct EOF semantics per API.
- `read()` and `read(n)` keep the field enabled across multiple line submissions until the read completes or EOF arrives.
- Lines exceeding 65 536 Unicode code points are rejected with a notice while the read stays blocked.

### Linting and formatting
- Lint runs 400 ms after typing stops and replaces prior diagnostics.
- Diagnostics appear as editor underlines with gutter icons, hover tooltips (`code · message`), and a sorted panel with live count.
- Clicking a panel entry scrolls the editor to that diagnostic.
- An empty diagnostic set shows `No problems found.`; syntax errors produce error-severity entries.
- Diagnostics are advisory and never gate execution.
- Format replaces the buffer with PEP 8-conformant output in a single undo step; syntax errors block format with a notice.
- Format is idempotent; caret returns to the reformatted counterpart of the current statement.
- Linter load failure shows `Linter unavailable.` and disables Format without affecting edit or run.
- Format during a run reformats the editor but the running program continues executing the snapshot captured at Run time.

### Presentation
- At 375 px width all controls are reachable without horizontal page scrolling.
- The page respects the OS dark-mode preference with WCAG AA contrast thresholds.
- Every control is keyboard-reachable with visible focus indicators.
- A non-interactive status bar between toolbar and console shows exactly one of: `Loading Python… N%`, `Caching for offline…`, `Offline ready`, `Offline unavailable`, `Restarting Python…`, or `Python unavailable`.

### Business rules (cross-cutting)
- The deployed site consists solely of static files from its own origin; user code may still use Pyodide JS interop (`import js`).
- Cross-origin isolation (`COOP: same-origin`, `COEP: require-corp`) is required for `SharedArrayBuffer`; a single service worker may inject headers and precache offline assets where the host cannot set headers.
- Programs execute only in a dedicated Web Worker, never on the main thread.
- Every run uses a fresh interpreter namespace; state never leaks between runs.
- Source code is written only to the editor, the worker, and `localStorage` on this origin — never transmitted by the site.
- Lint and format never block, delay, or alter the bytes executed.
- There is no automatic execution timeout; Stop is the escape hatch.

## Public interfaces / data

### Persisted state (this origin only)

| Store | Key | Contents | On read failure |
|---|---|---|---|
| `localStorage` | `pyplay.program.v1` | The exact editor contents, UTF-8, no wrapper or encoding. | Treat as absent → FR-004. |
| Cache Storage | `pyplay-assets-v<build>` | Precached static assets for FR-051. Older caches are deleted on service-worker activation. | Treat as absent → refetch from network; status `Offline unavailable` (FR-052). |

No cookies, no IndexedDB, no session storage.

### Starter program (FR-004, BR-010)

```python
# Bienvenido al playground de Python.
# Escribí tu programa y apretá "Run" (Ctrl/Cmd+Enter).

nombre = input("¿Cómo te llamás? ")
print(f"Hola, {nombre}!")

for i in range(1, 6):
    print(i, "al cuadrado es", i * i)
```

### Main thread ↔ Worker message protocol

Messages are structured-clone-able objects with a `type` discriminator.

**Main → Worker**

| `type` | Payload | Meaning |
|---|---|---|
| `init` | `{ stdinBuffer: SharedArrayBuffer }` | Boot Pyodide; adopt the shared buffer as the stdin channel. |
| `run` | `{ code: string, runId: number }` | Execute `code` as `__main__` in a fresh namespace. |

Stop is **not** a message: it is `worker.terminate()` followed by spawning a
replacement worker (BR-003), sending a fresh `init` message with a new
`SharedArrayBuffer`, and waiting for `ready` (FR-064). Recovery is silent in
the console — no additional `Python … ready` line is appended. While recovery
is in progress the status indicator reads `Restarting Python…` and Run is
disabled (FR-065).

**Worker → Main**

| `type` | Payload | Meaning |
|---|---|---|
| `ready` | `{ pythonVersion: string }` | Runtime initialised → FR-013. |
| `initError` | `{ message: string }` | Runtime failed → FR-014. |
| `stdout` | `{ runId: number, text: string }` | Chunk of stdout → FR-019. |
| `stderr` | `{ runId: number, text: string }` | Chunk of stderr → FR-020. |
| `stdinRequest` | `{ runId: number, prompt: string }` | Program suspended on a read → FR-029/FR-030/FR-057. |
| `done` | `{ runId: number, durationMs: number }` | Normal termination → FR-022. |
| `error` | `{ runId: number, traceback: string }` | Uncaught exception → FR-021. |

`runId` is allocated by the **main thread**, starting at 1 and incrementing on
every Run. It is not reset when a worker is terminated and replaced, so a stale
message from a terminated worker can never be mistaken for output of the
current run; the main thread discards any message whose `runId` is not current.

### stdin channel

A `SharedArrayBuffer` shared at `init`. The worker maintains a per-run **stdin
stream** — a byte sequence built from visitor submissions. Each submitted line
contributes its text plus a trailing `\n` (FR-031, FR-062). A single line's
text is capped at 65 536 Unicode code points before the appended `\n` (FR-066).
Send EOF marks the stream closed for the current read (FR-034).

On each blocking read the worker emits `stdinRequest` and parks on
`Atomics.wait` on its control word; the main thread writes a submitted line or
an EOF flag into the buffer and calls `Atomics.notify`. The cycle repeats until
the read completes. Reads are unlimited in number, which is what makes
FR-057's arbitrarily-placed reads work. This mechanism is the reason BR-002
exists.

Consumption semantics match CPython on an interactive terminal:

| API | Blocks until | Returns |
|---|---|---|
| `input()` / `input(prompt)` | one line submitted or EOF | line text without `\n`; `EOFError` on EOF before a line |
| `sys.stdin.readline()` | one line submitted or EOF | line including `\n`; `''` on EOF before a line |
| `sys.stdin.read()` | EOF sent (after zero or more lines) | all buffered characters; `''` on immediate EOF |
| `sys.stdin.read(n)` | `n` characters buffered or EOF | first `n` characters, or the partial buffer on EOF |

For `read()` and `read(n)`, the stdin field stays enabled across multiple line
submissions until the read completes (FR-062). For line-based reads, the field
is disabled after each submission (FR-031).

The prompt passed to `input(prompt)` is delivered **only** through
`stdinRequest.prompt` and is rendered by the main thread; the worker's stdin
hook must consume it rather than let it reach the `stdout` stream, so that
FR-030's "exactly once" holds.

### Diagnostic

Produced by the lint engine, consumed by the editor markers (FR-036) and the
panel (FR-038).

```
Diagnostic {
  code:     string            // e.g. "F821", "E501"
  message:  string            // human-readable, no trailing period
  severity: "error" | "warning"
  start:    { line: int ≥ 1, column: int ≥ 1 }
  end:      { line: int ≥ 1, column: int ≥ 1 }   // exclusive
}
```

### Reference implementation choices

Normative only where a requirement names a capability; these are the intended
libraries and the deployment shape.

- **Python runtime**: Pyodide 0.28.x (CPython 3.13 compiled to WASM),
  self-hosted from the site's own origin — no CDN, per BR-001.
- **Editor**: CodeMirror 6.x with `@codemirror/lang-python` 6.x.
- **Lint + format**: Ruff compiled to WASM (`@astral-sh/ruff-wasm-web` 0.14.x),
  self-hosted, providing both the diagnostics of FR-035 and the formatter of
  FR-043 with default Ruff rule selection and default formatter settings.
- **Cross-origin isolation and offline precache**: a **single** same-origin
  service worker handles COI header injection where needed (BR-002) **and**
  build-time precache of all static assets (FR-051). Do not register separate
  workers for these two concerns.
- **Build output**: a directory of static files (`index.html`, JS, WASM,
  Pyodide assets) deployable to any static host.

Major-version upgrades of any of the four libraries require re-running the
verification criteria below; patch and minor upgrades do not.

## Key decisions

- **Static files only (BR-001)**: Hostable anywhere at zero marginal cost; the site never sees visitor code. Sandboxing user code away from `import js` is explicitly rejected for this audience.
- **Cross-origin isolation required (BR-002)**: `SharedArrayBuffer` + `Atomics.wait` is the only viable mechanism for blocking stdin in WASM; without it the page enters an explicit disabled state rather than failing silently.
- **Web Worker execution (BR-003)**: Runaway programs are killed via `worker.terminate()` without freezing the UI thread.
- **Fresh namespace per run (BR-004)**: Learners always start from a known-empty interpreter state.
- **Local-only code storage (BR-005)**: Privacy — source never leaves the origin except via explicit Copy or user-initiated JS interop.
- **Diagnostics never gate execution (BR-006)**: Learners must be able to run deliberately imperfect code; executed bytes always match the editor at Run time.
- **Idempotent formatting (BR-007)**: Prevents editor and `localStorage` churn on repeated Format activations.
- **No execution timeout (BR-008)**: Legitimate exercises may run for minutes; Stop is always available.
- **Graceful degradation of optional subsystems (BR-009)**: Autosave, clipboard, linter, and offline precache failures degrade only their own feature with a visible notice.
- **Starter program includes `input()` (BR-010)**: Smoke-tests the two least obvious features — stdin suspension and streaming stdout.
- **Single service worker for COI + precache**: One worker handles header injection and offline caching; separate workers for these concerns are forbidden.
- **Stop via worker termination, not a message**: Guarantees immediate kill of non-yielding loops; recovery respawns silently without a second ready line.

## Known limits (still true at freeze)

- **Performance (reference profile: 2020+ laptop, Chrome, 10 Mbit/s / 40 ms RTT)**: shell interactive ≤ 2.0 s cold; runtime ready ≤ 10.0 s cold / ≤ 2.5 s warm; cold transfer ≤ 15 MB compressed; Run-to-first-output ≤ 250 ms; Stop-to-stopped ≤ 500 ms; Stop-to-Run-enabled ≤ 5.0 s; lint/format of 500 lines ≤ 300 ms each; main-thread tasks ≤ 100 ms during 10 000 lines/s output.
  - **NFR-003 as CI asserts it (amended 2026-09-02)**: ≤ 2.5 s remains the reference-profile expectation, where the audit measures ~930 ms. VC-053 runs on a GitHub-hosted `ubuntu-latest` runner, which measured 1523 – 2433 ms when it passed and 2500 – 3890 ms when it did not — on `main` as often as on a branch, and nothing in the boot path had changed. The gate is asserted at **5.0 s** there, ~28 % above the worst run observed and half of NFR-002's cold budget. A regression in warm boot still has to stay under a number the product has never approached; what stopped being asserted is the runner's spare CPU. Recorded in issue #13.
- **Contrast**: text ≥ 4.5:1; non-text UI components ≥ 3:1 (WCAG 2.1 AA), both palettes.
- **Browsers**: Chrome 141/140, Edge 141/140, Firefox 145/144, Safari 26.1/26.0 — all Must FRs must pass on each.
- **Offline**: after first load reaching `Offline ready`, the full Run/output/input loop works with network disconnected.
- **Single-file programs only** — no multi-file workspace, no `micropip`, no PyPI installs.
- **User code can reach browser APIs via Pyodide JS interop** — accepted, not sandboxed.
- **No debugger, REPL, rich output (matplotlib/HTML), test runner, or accounts/cloud sync.**
- **Screen-reader optimisation deferred** — keyboard reachability and contrast are in scope; ARIA live regions and AT audit are not.
- **Hosts without COI headers or root-scoped service worker registration cannot run Python** — FR-015 degradation is expected.
- **WASM must be served as `application/wasm`** — `application/octet-stream` breaks Safari compilation.

## Deliberately excluded

- Any backend, API, database, telemetry, or server-side execution; user accounts or URL-based sharing.
- Multi-file projects, third-party package installation, and sandboxing user code away from Pyodide JS interop.
- Debugger, REPL/notebook interface, test framework UI, and rich output (figures, HTML, canvas).
- Internet Explorer and browsers lacking `WebAssembly` + `SharedArrayBuffer`; full screen-reader optimisation beyond keyboard/contrast baselines.
