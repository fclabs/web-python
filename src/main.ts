import './styles.css';
import { Autosaver } from './autosave';
import { writeClipboard } from './clipboard';
import { ConsoleView } from './console';
import { createEditor, selectAll, setDoc } from './editor';
import {
  NOT_ISOLATED_BANNER,
  PROGRAM_ERRORED,
  PROGRAM_STOPPED,
  RUNTIME_FAILED,
  STATUS_RESTARTING,
  STATUS_OFFLINE_UNAVAILABLE,
  STATUS_PYTHON_UNAVAILABLE,
  formatFinished,
  formatLoading,
  formatReady,
  formatRunSeparator,
} from './format';
import { Notices } from './notices';
import { STDIN_MAX_LINE } from './protocol';
import { PyodideRuntime } from './runtime';
import type { StdinMode } from './stdin-stream';
import { STARTER_PROGRAM } from './starter';
import { getLocalStorage, loadProgram, saveProgram } from './storage';

const AUTOSAVE_UNAVAILABLE = 'Autosave unavailable — your code will not survive a reload';
const COPY_FAILED = "Couldn't copy — select the code and press Ctrl/Cmd+C";
const RESET_CONFIRM = 'Discard your code?';
/** FR-066 */
const STDIN_TOO_LONG = `Input line too long (max ${STDIN_MAX_LINE} characters)`;
const COPIED_MS = 2000;

function need<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function boot(): void {
  const notices = new Notices(need('notices'));
  const storage = getLocalStorage();

  // FR-003 / FR-004
  const initialDoc = loadProgram(storage);

  const autosaver = new Autosaver(
    (code) => saveProgram(storage, code),
    () => notices.show(AUTOSAVE_UNAVAILABLE),
  );

  const view = createEditor({
    parent: need('editor'),
    initialDoc,
    onChange: (doc) => autosaver.schedule(doc),
    onRun: () => startRun(), // FR-008
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

  // FR-010: Reset.
  need<HTMLButtonElement>('btn-reset').addEventListener('click', () => {
    if (!window.confirm(RESET_CONFIRM)) return;
    setDoc(view, STARTER_PROGRAM);
    autosaver.schedule(STARTER_PROGRAM);
    autosaver.flush();
    view.focus();
  });

  // --- Python runtime ----------------------------------------------------
  const consoleView = new ConsoleView(need('console'));
  const statusBar = need('status-bar');
  const banner = need('coi-banner');
  const runBtn = need<HTMLButtonElement>('btn-run');
  const stopBtn = need<HTMLButtonElement>('btn-stop');

  let ready = false;
  let running = false;
  let restarting = false;

  /**
   * The status the bar returns to once the runtime is idle again. Offline
   * precache is Iteration 7, so until then it is genuinely absent (FR-052).
   */
  let steadyStatus = STATUS_OFFLINE_UNAVAILABLE;

  /**
   * FR-017 / FR-054 / FR-064: Run only when idle, ready and not recovering;
   * Stop enabled if and only if a program is currently running.
   */
  function syncControls(): void {
    runBtn.disabled = !ready || running || restarting;
    stopBtn.disabled = !running;
  }

  // --- stdin field (FR-029 – FR-034, FR-060 – FR-062, FR-066) -------------
  const stdinInput = need<HTMLInputElement>('stdin-input');
  const eofBtn = need<HTMLButtonElement>('btn-eof');

  /** The kind of read the visitor is answering, or null when none is pending. */
  let stdinMode: StdinMode | null = null;

  /** FR-029: enabled and focused only while a read is actually pending. */
  function stdinPending(mode: StdinMode): void {
    stdinMode = mode;
    if (stdinInput.disabled) stdinInput.disabled = false;
    if (eofBtn.disabled) eofBtn.disabled = false;
    stdinInput.focus();
  }

  /** FR-032 / FR-033: no read pending — the field takes no text at all. */
  function stdinIdle(): void {
    stdinMode = null;
    stdinInput.value = '';
    if (!stdinInput.disabled) stdinInput.disabled = true;
    if (!eofBtn.disabled) eofBtn.disabled = true;
  }

  function submitStdin(): void {
    if (stdinInput.disabled || stdinMode === null) return;
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
    if (stdinInput.disabled) return;
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
    if (runBtn.disabled) return;
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
      consoleView.meta(formatFinished(durationMs)); // FR-022
    },
    onError(traceback) {
      // FR-021: the complete CPython traceback, then the notice.
      stdinIdle();
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
    if (stopBtn.disabled) return;
    runtime.stop();
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
