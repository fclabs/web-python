/// <reference lib="webworker" />
import type { FromWorker, ToWorker } from '../protocol';

/**
 * The Pyodide worker (BR-003: the visitor's program never runs on the main
 * thread). Pyodide is pulled from this origin's own `/pyodide/` directory
 * with `importScripts`, so the page never touches a CDN (BR-001).
 */

declare function importScripts(...urls: string[]): void;

interface PyodideAPI {
  version: string;
  runPython(code: string): unknown;
  setStdout(options: StreamOptions): void;
  setStderr(options: StreamOptions): void;
  globals: { get(name: string): unknown };
}

interface StreamOptions {
  write(buffer: Uint8Array): number;
  isatty?: boolean;
}

declare const loadPyodide: (options: { indexURL: string }) => Promise<PyodideAPI>;

/**
 * Self-hosted runtime directory. The build copies `public/pyodide/` verbatim
 * into `dist/`, so this resolves against the deployed site's own origin.
 */
const PYODIDE_BASE = new URL('/pyodide/', self.location.href).href;

/**
 * Runs the visitor's program as a brand-new `__main__` module (FR-016,
 * BR-004: no state survives between runs) and returns the CPython traceback
 * of an uncaught exception, or the empty string on normal termination.
 * The runner's own frame is stripped so the traceback shows only the
 * visitor's source lines (FR-021).
 */
const RUNNER_SOURCE = `
import builtins as _pyplay_builtins
import sys as _pyplay_sys
import traceback as _pyplay_traceback
import types as _pyplay_types


def _pyplay_run(code):
    module = _pyplay_types.ModuleType("__main__")
    module.__dict__["__builtins__"] = _pyplay_builtins
    module.__dict__["__name__"] = "__main__"
    module.__dict__["__doc__"] = None
    _pyplay_sys.modules["__main__"] = module
    try:
        exec(compile(code, "<program>", "exec"), module.__dict__)
    except SystemExit as exc:
        if exc.code not in (None, 0):
            return "".join(_pyplay_traceback.format_exception_only(type(exc), exc))
    except BaseException as exc:
        tb = exc.__traceback__
        if tb is not None:
            tb = tb.tb_next
        return "".join(_pyplay_traceback.format_exception(type(exc), exc, tb))
    finally:
        for stream in (_pyplay_sys.stdout, _pyplay_sys.stderr):
            try:
                stream.flush()
            except Exception:
                pass
    return ""


_pyplay_python_version = ".".join(str(part) for part in _pyplay_sys.version_info[:3])
`;

let runner: ((code: string) => string) | null = null;
let currentRunId: number | null = null;
let booted = false;

const post = (message: FromWorker): void => {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
};

/**
 * Turns raw stream bytes into `stdout` / `stderr` messages, preserving the
 * program's exact characters across multi-byte boundaries (FR-019, FR-020).
 */
function streamOptions(type: 'stdout' | 'stderr'): StreamOptions {
  const decoder = new TextDecoder('utf-8');
  return {
    isatty: true,
    write(buffer: Uint8Array): number {
      const text = decoder.decode(buffer, { stream: true });
      if (text !== '' && currentRunId !== null) {
        post({ type, runId: currentRunId, text });
      }
      return buffer.length;
    },
  };
}

async function boot(): Promise<void> {
  try {
    importScripts(`${PYODIDE_BASE}pyodide.js`);
    const pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
    pyodide.setStdout(streamOptions('stdout'));
    pyodide.setStderr(streamOptions('stderr'));
    pyodide.runPython(RUNNER_SOURCE);
    runner = pyodide.globals.get('_pyplay_run') as (code: string) => string;
    const pythonVersion = String(pyodide.globals.get('_pyplay_python_version'));
    post({ type: 'ready', pythonVersion });
  } catch (error) {
    post({ type: 'initError', message: describe(error) });
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/** FR-016 / FR-021 / FR-022: one whole-program run, start to finish. */
function run(code: string, runId: number): void {
  if (!runner) {
    post({ type: 'error', runId, traceback: 'The Python runtime is not ready.' });
    return;
  }
  currentRunId = runId;
  const startedAt = performance.now();
  let traceback: string;
  try {
    traceback = runner(code);
  } catch (error) {
    traceback = describe(error);
  }
  const durationMs = performance.now() - startedAt;
  if (traceback === '') {
    post({ type: 'done', runId, durationMs });
  } else {
    post({ type: 'error', runId, traceback });
  }
  currentRunId = null;
}

self.addEventListener('message', (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  if (message.type === 'init') {
    if (booted) return;
    booted = true;
    // `message.stdinBuffer` is adopted as the stdin channel in Iteration 4.
    void boot();
    return;
  }
  if (message.type === 'run') run(message.code, message.runId);
});
