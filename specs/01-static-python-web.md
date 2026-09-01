# Spec 01 — Static Python-in-the-Browser Playground

| Field | Value |
|---|---|
| Version | 1.3.0 |
| Last Updated | 2026-09-01 |
| Status | Draft — revised after `/review-spec` |
| Owner | Federico Castañeda |

---

## Purpose

Students learning introductory programming need to write, run and debug Python
without installing anything. This spec defines a **static, JavaScript-only web
site** (no backend, no accounts, no server-side execution) whose single
playground page lets a visitor type a Python program, run it, watch console
output appear, type input into the running program, copy the program to the
clipboard, and get inline lint diagnostics plus one-click PEP 8 formatting.
Everything executes in the visitor's own browser via WebAssembly, so the site
can be hosted on any static file host and costs nothing per user.

---

## Scope

### In scope

- A single-page playground: code editor + console, served as static assets.
- Execution of a **single-file** Python program using a real CPython-on-WASM
  runtime (Pyodide) with the CPython standard library.
- Streaming `stdout` / `stderr` into an on-page console, including real
  Python tracebacks.
- Blocking reads from stdin, at **any number of points anywhere in the
  program**, with terminal-equivalent suspend-and-resume semantics (FR-057).
- Stopping a running program, including a non-terminating one.
- Copy-program-to-clipboard.
- Lint diagnostics (inline in the editor + a list panel) and a Format action,
  both Ruff-equivalent.
- Autosave of the current program to `localStorage`, restored on reload.
- Offline operation after a first successful load, via service-worker
  precaching of every asset the Run loop needs.
- Light and dark presentation, keyboard operation, 375 px-wide viewport support.

### Out of scope

- Any backend, API, database, telemetry, or server-side execution. The site is
  a pile of static files.
- User accounts, login, cloud sync, or sharing a program by URL/link.
- Multiple files, a virtual file system browser, or module imports across
  user-authored files.
- Installing third-party PyPI packages (`micropip`), or any network access
  performed *by the site* on the visitor's behalf.
- **Sandboxing the visitor's own program away from Pyodide's JavaScript
  interop.** A program that does `import js` can reach browser APIs from inside
  the worker. This is accepted, not prevented — see BR-001.
- A test framework: no `unittest`/`pytest` runner, no expected-output test
  cases, no assertion reporting UI. "Testing" here means the user runs the
  program and interacts with it manually.
- A debugger, breakpoints, step execution, or variable inspector.
- Rich output: matplotlib figures, HTML/DOM output, canvas, `display()`.
- A REPL / cell-based notebook interface. Execution is whole-program only.
- Internet Explorer, and any browser without `WebAssembly` + `SharedArrayBuffer`.
- Mobile-optimised on-screen-keyboard ergonomics beyond "the layout is usable
  and nothing is clipped at 375 px".
- Full screen-reader optimisation: ARIA live regions for streaming console
  output, programmatic traversal of lint diagnostics, and a dedicated
  assistive-technology audit. Keyboard reachability (FR-049) and contrast
  thresholds (NFR-010, NFR-013) are in scope; everything else is deferred.

---

## Actors

| Actor | Description | Permissions |
|---|---|---|
| **Visitor** | Anyone who opens the page. No login, no identity, no roles. | Edit the program; Run; Stop; send stdin lines; send EOF; Clear console; Copy program; Format; view diagnostics. Cannot reach any server-side resource — none exists. |
| **Running Program** | The visitor's Python code executing inside the Web Worker. | May read stdin, write stdout/stderr, use the bundled CPython stdlib, and consume CPU/memory until stopped. Has no DOM, no access to the host page's `localStorage`, and no ability to alter the editor or console except through stdout/stderr. Is **not** prevented from using Pyodide's JS interop (BR-001). |
| **Maintainer** | Whoever builds and deploys the static bundle. | Publishes assets; configures the hosting headers / service worker required for cross-origin isolation (BR-002) and offline precaching (FR-051). Not a runtime role — has no in-page UI. |

---

## Functional Requirements

Priorities use MoSCoW: **M** = Must, **S** = Should, **C** = Could, **W** = Won't (this version).

### Editor

| ID | Priority | Requirement |
|---|---|---|
| **FR-001** | M | **Given** the playground page has loaded, **when** the visitor focuses the editor area, **then** a text editor accepts multi-line Python source with visible line numbers and Python syntax highlighting. |
| **FR-002** | M | **Given** the editor contents have changed, **when** the visitor stops typing for 500 ms, **then** the full editor contents are written to `localStorage` under key `pyplay.program.v1`. |
| **FR-050** | M | **Given** the editor contents have changed and the 500 ms debounce of FR-002 has not yet elapsed, **when** the page fires `pagehide` or `visibilitychange` to `hidden`, **then** the pending contents are written to `pyplay.program.v1` synchronously before the handler returns. |
| **FR-003** | M | **Given** `localStorage` key `pyplay.program.v1` holds a string, **when** the page loads, **then** the editor is initialised with exactly that string, byte for byte. |
| **FR-004** | M | **Given** `localStorage` key `pyplay.program.v1` is absent or unreadable, **when** the page loads, **then** the editor is initialised with the built-in starter program defined in *Data & Interfaces*. |
| **FR-005** | M | **Given** a write to `localStorage` throws (quota exceeded, private-browsing restriction, storage disabled), **when** an autosave is attempted, **then** the editor keeps working normally and a non-blocking notice reading `Autosave unavailable — your code will not survive a reload` is shown once per page load. |
| **FR-006** | M | **Given** the editor contains a program, **when** the visitor activates **Copy code**, **then** the exact current editor contents are placed on the system clipboard and the control confirms with a `Copied` state for 2 s. |
| **FR-007** | M | **Given** the clipboard write is rejected (permission denied, insecure context, unsupported API), **when** the visitor activates **Copy code**, **then** a notice reading `Couldn't copy — select the code and press Ctrl/Cmd+C` is shown and the editor contents are left selected. |
| **FR-008** | S | **Given** the editor has focus, **when** the visitor presses `Ctrl+Enter` (Windows/Linux) or `Cmd+Enter` (macOS), **then** the Run action is triggered, identically to activating the Run control. |
| **FR-009** | S | **Given** the editor has focus, **when** the visitor presses `Shift+Alt+F`, **then** the Format action is triggered, identically to activating the Format control. |
| **FR-010** | C | **Given** the visitor activates **Reset**, **when** they confirm the resulting `Discard your code?` dialog, **then** the editor contents are replaced with the built-in starter program and autosaved. |

### Runtime lifecycle

| ID | Priority | Requirement |
|---|---|---|
| **FR-011** | M | **Given** a first-time visit with an empty HTTP cache, **when** the page loads, **then** the editor, Copy and Format controls are interactive before the Python runtime has finished downloading. |
| **FR-012** | M | **Given** the Python runtime is still initialising, **when** the visitor looks at the Run control, **then** Run is disabled and labelled with a determinate progress indication of runtime download/initialisation; the status indicator in the status bar (FR-065) shows the same percentage. |
| **FR-013** | M | **Given** the Python runtime has finished initialising, **when** initialisation completes, **then** Run becomes enabled and the console shows a single ready line naming the Python version, e.g. `Python 3.13.2 ready`. |
| **FR-014** | M | **Given** the Python runtime fails to initialise (asset 404, WASM compile failure, network loss), **when** the failure is detected, **then** Run stays disabled, the status indicator reads `Python unavailable` (FR-065), and the console shows `Python runtime failed to load. Check your connection and reload the page.` plus the underlying error message. |
| **FR-015** | M | **Given** the page is not cross-origin isolated (`self.crossOriginIsolated === false`), **when** the page loads, **then** Run stays disabled, the status indicator reads `Python unavailable` (FR-065), and a **persistent, non-modal** banner reads `This page must be served with cross-origin isolation enabled (see *Deployment*). Python cannot run here.` The banner cannot be dismissed, does not overlay the editor, and does not prevent editing, formatting or copying. |
| **FR-051** | M | **Given** a first successful page load, **when** the runtime reaches the ready state of FR-013, **then** a service worker has stored every asset required by the Run loop — page shell, scripts, styles, all Pyodide runtime and stdlib assets, and the lint/format engine — in the Cache Storage API, and the status indicator reads `Offline ready`. |
| **FR-052** | M | **Given** precaching fails or is unavailable (service workers disabled, storage quota exceeded, an asset returns a non-200 response), **when** the failure is detected, **then** the status indicator reads `Offline unavailable` and every other feature continues to work while online. |
| **FR-053** | S | **Given** a service worker from a previous deployment is controlling the page, **when** a newer deployment's assets have been fetched and are waiting to activate, **then** a non-modal notice reads `A new version is available — reload to update`, and the current session continues uninterrupted on the old version until the visitor reloads. |
| **FR-064** | M | **Given** the visitor activates Stop per FR-023, **when** worker recovery completes, **then** a replacement worker has been spawned, received a fresh `init` message with a new `SharedArrayBuffer`, and emitted `ready`; Run is enabled again without a page reload, within 5.0 s on the reference profile, and no additional `Python … ready` line is appended to the console. |

### Execution

| ID | Priority | Requirement |
|---|---|---|
| **FR-016** | M | **Given** the runtime is ready and no program is running, **when** the visitor activates **Run**, **then** the current editor contents are executed as a Python module named `__main__` inside the Web Worker. |
| **FR-017** | M | **Given** a program is running, **when** the visitor looks at the Run control, **then** Run is disabled for the whole duration of the run, so at most one program is ever in flight. |
| **FR-054** | M | **Given** the page is loaded, **when** the visitor looks at the **Stop** control, **then** it is present at all times, enabled if and only if a program is currently running, and rendered in a visibly disabled state — non-activatable by pointer or keyboard — whenever no program is running. |
| **FR-018** | M | **Given** the visitor activates **Run**, **when** execution begins, **then** the console is *not* cleared; a run-separator line `─── Run at HH:MM:SS ───` is appended before the program's first output, using a 24-hour clock in the visitor's local time zone. |
| **FR-019** | M | **Given** a running program writes to `sys.stdout`, **when** the write occurs, **then** the text appears in the console within 100 ms, preserving the program's exact characters, line breaks and whitespace, and without waiting for the program to finish. |
| **FR-020** | M | **Given** a running program writes to `sys.stderr`, **when** the write occurs, **then** the text appears in the console visually distinguished from stdout: each stderr chunk is rendered with the literal prefix `[stderr] ` immediately before the chunk text, **and** the chunk uses a colour distinct from stdout, so the distinction is not colour-only. |
| **FR-021** | M | **Given** a program raises an uncaught exception, **when** it terminates, **then** the console shows the complete CPython traceback — exception type, message, and the user's source line numbers — followed by `Program exited with an error.` |
| **FR-022** | M | **Given** a program returns normally, **when** it terminates, **then** the console shows `Program finished in N.NN s` where `N.NN` is the wall-clock duration of the run to two decimal places. |
| **FR-055** | M | **Given** the editor is empty or contains only whitespace and comments, **when** the visitor activates **Run**, **then** the run completes normally per FR-022, producing no program output and no error. |
| **FR-023** | M | **Given** a program is running, **when** the visitor activates **Stop**, **then** execution ceases immediately, the console shows `Program stopped.`, worker recovery per FR-064 begins with Run disabled, and Run becomes enabled again when recovery completes. |
| **FR-024** | M | **Given** a program is executing a non-terminating loop with no stdin read pending, **when** the visitor activates **Stop**, **then** FR-023's outcome still holds — the stop must not depend on the program yielding control. |
| **FR-025** | M | **Given** a program has been stopped or has crashed, **when** the visitor activates **Run** again, **then** the new run starts from a clean interpreter state with no variables, imports, or definitions carried over from any previous run. |
| **FR-026** | M | **Given** the console holds output from previous runs, **when** the visitor activates **Clear console**, **then** all console content is removed and the editor contents are left untouched. |
| **FR-027** | S | **Given** a single run has emitted more than 5 000 output lines, **when** further output arrives, **then** the console keeps the most recent 5 000 lines, drops older ones, and shows a `… earlier output truncated …` marker at the top of the retained region. |
| **FR-056** | S | **Given** a single write to stdout or stderr exceeds 100 000 characters, **when** it is rendered, **then** only the first 100 000 characters are retained, followed by the marker `… line truncated (N characters dropped) …`, so that one unbounded write cannot exhaust memory. |
| **FR-028** | M | **Given** the console is scrolled to the bottom, **when** new output arrives, **then** the console stays pinned to the bottom; **given** the visitor has scrolled up, new output does not move the viewport. |

### Standard input

| ID | Priority | Requirement |
|---|---|---|
| **FR-029** | M | **Given** a running program calls `input()`, `sys.stdin.readline()`, or any other blocking read from `sys.stdin`, **when** the read is requested, **then** the console's stdin field becomes enabled and focused, and the program remains suspended at that exact point until the read completes, EOF is sent, or the run is stopped. |
| **FR-057** | M | **Given** a program contains any number of stdin reads at arbitrary positions — at top level, inside loops, inside functions, inside `try` blocks, or interleaved with arbitrary computation and output — **when** each read is reached, **then** it suspends and resumes independently per FR-029, FR-031, FR-060 and FR-061, with the same semantics as a program run in a terminal, regardless of how many reads precede it or how much output was produced in between. |
| **FR-030** | M | **Given** the program called `input(prompt)` with a non-empty prompt, **when** the read is requested, **then** the prompt text is written to the console **exactly once**, before the stdin field is enabled, rendered from the `stdinRequest` message; the runtime must not additionally emit the prompt through the stdout stream of FR-019. |
| **FR-031** | M | **Given** the stdin field is enabled and the suspended read is a line-based read (`input()` or `sys.stdin.readline()`), **when** the visitor submits a line, **then** that line plus a trailing `\n` is appended to the stdin stream, the submitted text is echoed into the console styled as input, the read completes with CPython-correct results (`input()` returns the line without its trailing `\n`; `readline()` returns the line including its trailing `\n`), and the field is cleared and disabled again. |
| **FR-032** | M | **Given** no program is running, or the running program is not suspended on a read, **when** the visitor looks at the stdin field, **then** it is disabled and does not accept text. |
| **FR-033** | M | **Given** a program is suspended on a read, **when** the visitor activates **Stop**, **then** FR-023's outcome holds and the stdin field is disabled. |
| **FR-034** | S | **Given** the stdin field is enabled, **when** the visitor activates **Send EOF** (or presses `Ctrl+D` in the field), **then** end-of-file is delivered to the suspended read with CPython-correct semantics: `input()` raises `EOFError`; `sys.stdin.readline()` returns `''`; `sys.stdin.read()` and `sys.stdin.read(n)` return whatever characters are already buffered (possibly `''`), without raising. |
| **FR-060** | M | **Given** a running program calls `sys.stdin.read()` with no size argument, **when** the read is requested, **then** the stdin field becomes enabled and focused and the program remains suspended until the visitor sends EOF or activates Stop; each line submitted in the meantime is appended to the stdin stream per FR-062, and when EOF arrives the read returns the concatenation of all buffered characters (possibly `''`). |
| **FR-061** | M | **Given** a running program calls `sys.stdin.read(n)` with a positive integer `n`, **when** the read is requested, **then** the program remains suspended until at least `n` characters are available in the stdin stream or EOF is received; if EOF arrives with fewer than `n` characters buffered, the read returns the partial buffer (possibly `''`); otherwise it returns exactly the first `n` characters. While fewer than `n` characters are buffered and EOF has not arrived, the stdin field is enabled per FR-062. |
| **FR-062** | M | **Given** a program is suspended on `sys.stdin.read()` or on `sys.stdin.read(n)` with fewer than `n` characters buffered and EOF not yet received, **when** the visitor submits a line, **then** that line plus a trailing `\n` is appended to the stdin stream, the submitted text is echoed into the console styled as input, the field is cleared, and the field **remains enabled** so the visitor can submit further lines or Send EOF until the read completes. |
| **FR-066** | M | **Given** the visitor submits a stdin line whose text exceeds 65 536 Unicode code points (excluding the appended `\n`), **when** the submission is attempted, **then** the line is rejected, a notice reads `Input line too long (max 65536 characters)`, the suspended read remains blocked, and the stdin field stays enabled with its current contents selected for editing. |

### Linting and formatting

| ID | Priority | Requirement |
|---|---|---|
| **FR-035** | M | **Given** the editor contents have changed, **when** the visitor stops typing for 400 ms, **then** the program is linted and the resulting diagnostics replace any previous diagnostics. |
| **FR-036** | M | **Given** lint produced diagnostics, **when** they are rendered, **then** each diagnostic marks its exact source range in the editor with a severity-appropriate underline and a gutter icon. |
| **FR-037** | M | **Given** a diagnostic marker is present, **when** the visitor hovers or keyboard-focuses it, **then** a tooltip shows the rule code and the human-readable message, e.g. `F821 · Undefined name 'foo'`. |
| **FR-038** | M | **Given** lint produced diagnostics, **when** they are rendered, **then** a diagnostics panel lists every diagnostic as `line:col · code · message`, ordered by line then column, with a live count. |
| **FR-039** | M | **Given** a diagnostic is listed in the panel, **when** the visitor activates that list entry, **then** the editor scrolls to and places the caret at that diagnostic's start position. |
| **FR-040** | M | **Given** lint produced no diagnostics, **when** the panel is rendered, **then** it shows `No problems found.` |
| **FR-041** | M | **Given** the program has a syntax error, **when** lint runs, **then** the diagnostics include an error-severity entry at the offending position with the parser's message. |
| **FR-042** | M | **Given** the diagnostics list contains one or more error-severity entries, **when** the visitor activates **Run**, **then** the program is executed anyway — diagnostics are advisory and never gate execution. |
| **FR-043** | M | **Given** the program parses successfully, **when** the visitor activates **Format**, **then** the editor contents are replaced with a PEP 8-conformant reformatting of the same program. |
| **FR-044** | M | **Given** the visitor activates **Format**, **when** the reformat is applied, **then** the whole reformat is a single undoable edit, reverted in full by one undo. |
| **FR-059** | S | **Given** the caret was inside a statement before Format, **when** the reformat is applied, **then** the caret is placed at the first character of that same statement's reformatted counterpart. |
| **FR-045** | M | **Given** the program has a syntax error, **when** the visitor activates **Format**, **then** the editor contents are left byte-for-byte unchanged and a notice reads `Can't format — fix the syntax error first.` |
| **FR-046** | S | **Given** the linter/formatter engine fails to load, **when** the page is used, **then** editing and execution continue to work and the diagnostics panel reads `Linter unavailable.` |
| **FR-058** | S | **Given** the linter/formatter engine failed to load, **when** the visitor looks at the **Format** control, **then** it is rendered in a visibly disabled state and is non-activatable by pointer, by keyboard, and via the FR-009 shortcut. |
| **FR-067** | S | **Given** a program is running, **when** the visitor activates **Format**, **then** the editor is reformatted per FR-043 and the running program is unaffected — it continues executing the code snapshot captured when Run was activated (BR-006). |

### Presentation

| ID | Priority | Requirement |
|---|---|---|
| **FR-047** | M | **Given** a viewport 375 px wide, **when** the page is rendered, **then** the editor, console, stdin field and every control are reachable and no content is clipped or requires horizontal page scrolling (the editor and console may scroll horizontally *within* their own bounds). |
| **FR-048** | S | **Given** the visitor's OS is set to dark mode, **when** the page loads, **then** the page renders in a dark palette meeting the contrast thresholds in NFR-010 and NFR-013. |
| **FR-049** | S | **Given** the visitor navigates using only the keyboard, **when** they press `Tab` repeatedly from page load, **then** every control (Run, Stop, Clear console, Copy code, Format, editor, stdin field, Send EOF, diagnostics entries) is reachable and shows a visible focus indicator. |
| **FR-065** | M | **Given** the page has loaded, **when** the visitor looks at the layout, **then** a **status indicator** — a single line of text in a dedicated **status bar** positioned directly below the toolbar (Run, Stop, Clear console, Copy code, Format) and directly above the console — is always visible, is not interactive, never overlays the editor, and displays exactly one of the following texts for the matching state: `Loading Python… N%` while FR-012 applies (same integer `N` as Run's progress); `Caching for offline…` after FR-013 completes and precache is still in progress; `Offline ready` per FR-051; `Offline unavailable` per FR-052; `Restarting Python…` while FR-064 recovery is in progress; `Python unavailable` when FR-014 or FR-015 applies. |

---

## Business Rules

| ID | Rule | Rationale | Exceptions |
|---|---|---|---|
| **BR-001** | The deployed site consists solely of static files. **The page itself** issues no request to any origin other than fetches of its own static assets from its own origin. This constrains the site, not the visitor's Python program: Pyodide's JS interop remains reachable from user code, and preventing that is explicitly out of scope. | The site must be hostable on any static file host, work offline after first load, and never see the visitor's code. Sandboxing user code away from `import js` would mean patching the runtime for no benefit to the target audience, who are writing console exercises. | The visitor's own program, per the rule text. |
| **BR-002** | The site must be served cross-origin isolated (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`), so `SharedArrayBuffer` is available. Where the host cannot set headers, a **single** same-origin service worker that injects those headers **and** precaches offline assets (see *Deployment*) must be registered before the runtime loads. **Accepted cost:** this rules out hosts that offer neither header control nor service-worker registration at the site root, and adds one extra load cycle on first visit where the header shim is used. | `SharedArrayBuffer` + `Atomics.wait` is the only way to suspend a WASM interpreter on a value produced later by the main thread, which is what FR-029 and FR-057 require. | None. Without isolation the page enters the disabled state of FR-015 rather than degrading silently. |
| **BR-003** | The visitor's program executes only inside a dedicated Web Worker; it is never evaluated on the main thread. | Guarantees FR-024: a runaway program can be killed with `worker.terminate()` because it never holds the UI thread. | None. |
| **BR-004** | Every run uses a fresh interpreter namespace. State never leaks between runs. | Learners must be able to reason about their program from a known-empty starting point; stale globals produce results that cannot be reproduced. | None. |
| **BR-005** | The visitor's source code is written only to the editor, the Web Worker, and `localStorage` on this origin. The site never transmits it anywhere. | Privacy, and the no-backend constraint (BR-001). | The visitor's own explicit Copy-to-clipboard action (FR-006), and anything the visitor's own program chooses to do (BR-001). |
| **BR-006** | Lint and format diagnostics never block, delay or alter execution; the bytes executed are always exactly the editor's current contents. | A learner must be able to run deliberately imperfect code; a formatter that silently rewrote code before running would make errors point at lines the learner never wrote. | None. |
| **BR-007** | Formatting is idempotent: formatting already-formatted source produces byte-identical output. | Prevents the editor from churning and `localStorage` from thrashing on repeated Format activations. | None. |
| **BR-008** | There is no automatic execution timeout. A run ends only by returning, raising, or being stopped by the visitor. | A legitimate exercise may loop for minutes; an arbitrary kill would look like a bug in the learner's own code. | None — FR-023/FR-024 make Stop always available as the escape hatch. |
| **BR-009** | Failure of an optional subsystem (autosave, clipboard, linter, offline precache) degrades that feature only, with an explicit visible notice; it never prevents editing or running. | The core loop — write, run, read output — must survive a hostile browser configuration. | Failure of the Python runtime itself (FR-014) or of cross-origin isolation (FR-015), which disable Run but still permit editing, formatting and copying. |
| **BR-010** | The starter program (FR-004) must call `input()` at least once and print a result. | It doubles as the smoke test for the two least obvious features — suspending stdin and streaming stdout. | None. |

---

## Non-Functional Requirements

All thresholds are measured on the reference profile: a 2020-or-later laptop
(4 cores, 8 GB RAM), current-stable Chrome, connection throttled to 10 Mbit/s
down / 40 ms RTT, unless a requirement names different conditions.

Scalability, availability and observability are **not applicable**: the site
has no server, no shared state and no operator. Per-visitor cost is fixed and
there is nothing to scale, nothing to keep up, and — by BR-001 and BR-005 —
nothing that may be reported anywhere.

| ID | Requirement | Threshold |
|---|---|---|
| **NFR-001** | Page shell interactive (editor accepts typing, per FR-011) after a cold load. | ≤ 2.0 s from navigation start. |
| **NFR-002** | Python runtime ready (FR-013) after a cold load with an empty HTTP cache. | ≤ 10.0 s from navigation start. |
| **NFR-003** | Python runtime ready on a repeat visit with a warm cache. | ≤ 2.5 s from navigation start. |
| **NFR-004** | Total transferred bytes for a cold load of all static assets, compressed. | ≤ 15 MB. |
| **NFR-005** | Latency from activating Run (runtime already ready) to the first byte of program output being painted, for a program whose first statement is `print("x")`. | ≤ 250 ms. |
| **NFR-006** | Latency from activating Stop to the console showing `Program stopped.`, for a program running `while True: pass`. | ≤ 500 ms. |
| **NFR-014** | Latency from activating Stop to Run becoming enabled again after FR-064 worker recovery, for a program running `while True: pass`. | ≤ 5.0 s on the reference profile. |
| **NFR-007** | Lint round trip — from the 400 ms idle trigger to diagnostics painted — for a 500-line Python file. | ≤ 300 ms. |
| **NFR-008** | Format round trip — from activation to the reformatted buffer painted — for a 500-line Python file. | ≤ 300 ms. |
| **NFR-009** | Main-thread responsiveness while a program is producing continuous output at ≥ 10 000 lines/s. | No main-thread task longer than 100 ms; Stop still meets NFR-006. |
| **NFR-010** | Contrast of all **text**: UI labels, console stdout, console stderr, echoed input, diagnostics panel entries, in both light and dark palettes. | ≥ 4.5:1 against its background (WCAG 2.1 SC 1.4.3, AA). |
| **NFR-013** | Contrast of **non-text UI components**: diagnostic underlines, gutter icons, focus indicators, control borders, disabled-state affordances, in both palettes. | ≥ 3:1 against adjacent colours (WCAG 2.1 SC 1.4.11, AA). |
| **NFR-011** | Supported browsers, pinned baseline as of 2026-09-01: Chrome 141 and 140, Edge 141 and 140, Firefox 145 and 144, Safari 26.1 and 26.0. The baseline is re-pinned whenever this spec is revised. | Every Must-priority FR passes on each of the 8 versions. |
| **NFR-012** | After a first successful load that reached `Offline ready` (FR-051), the page loads and runs Python with the network disconnected. | Full Run / output / input loop works offline. |

---

## Data & Interfaces

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

---

## Deployment

Maintainers publish the build output from *Reference implementation choices* to
any static file host that satisfies **A-04**. The runtime will not start unless
cross-origin isolation is active (FR-015, BR-002).

### Response headers

When the host allows custom response headers, serve **every HTML response** for
the playground (at minimum `index.html`) with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Also configure long-cache headers for fingerprinted assets (JS/WASM bundles with
content hashes in their filenames) and `Cache-Control: no-cache` (or equivalent)
for `index.html` and the service-worker script so updates propagate (FR-053).

### Header injection fallback

When the host **cannot** set the headers above, register the single service
worker described in BR-002 at the **site root scope** (`/`) before the Python
runtime loads. It must inject COOP/COEP on navigations of HTML documents served
from the site's own origin. The intended pattern is a
[`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker)-style shim.
**Accepted cost:** the visitor's first load performs one extra navigation cycle
while the worker installs and takes control.

### WASM MIME type

Serve every `.wasm` file with:

```
Content-Type: application/wasm
```

Serving WASM as `application/octet-stream` causes compilation failures in
Safari and must be treated as a deployment error.

### Compression

Enable gzip **or** Brotli for all text and WASM assets (A-03). NFR-004's
15 MB budget assumes compressed transfer sizes.

### Offline precache manifest

At build time, emit a precache manifest listing every URL the Run loop needs:
page shell, application scripts and styles, all self-hosted Pyodide runtime and
stdlib assets, the Ruff WASM bundle, and the service-worker script itself. The
single service worker must populate Cache Storage bucket
`pyplay-assets-v<build>` with exactly those URLs (FR-051) and delete older
`pyplay-assets-*` buckets on activation.

### Hosts that cannot satisfy BR-002

If a host offers neither custom response headers **nor** service-worker
registration at `/`, the playground cannot run Python there. Deploy elsewhere;
FR-015's banner and `Python unavailable` status are the expected visitor
experience if someone tries anyway.

---

## Verification Criteria

### Editor

- **VC-001** *(FR-001)*: Type `def f():\n    return 1` into the editor → the text appears across two lines, `def` and `return` are highlighted as keywords, and the gutter shows line numbers 1 and 2.
- **VC-002** *(FR-002, FR-003)*: Type `x = 42`, wait 1 s, reload the page → the editor contains exactly `x = 42`.
- **VC-003** *(FR-050)*: Type `x = 42` and, 100 ms later — before the FR-002 debounce elapses — navigate away so `pagehide` fires; reload the page → the editor contains exactly `x = 42`, never a partial value such as `x = 4`.
- **VC-004** *(FR-004, BR-010)*: Clear `localStorage` for the origin, load the page → the editor contains the starter program, which contains at least one `input(` call and at least one `print(` call.
- **VC-005** *(FR-005, BR-009)*: Fill `localStorage` to its quota, then type in the editor → the `Autosave unavailable` notice appears exactly once, the typed characters still appear, and Run still executes the program.
- **VC-006** *(FR-006)*: With `print("hi")` in the editor, activate Copy code, then paste into a text field → the pasted text is exactly `print("hi")`, and the control read `Copied` for ~2 s.
- **VC-007** *(FR-007)*: Deny clipboard permission, activate Copy code → the `Couldn't copy` notice appears, the editor contents are selected, and no exception surfaces to the visitor.
- **VC-008** *(FR-008)*: Focus the editor, press `Ctrl+Enter` (or `Cmd+Enter` on macOS) → the program runs, identically to clicking Run.
- **VC-009** *(FR-009)*: Focus the editor containing `x=1`, press `Shift+Alt+F` → the buffer becomes `x = 1`.
- **VC-010** *(FR-010)*: With custom code in the editor, activate Reset and confirm → the editor contains the starter program; activate Reset and cancel → the custom code is unchanged.

### Runtime lifecycle

- **VC-011** *(FR-011, NFR-001)*: Cold-load with an empty cache; at 2.0 s after navigation start, type a character → the character appears in the editor while the runtime is still loading.
- **VC-012** *(FR-012)*: During runtime initialisation → Run is disabled and shows a progress indication whose value increases at least once before completion.
- **VC-013** *(FR-013)*: Wait for initialisation → Run becomes enabled and the console contains exactly one line matching `Python 3.<minor>.<patch> ready`.
- **VC-014** *(FR-014, BR-009)*: Block the Pyodide asset requests (return 404), load the page → Run stays disabled, the console shows the `Python runtime failed to load` message plus the underlying error text, and the editor still accepts typing.
- **VC-015** *(FR-015, FR-065, BR-002, BR-009)*: Serve the page without COOP/COEP and with the service worker unregistered → the cross-origin-isolation banner references *Deployment*, the status bar reads `Python unavailable`, Run is disabled; typing in the editor, Format and Copy code all still work, and no element overlays the editor.
- **VC-072** *(FR-051, FR-065)*: Cold-load the page and wait for FR-013 ready → the status bar reads `Offline ready`, and the Cache Storage bucket `pyplay-assets-v<build>` contains an entry for every URL in the build's precache manifest.
- **VC-062** *(FR-052, FR-065, BR-009)*: Simulate a precache failure (make one manifest asset return 500) → the status bar reads `Offline unavailable`, and Run, Format and autosave all still work while online.
- **VC-063** *(FR-053)*: Load the page, deploy a new build, reload once so the new service worker installs and waits → the `A new version is available — reload to update` notice appears, and the still-open session continues to run programs without interruption.

### Execution

- **VC-016** *(FR-016, FR-019)*: Run `print("hello")` → the console shows `hello` on its own line.
- **VC-017** *(FR-019)*: Run `import time\nfor i in range(3):\n    print(i)\n    time.sleep(1)` → `0` is visible in the console at least 1.5 s before the program finishes; the three lines appear one second apart, not all at once.
- **VC-018** *(FR-019 whitespace fidelity)*: Run `print("a\tb")` then `print("  indented")` → the console preserves the tab and the two leading spaces exactly.
- **VC-019** *(FR-017)*: Run `import time; time.sleep(3)`; during the run, attempt to activate Run again → Run is disabled and no second run starts.
- **VC-064** *(FR-054)*: With no program running → Stop is visible, visibly disabled, and activating it by click, by `Enter` and by `Space` after tabbing to it produces no effect; start a run → Stop becomes enabled; let the run finish → Stop returns to disabled.
- **VC-020** *(FR-018)*: Run `print(1)`, then run `print(2)` → the console shows the first run's output, a `─── Run at HH:MM:SS ───` separator in 24-hour local time, then `2`; the first output was not erased.
- **VC-021** *(FR-020)*: Run `import sys; sys.stderr.write("boom\n")` → the console shows `[stderr] boom` (literal prefix `[stderr] ` before the text), the line uses a colour distinct from stdout, and the prefix is still visible when the page is rendered in greyscale.
- **VC-022** *(FR-021)*: Run a 3-line program whose line 3 is `1/0` → the console shows a traceback containing `ZeroDivisionError`, `division by zero`, and `line 3`, followed by `Program exited with an error.`
- **VC-023** *(FR-022)*: Run `pass` → the console shows `Program finished in 0.NN s` with a two-decimal duration.
- **VC-065** *(FR-055)*: With a completely empty editor, activate Run → the console shows a run separator and `Program finished in 0.NN s`, with no output and no traceback; repeat with an editor containing only `# nada` and two blank lines → same result.
- **VC-024** *(FR-023, FR-024, NFR-006, NFR-014, BR-003)*: Run `while True: pass`; 2 s later activate Stop → within 500 ms the console shows `Program stopped.`; within 5.0 s Run is enabled again, the status bar no longer reads `Restarting Python…`, and `print("ok")` on the next Run succeeds; the page accepted clicks throughout.
- **VC-025** *(FR-025, BR-004)*: Run `x = 5`; then run `print(x)` → the second run raises `NameError: name 'x' is not defined`.
- **VC-026** *(FR-025 after crash)*: Run a program that raises, then run `print("ok")` → the console shows `ok` and no residue of the previous failure.
- **VC-027** *(FR-026)*: With console output present and `y = 1` in the editor, activate Clear console → the console is empty and the editor still contains `y = 1`.
- **VC-028** *(FR-027)*: Run `for i in range(20000): print(i)` → after completion the console holds ~5 000 lines ending at `19999`, with a `… earlier output truncated …` marker at the top.
- **VC-066** *(FR-056)*: Run `print("x" * 5_000_000)` → the console retains 100 000 characters followed by `… line truncated (4900000 characters dropped) …`, the run completes, and the tab's memory use does not grow by more than 50 MB.
- **VC-029** *(FR-028)*: Run a long-printing program; while it runs, scroll the console up → the viewport stays where it was put; scroll back to the bottom → it re-pins and follows new output.

### Standard input

- **VC-030** *(FR-029, FR-030, FR-031)*: Run `n = input("Name: ")\nprint("Hi", n)` → the console contains the substring `Name: ` **exactly once**, the stdin field is enabled and focused, and the program has not finished; submit `Ana` → the console echoes `Ana` styled as input, then shows `Hi Ana`, and the field is cleared and disabled.
- **VC-031** *(FR-029 suspension)*: Run the VC-030 program and wait 10 s without submitting → the program has still not printed `Hi` and has not raised.
- **VC-067** *(FR-057)*: Run a program with reads at four different depths — one at top level, one inside a `for` loop body executed 3 times, one inside a function called after 200 000 loop iterations of computation, and one inside a `try` block — interleaving `print` calls between them → each of the 6 reads suspends in source order, each enables the stdin field exactly once, each resumes with the submitted value, and the final printed result matches what the same program produces under `python3` in a terminal fed the same lines.
- **VC-068** *(FR-057 output ordering)*: Run `for i in range(3):\n    print("before", i)\n    v = input()\n    print("after", v)` and submit `a`, `b`, `c` → the console shows `before 0`, `a`, `after a`, `before 1`, `b`, `after b`, `before 2`, `c`, `after c`, in that exact order, with no output appearing ahead of the read that should have blocked it.
- **VC-032** *(FR-032)*: With no program running → the stdin field is disabled and typing into it produces nothing.
- **VC-033** *(FR-032 mid-run)*: Run `import time; time.sleep(5)` → during the sleep the stdin field is disabled.
- **VC-034** *(FR-033, FR-064)*: Run the VC-030 program; while it is suspended on input, activate Stop → the console shows `Program stopped.`, the stdin field is disabled, and Run becomes enabled again within 5.0 s without a page reload.
- **VC-035** *(FR-031 multiple reads)*: Run `a = input()\nb = input()\nprint(int(a) + int(b))`; submit `2` then `3` → the console shows `5`.
- **VC-036** *(FR-031 empty line)*: Run `s = input()\nprint(repr(s))`; submit an empty line → the console shows `''`.
- **VC-037** *(FR-034 — `input()`)*: Run `input()` and activate Send EOF → the console shows a traceback containing `EOFError`.
- **VC-073** *(FR-060, FR-062)*: Run `import sys\ndata = sys.stdin.read()\nprint(repr(data))`; submit `line1`, then `line2`, then Send EOF → the console shows `'line1\nline2\n'`.
- **VC-074** *(FR-061)*: Run `import sys\nprint(repr(sys.stdin.read(3)))`; submit one line `abcdef` → the console shows `'abc'`.
- **VC-075** *(FR-061, FR-062)*: Run `import sys\nprint(repr(sys.stdin.read(5)))`; submit `hi`, then `abc` → the console shows `'hi\nab'`.
- **VC-076** *(FR-034, FR-060 — immediate EOF on `read()`)*: Run `import sys\nprint(repr(sys.stdin.read()))`; activate Send EOF without submitting a line → the console shows `''`.
- **VC-077** *(FR-034 — `readline()` on EOF)*: Run `import sys\nprint(repr(sys.stdin.readline()))`; activate Send EOF without submitting a line → the console shows `''`.
- **VC-078** *(FR-034, FR-061 — partial `read(n)` on EOF)*: Run `import sys\nprint(repr(sys.stdin.read(10)))`; submit `hi`, then Send EOF → the console shows `'hi\n'`.
- **VC-082** *(FR-066)*: Run `input()`, submit a line of 65 537 `a` characters → the `Input line too long (max 65536 characters)` notice appears and the read remains pending; clear the field, submit `ok` → the program completes and the console shows `'ok'`.

### Linting and formatting

- **VC-038** *(FR-035, FR-036, FR-037)*: Type `print(undefined_name)` and stop typing → within 400 ms + NFR-007 a diagnostic underline and gutter icon mark `undefined_name`; hovering it shows a tooltip containing `F821` and `Undefined name`.
- **VC-039** *(FR-035 replacement)*: With a diagnostic present, fix the code and stop typing → the stale marker disappears; no diagnostic from the previous lint pass remains.
- **VC-040** *(FR-038)*: With two problems on lines 1 and 4 → the panel lists exactly two entries, the line-1 entry first, each formatted `line:col · code · message`, with a count of 2.
- **VC-041** *(FR-039)*: Activate the panel entry for a diagnostic on line 40 of a 100-line file → the editor scrolls line 40 into view and the caret sits at that diagnostic's start column.
- **VC-042** *(FR-040)*: With `print("ok")` as the whole program → the panel shows `No problems found.`
- **VC-043** *(FR-041)*: Type `def f(:` and stop typing → an error-severity diagnostic appears at the offending position with the parser's message.
- **VC-044** *(FR-042, BR-006 — warning present)*: With `import os\nprint("still runs")` in the editor, producing an unused-import warning, activate Run → Run was enabled throughout and the console shows `still runs`.
- **VC-061** *(FR-042, BR-006 — error severity present)*: With `print(nunca_definido)` in the editor, producing an **error**-severity `F821` diagnostic that is still displayed at the moment Run is activated, activate Run → Run was enabled, the program executed, and the console shows a `NameError` traceback — i.e. the failure came from CPython at run time, not from the page refusing to run.
- **VC-045** *(FR-043)*: With `x=1\ny   =    2` in the editor, activate Format → the editor contains `x = 1\ny = 2`.
- **VC-046** *(BR-007)*: Activate Format twice in a row on the same buffer → the buffer after the second activation is byte-identical to after the first.
- **VC-047** *(FR-044)*: Format a 50-line file, then press `Ctrl/Cmd+Z` once → the buffer returns to its exact pre-format contents in a single undo step.
- **VC-069** *(FR-059)*: In a 50-line file, place the caret in the middle of the statement on line 30, activate Format → the caret sits at the first character of that same statement, wherever the reformat moved it.
- **VC-048** *(FR-045)*: With `def f(:` in the editor, activate Format → the buffer is byte-for-byte unchanged and the `Can't format — fix the syntax error first.` notice appears.
- **VC-049** *(FR-046, BR-009)*: Block the lint engine's asset (return 404), load the page → the panel reads `Linter unavailable.`, and typing plus Run both still work.
- **VC-070** *(FR-058)*: With the lint engine blocked as in VC-049 → the Format control is visibly disabled; clicking it, activating it via keyboard, and pressing `Shift+Alt+F` in the editor all leave the buffer unchanged and raise no error.
- **VC-083** *(FR-067, BR-006)*: Run `import time\nfor _ in range(10):\n    print("tick")\n    time.sleep(1)`; during the run replace the editor contents with poorly formatted `print("other")` and activate Format → the buffer is PEP 8-formatted, the console keeps printing `tick` once per second, and never prints `other`.

### Presentation, performance and privacy

- **VC-050** *(FR-047, FR-065)*: Render the page at a 375 × 667 viewport → every control is visible or reachable by in-component scrolling, the status bar sits between the toolbar and the console without overlapping the editor, and `document.documentElement.scrollWidth` does not exceed the viewport width.
- **VC-051** *(FR-048, NFR-010)*: Render in light mode and in dark mode; sample every text/background pair including console stdout, console stderr, echoed input and diagnostics panel entries → every measured contrast ratio is ≥ 4.5:1.
- **VC-071** *(NFR-013)*: In both palettes, sample diagnostic underlines, gutter icons, focus rings, control borders and the disabled states of Stop and Format against their adjacent colours → every measured ratio is ≥ 3:1.
- **VC-052** *(FR-049)*: From page load, press `Tab` repeatedly → Run, Stop, Clear console, Copy code, Format, the editor, the stdin field, Send EOF and the diagnostics entries are each reached, each showing a visible focus ring.
- **VC-053** *(NFR-001 – NFR-005, NFR-007, NFR-008)*: On the reference profile with an empty cache, record one cold load and one scripted session → shell interactive ≤ 2.0 s; runtime ready ≤ 10.0 s; total compressed transfer ≤ 15 MB; reload with warm cache ready ≤ 2.5 s; Run-to-first-output ≤ 250 ms; lint of a 500-line file ≤ 300 ms; format of the same file ≤ 300 ms.
- **VC-054** *(NFR-009)*: Run `while True: print("x")` for 5 s with a performance profile recording → no main-thread task exceeds 100 ms, and Stop still completes within 500 ms.
- **VC-055** *(NFR-011)*: Execute VC-016, VC-022, VC-024, VC-030, VC-067 and VC-045 on each of the 8 pinned browser versions → all pass on all 8.
- **VC-056** *(NFR-012, FR-051, BR-001)*: Load the page once and wait for `Offline ready`, disconnect the network, reload → the runtime reaches ready and `n = input("? ")\nprint(n)` completes end to end.
- **VC-057** *(BR-001, BR-005)*: Record all network activity from page load through editing, running with input, formatting and copying → every request targets the page's own origin and is a static asset fetch; no request body contains any part of the editor contents.
- **VC-058** *(BR-005 storage surface)*: After a full session, enumerate origin storage → `localStorage` contains only `pyplay.program.v1`, Cache Storage contains only the current `pyplay-assets-v<build>` bucket, and no cookies, IndexedDB or sessionStorage entries exist.
- **VC-059** *(BR-008)*: Run `import time\nfor i in range(400): time.sleep(1)` and leave it for 6 minutes untouched → the program is still running and no timeout message has appeared.
- **VC-060** *(BR-003)*: Run `while True: pass`; during the run, type in the editor and open the diagnostics panel → both respond normally, demonstrating the program does not occupy the main thread.
- **VC-079** *(FR-064, NFR-014, BR-003)*: Run `while True: pass`, activate Stop, wait for Run to become enabled, activate Run with `print("ok")` in the editor → the console shows `ok` and `Program finished`, with no page reload and no second `Python … ready` line appended after the stop.
- **VC-080** *(FR-065)*: On a cold load, observe the status bar: before FR-013 it reads `Loading Python… N%`; after ready and before precache completes it reads `Caching for offline…`; after FR-051 it reads `Offline ready`. The bar is a non-interactive line between the toolbar and the console.
- **VC-081** *(FR-065, FR-052)*: Simulate precache failure → the status bar reads `Offline unavailable` while online features still work.

---

## Open Questions

None. All decisions are folded into the sections above.

---

## Assumptions

1. **A-01** — The audience is introductory-programming students writing short,
   single-file, stdlib-only console programs (tens to a few hundred lines).
   Performance thresholds are sized for that, not for numeric workloads.
2. **A-02** — The visitor's browser supports `WebAssembly`, `SharedArrayBuffer`,
   `Atomics.wait`, Web Workers, service workers and the async Clipboard API.
   Browsers that do not fall outside NFR-011 and are handled by FR-015's
   disabled state or FR-052's degraded state.
3. **A-03** — The static host can serve `.wasm` with `application/wasm` and
   supports gzip or brotli compression; otherwise NFR-004's 15 MB budget and
   NFR-002's 10 s cold-load threshold will not be met.
4. **A-04** — The Maintainer controls either the response headers or the ability
   to register a same-origin service worker at the site root, as described in
   *Deployment*. BR-002 and FR-051 are unsatisfiable otherwise.
5. **A-05** — UI copy is written in Spanish for the starter program and in
   English for system messages as quoted in the FRs; a full i18n layer is not
   required for this version.
6. **A-06** — Ruff's default rule selection is an acceptable diagnostic set for
   this audience; no per-visitor rule configuration UI is required.

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| 1.3.0 | 2026-09-01 | Added *Deployment* section (headers, COI shim, WASM MIME, precache manifest). Added FR-064 (post-Stop worker recovery), FR-065 (status bar / status indicator), FR-066 (stdin line max length), FR-067 (Format during run). Expanded FR-020 (`[stderr] ` prefix), FR-023/FR-012/FR-014/FR-015 for status-bar integration. Clarified single service worker in BR-002. Added NFR-014. Screen-reader scope moved to out-of-scope. Added VC-079–VC-083; updated VC-015, VC-021, VC-024, VC-034, VC-050, VC-062, VC-072. |
| 1.2.0 | 2026-09-01 | Added FR-060–FR-062 (`sys.stdin.read()`, `read(n)`, multi-line field semantics) and expanded FR-034/FR-031/FR-029 for full stdin-stream EOF behaviour. Documented consumption table in *stdin channel*. Added VC-073–VC-078. |
| 1.1.0 | 2026-09-01 | Post-review revision. Added FR-050 (autosave flush on unload), FR-051–FR-053 (offline precache, precache failure, update notice), FR-054 (Stop control states), FR-055 (empty program), FR-056 (output byte cap), FR-057 (arbitrarily-placed stdin reads), FR-058 (Format disabled without lint engine), FR-059 (caret placement after format), NFR-013 (non-text contrast). Rewrote FR-015 (banner is persistent non-modal), FR-030 (prompt rendered exactly once), FR-044 (undo only; caret split out). Promoted FR-028 to Must. Scoped BR-001 to the site and declared user-code JS interop out of scope. Pinned library and browser versions; declared scalability/availability/observability N/A. Fixed VC-003, VC-030, VC-044, VC-047; added VC-061–VC-071 and VC-072. |
| 1.0.0 | 2026-09-01 | Initial draft. |
