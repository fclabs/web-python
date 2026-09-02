import './styles.css';
import { Autosaver } from './autosave';
import { writeClipboard } from './clipboard';
import { ConsoleView } from './console';
import { isInert, setInert } from './controls';
import { createEditor, revealPosition, selectAll, setDoc } from './editor';
import {
  NOT_ISOLATED_BANNER,
  PROGRAM_ERRORED,
  PROGRAM_STOPPED,
  RUNTIME_FAILED,
  STATUS_RESTARTING,
  STATUS_OFFLINE_UNAVAILABLE,
  STATUS_CACHING,
  STATUS_OFFLINE_READY,
  STATUS_PYTHON_UNAVAILABLE,
  UPDATE_AVAILABLE,
  COPIED_MS,
  formatFinished,
  formatLoading,
  formatReady,
  formatRunSeparator,
  LAYOUT_NARROW_HINT,
  LAYOUT_SAVE_FAILED,
} from './format';
import { CANNOT_FORMAT, formatDocument } from './lint/format-command';
import { Linter } from './lint/linter';
import { applyDiagnostics } from './lint/markers';
import { DiagnosticsPanel } from './lint/panel';
import { loadRuff, type RuffEngine } from './lint/ruff';
import { Notices } from './notices';
import { setupOffline } from './offline';
import { STDIN_MAX_LINE } from './protocol';
import { PyodideRuntime } from './runtime';
import type { StdinMode } from './stdin-stream';
import { STARTER_PROGRAM } from './starter';
import {
  LAYOUT_MIN_WIDTH,
  type Layout,
  loadLayoutPreference,
  resolveLayout,
  saveLayoutPreference,
} from './layout';
import { SymbolPane } from './symbol-pane';
import { getLocalStorage, loadProgram, saveProgram } from './storage';

const AUTOSAVE_UNAVAILABLE = 'Autosave unavailable — your code will not survive a reload';
const COPY_FAILED = "Couldn't copy — select the code and press Ctrl/Cmd+C";
const RESET_CONFIRM = 'Discard your code?';
/** FR-066 */
const STDIN_TOO_LONG = `Input line too long (max ${STDIN_MAX_LINE} characters)`;

function need<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

/** FR-411 / FR-412: the query that mirrors `LAYOUT_MIN_WIDTH` in the CSS. */
const LAYOUT_QUERY = `(min-width: ${LAYOUT_MIN_WIDTH}px)`;

function boot(): void {
  const notices = new Notices(need('notices'));
  const storage = getLocalStorage();

  // --- Layout (FR-411, FR-412, FR-416, FR-417) ---------------------------
  //
  // FR-416: this runs before the editor is created and before anything else
  // in `boot()` touches the DOM. The entry script is `type="module"`, so it is
  // deferred to after parse but still before the first paint — `#app` already
  // carries the resolved `data-layout` in the frame the browser paints, and no
  // frame ever shows the other layout. No inline script is needed for that.
  const app = need('app');
  const layoutGroup = need('layout-group');
  const layoutHint = need('layout-narrow-hint');
  // FR-401's two radios, in the order `ArrowRight` walks them and `Home` /
  // `End` address them. Both names describe the orientation of the divider
  // between the panels — see the contract in `src/layout.ts`.
  const layoutRadios: { layout: Layout; radio: HTMLButtonElement }[] = [
    { layout: 'horizontal', radio: need<HTMLButtonElement>('layout-horizontal') },
    { layout: 'vertical', radio: need<HTMLButtonElement>('layout-vertical') },
  ];

  const wide = window.matchMedia(LAYOUT_QUERY);
  // FR-411's `P`. Held in a variable rather than re-read, because a resize
  // must re-resolve without re-reading — and must never write (BR-405).
  let layoutPref = loadLayoutPreference(storage);
  // FR-418: at most one notice per page load.
  let layoutSaveWarned = false;

  /**
   * Render the effective layout: the `data-layout` attribute, the control's
   * checked state and roving tabindex, its inertness and FR-406's hint.
   *
   * BR-401 / FR-424: this is the whole switch. It schedules no autosave,
   * sends the worker no message and issues no network request.
   */
  const renderLayout = (): void => {
    const effective = resolveLayout(layoutPref, wide.matches ? LAYOUT_MIN_WIDTH : 0);
    if (app.dataset.layout !== effective) app.dataset.layout = effective;

    // FR-415: below 900 px the group is inert but focusable — `aria-disabled`
    // via `setInert()`, never the `disabled` attribute, which would drop it
    // out of the tab order and break FR-049 from spec-01.
    const narrow = !wide.matches;
    setInert(layoutGroup, narrow);

    for (const { layout, radio } of layoutRadios) {
      // FR-402: the *effective* layout is checked, never a stored preference
      // the narrow override is currently masking.
      const checked = layout === effective;
      radio.setAttribute('aria-checked', checked ? 'true' : 'false');
      // FR-405: exactly one radio is tabbable — the checked one — so the group
      // is a single tab stop (parent VC-052).
      radio.tabIndex = checked ? 0 : -1;
      setInert(radio, narrow);
    }

    // FR-406: the hint is carried by `title` *and* `aria-describedby`, so it
    // is announced rather than only hovered. VC-415 requires the string to be
    // absent from the document at >= 900 px, so it is written and cleared
    // rather than merely hidden.
    if (narrow) {
      layoutHint.textContent = LAYOUT_NARROW_HINT;
      layoutGroup.setAttribute('title', LAYOUT_NARROW_HINT);
      layoutGroup.setAttribute('aria-describedby', layoutHint.id);
    } else {
      layoutHint.textContent = '';
      layoutGroup.removeAttribute('title');
      layoutGroup.removeAttribute('aria-describedby');
    }
  };

  /**
   * FR-403 / FR-404 / FR-405: the visitor chose `layout`. Persist it, apply
   * it, and move focus to the radio that now owns the group's tab stop.
   *
   * FR-415 makes every path here a strict no-op below 900 px: focus,
   * `aria-checked`, `data-layout` and storage all stay as they were.
   */
  const selectLayout = (layout: Layout): void => {
    if (isInert(layoutGroup)) return;
    layoutPref = layout;
    // FR-414 writes the bare string; FR-418 / BR-406 degrade this feature
    // alone when the write is refused — the layout still applies.
    if (!saveLayoutPreference(storage, layout) && !layoutSaveWarned) {
      layoutSaveWarned = true;
      notices.show(LAYOUT_SAVE_FAILED);
    }
    renderLayout();
    layoutRadios.find((entry) => entry.layout === layout)?.radio.focus();
  };

  for (const { layout, radio } of layoutRadios) {
    radio.addEventListener('click', () => selectLayout(layout));
  }

  layoutGroup.addEventListener('keydown', (event) => {
    // FR-415: the whole navigation model of FR-405 applies only at >= 900 px.
    if (isInert(layoutGroup)) return;
    const index = layoutRadios.findIndex((entry) => entry.radio === event.target);
    if (index < 0) return;

    let target: number | null = null;
    switch (event.key) {
      // FR-405: both directions wrap, over a group of exactly two.
      case 'ArrowRight':
      case 'ArrowDown':
        target = (index + 1) % layoutRadios.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        target = (index - 1 + layoutRadios.length) % layoutRadios.length;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = layoutRadios.length - 1;
        break;
      // FR-403 / FR-404: `Enter` and `Space` activate. `Space` on a `<button>`
      // would scroll the page if it reached the document (VC-406), and a
      // `<button>`'s own `Enter`/`Space` click synthesis would double-apply.
      case 'Enter':
      case ' ':
        target = index;
        break;
      default:
        return;
    }

    // Every key handled above is one the browser would otherwise act on —
    // arrows and `Home`/`End` scroll, `Space` scrolls and clicks. VC-406
    // asserts `window.scrollY` is untouched by any activation.
    event.preventDefault();
    selectLayout(layoutRadios[target]!.layout);
  });

  renderLayout();

  // FR-412: the 900 px crossing re-resolves synchronously in the `change`
  // handler — no `resize` listener and no debounce — and writes nothing, so an
  // unset preference tracks the viewport and stays unset (BR-405). FR-413: a
  // stored `vertical` is masked while narrow and restored on widening,
  // because `layoutPref` is re-resolved, never rewritten.
  wide.addEventListener('change', renderLayout);

  // FR-003 / FR-004
  const initialDoc = loadProgram(storage);

  const autosaver = new Autosaver(
    (code) => saveProgram(storage, code),
    () => notices.show(AUTOSAVE_UNAVAILABLE),
  );

  const view = createEditor({
    parent: need('editor'),
    initialDoc,
    onChange: (doc) => {
      autosaver.schedule(doc);
      linter?.schedule(doc); // FR-035
    },
    onRun: () => startRun(), // FR-008
    onFormat: () => runFormat(), // FR-009
  });

  // FR-050: flush any pending write synchronously when the page goes away.
  const flush = () => autosaver.flush();
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  // FR-006 / FR-007: Copy code.
  const copyBtn = need<HTMLButtonElement>('btn-copy');
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  copyBtn.addEventListener('click', () => {
    void (async () => {
      const code = view.state.doc.toString();
      const ok = await writeClipboard(code);
      if (ok) {
        copyBtn.textContent = 'Copied';
        copyBtn.dataset.state = 'copied';
        if (copyTimer !== null) clearTimeout(copyTimer);
        copyTimer = setTimeout(() => {
          copyBtn.textContent = 'Copy code';
          delete copyBtn.dataset.state;
          copyTimer = null;
        }, COPIED_MS);
      } else {
        notices.show(COPY_FAILED);
        selectAll(view);
      }
    })();
  });

  // FR-301 – FR-318: the special-character pane. It is constructed here and
  // never consulted again — nothing else in the playground depends on it, and
  // it depends on nothing but its own three elements (BR-301).
  new SymbolPane({
    toggle: need<HTMLButtonElement>('btn-symbols'),
    pane: need('symbol-pane'),
    status: need('symbol-status'),
    notices,
  });

  // FR-010: Reset.
  need<HTMLButtonElement>('btn-reset').addEventListener('click', () => {
    if (!window.confirm(RESET_CONFIRM)) return;
    setDoc(view, STARTER_PROGRAM);
    autosaver.schedule(STARTER_PROGRAM);
    autosaver.flush();
    view.focus();
  });

  // --- Lint and format (FR-035 – FR-046, FR-058, FR-059, FR-067) ---------
  const formatBtn = need<HTMLButtonElement>('btn-format');
  const panel = new DiagnosticsPanel(
    {
      list: need('diagnostics-list'),
      count: need('diagnostics-count'),
      empty: need('diagnostics-empty'),
    },
    // FR-039: reveal the diagnostic and put the caret at its start.
    (diagnostic) => revealPosition(view, diagnostic.start.line, diagnostic.start.column),
  );

  let engine: RuffEngine | null = null;
  let linter: Linter | null = null;

  /**
   * FR-043 – FR-045, FR-067: reformat the editor. It never consults the
   * runtime, so a program already running is untouched — it executes the
   * snapshot taken when Run was activated (BR-006).
   */
  function runFormat(): void {
    // FR-058: inert by pointer, by keyboard and via the FR-009 shortcut when
    // the engine never loaded.
    if (engine === null || isInert(formatBtn)) return;
    if (formatDocument(view, engine) === 'syntax-error') notices.show(CANNOT_FORMAT);
  }

  formatBtn.addEventListener('click', () => runFormat());

  // FR-011: the engine loads alongside the page; Format stays disabled until
  // it is genuinely usable.
  void loadRuff().then(
    (loaded) => {
      engine = loaded;
      setInert(formatBtn, false);
      linter = new Linter(loaded, (diagnostics) => {
        panel.render(diagnostics); // FR-038 / FR-040
        applyDiagnostics(view, diagnostics); // FR-036 / FR-037
      });
      linter.lintNow(view.state.doc.toString());
    },
    () => {
      // FR-046 / FR-058 / BR-009: the linter alone degrades — editing, Run,
      // autosave and Copy are all untouched.
      panel.markUnavailable();
      setInert(formatBtn, true);
    },
  );

  // --- Python runtime ----------------------------------------------------
  const consoleView = new ConsoleView(need('console'));
  const statusBar = need('status-bar');
  const banner = need('coi-banner');
  const runBtn = need<HTMLButtonElement>('btn-run');
  const stopBtn = need<HTMLButtonElement>('btn-stop');

  // FR-026: Clear console removes every console line and leaves the editor
  // completely untouched.
  need<HTMLButtonElement>('btn-clear').addEventListener('click', () => {
    consoleView.clear();
  });

  let ready = false;
  let running = false;
  let restarting = false;

  /**
   * FR-065: the status the bar returns to once the runtime is idle again —
   * the offline-precache state, which starts as `Caching for offline…` and
   * settles on `Offline ready` (FR-051) or `Offline unavailable` (FR-052).
   */
  let steadyStatus = STATUS_CACHING;

  /**
   * Show a new steady status, but never over `Loading Python… N%`,
   * `Restarting Python…` or `Python unavailable` — those states own the bar
   * while they last, and pick the steady text up when they end.
   */
  function setSteady(next: string): void {
    steadyStatus = next;
    if (ready && !restarting) statusBar.textContent = steadyStatus;
  }

  /**
   * FR-017 / FR-054 / FR-064: Run only when idle, ready and not recovering;
   * Stop enabled if and only if a program is currently running.
   */
  function syncControls(): void {
    setInert(runBtn, !ready || running || restarting);
    setInert(stopBtn, !running);
  }

  // --- stdin field (FR-029 – FR-034, FR-060 – FR-062, FR-066) -------------
  const stdinInput = need<HTMLInputElement>('stdin-input');
  const eofBtn = need<HTMLButtonElement>('btn-eof');

  /** The kind of read the visitor is answering, or null when none is pending. */
  let stdinMode: StdinMode | null = null;

  /** FR-029: enabled and focused only while a read is actually pending. */
  function stdinPending(mode: StdinMode): void {
    stdinMode = mode;
    setInert(stdinInput, false);
    setInert(eofBtn, false);
    stdinInput.focus();
  }

  /** FR-032 / FR-033: no read pending — the field takes no text at all. */
  function stdinIdle(): void {
    stdinMode = null;
    stdinInput.value = '';
    setInert(stdinInput, true);
    setInert(eofBtn, true);
  }

  function submitStdin(): void {
    if (isInert(stdinInput) || stdinMode === null) return;
    const text = stdinInput.value;
    // FR-066: measured in Unicode code points, as the spec states.
    if (Array.from(text).length > STDIN_MAX_LINE) {
      notices.show(STDIN_TOO_LONG);
      // The read stays blocked and the field stays enabled, contents selected.
      stdinInput.select();
      return;
    }
    if (!runtime.submitStdinLine(text)) return;
    consoleView.input(text); // FR-031 / FR-062: echoed, styled as input.
    stdinInput.value = '';
    if (stdinMode === 'line') {
      // FR-031: a line-based read is satisfied by exactly this line.
      stdinIdle();
    } else {
      // FR-062: `read()` / partial `read(n)` keep taking lines until they end.
      stdinInput.focus();
    }
  }

  /** FR-034: end-of-file for the suspended read. */
  function sendStdinEof(): void {
    if (isInert(eofBtn)) return;
    runtime.sendStdinEof();
    stdinIdle();
  }

  stdinInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitStdin();
      return;
    }
    // Ctrl+D in the field is end-of-file, as in a terminal (FR-034).
    if (event.key === 'd' && event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      sendStdinEof();
    }
  });
  eofBtn.addEventListener('click', () => sendStdinEof());

  function startRun(): void {
    if (isInert(runBtn)) return;
    // BR-006: the executed bytes are the buffer as it stands right now.
    const code = view.state.doc.toString();
    stdinIdle();
    if (runtime.run(code) === null) return;
    consoleView.meta(formatRunSeparator(new Date())); // FR-018
    syncControls();
  }

  const runtime = new PyodideRuntime({
    onProgress(percent) {
      if (ready) return;
      const label = formatLoading(percent);
      statusBar.textContent = label; // FR-065
      runBtn.textContent = `Run ${Math.round(percent)}%`; // FR-012
      runBtn.dataset.progress = String(Math.round(percent));
    },
    onReady(pythonVersion) {
      ready = true;
      runBtn.textContent = 'Run';
      delete runBtn.dataset.progress;
      statusBar.textContent = steadyStatus;
      consoleView.meta(formatReady(pythonVersion)); // FR-013
      syncControls();
    },
    onInitError(message) {
      // FR-014: Run stays disabled, status and console explain the failure.
      ready = false;
      runBtn.textContent = 'Run';
      delete runBtn.dataset.progress;
      statusBar.textContent = STATUS_PYTHON_UNAVAILABLE;
      consoleView.errorText(RUNTIME_FAILED);
      consoleView.errorText(message);
      syncControls();
    },
    onStdout(text) {
      // Output can only resume once the read that produced it has completed,
      // so this doubles as the end of any pending read (FR-032).
      stdinIdle();
      consoleView.stdout(text); // FR-019
    },
    onStderr(text) {
      stdinIdle();
      consoleView.stderr(text); // FR-020
    },
    onStdinRequest(prompt, mode) {
      // FR-030: written exactly once, from the message, before the field is
      // enabled — the worker's hook keeps it out of the stdout stream.
      if (prompt !== '') consoleView.prompt(prompt);
      stdinPending(mode); // FR-029
    },
    onDone(durationMs) {
      stdinIdle();
      consoleView.endRun(); // FR-056: settle any half-truncated line first.
      consoleView.meta(formatFinished(durationMs)); // FR-022
    },
    onError(traceback) {
      // FR-021: the complete CPython traceback, then the notice.
      stdinIdle();
      consoleView.endRun(); // FR-056
      consoleView.errorText(traceback.replace(/\n+$/, ''));
      consoleView.errorText(PROGRAM_ERRORED);
    },
    onRunStateChange(next) {
      running = next;
      syncControls();
    },
    onStopped() {
      // FR-023 / FR-033: execution has already ceased — the worker is gone.
      stdinIdle();
      consoleView.endRun(); // FR-056
      restarting = true;
      statusBar.textContent = STATUS_RESTARTING; // FR-065
      consoleView.meta(PROGRAM_STOPPED);
      syncControls();
    },
    onRecovered() {
      // FR-064: silent recovery — no second `Python … ready` line.
      restarting = false;
      statusBar.textContent = steadyStatus;
      syncControls();
    },
  });

  runBtn.addEventListener('click', () => startRun());

  // FR-023 / FR-024 / FR-054: Stop is inert unless a program is running.
  stopBtn.addEventListener('click', () => {
    if (isInert(stopBtn)) return;
    runtime.stop();
  });

  // --- Offline precache and cross-origin isolation (FR-051 – FR-053) -----
  void setupOffline({
    onCaching: () => setSteady(STATUS_CACHING),
    onReady: () => setSteady(STATUS_OFFLINE_READY),
    // BR-009: the offline feature alone degrades — Run, Format and autosave
    // are untouched.
    onUnavailable: () => setSteady(STATUS_OFFLINE_UNAVAILABLE),
    // FR-053: non-modal; the open session keeps running the old version.
    onUpdateAvailable: () => notices.show(UPDATE_AVAILABLE, 'info'),
  });

  if (self.crossOriginIsolated) {
    runtime.start();
  } else {
    // FR-015: persistent, non-modal, in normal flow — it overlays nothing and
    // leaves editing, formatting and copying untouched.
    banner.textContent = NOT_ISOLATED_BANNER;
    banner.hidden = false;
    statusBar.textContent = STATUS_PYTHON_UNAVAILABLE;
  }
  syncControls();

  // FR-011: the editor is usable immediately, while the runtime downloads.
  document.documentElement.dataset.shellReady = 'true';
}

boot();
