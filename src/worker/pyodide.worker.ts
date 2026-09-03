/// <reference lib="webworker" />
import { waitForSubmission } from '../stdin-channel';
import { publishFsMutation, type FsMutation } from '../fs-channel';
import { StdinStream, type StdinMode } from '../stdin-stream';
import type { FromWorker, ToWorker } from '../protocol';
import { WORKSPACE_MAX_BYTES, type WorkspaceFile } from '../workspace';

/**
 * The Pyodide worker (BR-003: the visitor's program never runs on the main
 * thread). Pyodide is pulled from this origin's own `/pyodide/` directory
 * with `importScripts`, so the page never touches a CDN (BR-001).
 */

declare function importScripts(...urls: string[]): void;

/** Load the self-hosted Pyodide bootstrap script in classic or module workers. */
async function loadPyodideLoader(scriptUrl: string): Promise<void> {
  if (typeof importScripts !== 'function') {
    await import(/* @vite-ignore */ scriptUrl);
    return;
  }
  try {
    importScripts(scriptUrl);
  } catch (error) {
    // Vite's dev server serves this worker as a module; importScripts exists but
    // throws there, so fall back to dynamic import.
    if (!(error instanceof TypeError)) throw error;
    await import(/* @vite-ignore */ scriptUrl);
  }
}

interface PyodideAPI {
  version: string;
  runPython(code: string): unknown;
  setStdout(options: StreamOptions): void;
  setStderr(options: StreamOptions): void;
  globals: { get(name: string): unknown; set(name: string, value: unknown): void };
  FS: EmscriptenFS;
}

interface EmscriptenFS {
  cwd(): string;
  chdir(path: string): void;
  mkdir(path: string): void;
  mkdirTree(path: string): void;
  readdir(path: string): string[];
  readFile(path: string, options?: { encoding?: 'utf8' | 'binary' }): string | Uint8Array;
  writeFile(path: string, data: Uint8Array, options?: { encoding?: 'binary' }): void;
  unlink(path: string): void;
  rename(oldPath: string, newPath: string): void;
  rmdir(path: string): void;
  stat(path: string): { size: number; mode: number };
  isFile(mode: number): boolean;
  getPath(node: unknown): string;
  open: (...args: unknown[]) => { node: unknown; position: number };
  write: (...args: unknown[]) => number;
  truncate: (...args: unknown[]) => void;
  ftruncate: (...args: unknown[]) => void;
  ErrnoError: new (errno: number) => Error;
  trackingDelegate: {
    onWriteToFile?(path: string, bytesWritten: number): void;
    onCloseFile?(path: string): void;
    onDeletePath?(path: string): void;
    onMovePath?(oldPath: string, newPath: string): void;
  };
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
 *
 * It also installs the stdin shim: `sys.stdin` and `builtins.input` delegate
 * to the JS stream, whose blocking behaviour and return values match CPython
 * on an interactive terminal (*stdin channel*, FR-029 – FR-034, FR-060 –
 * FR-062). The prompt of `input(prompt)` is handed to the stream — and so to
 * `stdinRequest` — instead of being written to stdout, so the main thread can
 * render it exactly once (FR-030).
 */
const RUNNER_SOURCE = `
import builtins as _pyplay_builtins
import os as _pyplay_os
import sys as _pyplay_sys
import traceback as _pyplay_traceback
import types as _pyplay_types


class _PyplayStdin:
    """sys.stdin backed by the SharedArrayBuffer channel."""

    encoding = "utf-8"
    errors = "strict"
    name = "<stdin>"
    mode = "r"
    newlines = None
    closed = False

    def _flush_output(self):
        # Whatever the program printed must be on screen before it suspends,
        # so the console order matches a terminal's (FR-057).
        for stream in (_pyplay_sys.stdout, _pyplay_sys.stderr):
            try:
                stream.flush()
            except Exception:
                pass

    def _pyplay_input_line(self, prompt):
        self._flush_output()
        return _pyplay_js_readline(prompt, -1)

    def readline(self, size=-1):
        self._flush_output()
        if size is None:
            size = -1
        return _pyplay_js_readline("", size)

    def read(self, size=-1):
        self._flush_output()
        if size is None:
            size = -1
        return _pyplay_js_read(size)

    def readlines(self, hint=-1):
        lines = []
        while True:
            line = self.readline()
            if line == "":
                return lines
            lines.append(line)

    def __iter__(self):
        return self

    def __next__(self):
        line = self.readline()
        if line == "":
            raise StopIteration
        return line

    def isatty(self):
        return True

    def readable(self):
        return True

    def writable(self):
        return False

    def seekable(self):
        return False

    def fileno(self):
        return 0

    def flush(self):
        pass

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _pyplay_input(prompt=""):
    text = "" if prompt is None else str(prompt)
    stream = _pyplay_sys.stdin
    reader = getattr(stream, "_pyplay_input_line", None)
    if reader is None:
        # The program replaced sys.stdin: behave like plain CPython does.
        if text:
            _pyplay_sys.stdout.write(text)
            _pyplay_sys.stdout.flush()
        line = stream.readline()
    else:
        line = reader(text)
    if line == "":
        raise EOFError("EOF when reading a line")
    return line[:-1] if line.endswith("\\n") else line


def _pyplay_run(code, filename):
    workspace = "/workspace"
    _pyplay_sys.dont_write_bytecode = True
    for key, value in list(_pyplay_sys.modules.items()):
        source = getattr(value, "__file__", "")
        if isinstance(source, str) and source.startswith(workspace + "/"):
            del _pyplay_sys.modules[key]
    _pyplay_sys.path[:] = [path for path in _pyplay_sys.path if path != workspace]
    _pyplay_sys.path.insert(0, workspace)
    _pyplay_os.chdir(workspace)
    module = _pyplay_types.ModuleType("__main__")
    module.__dict__["__builtins__"] = _pyplay_builtins
    module.__dict__["__name__"] = "__main__"
    module.__dict__["__doc__"] = None
    module.__dict__["__file__"] = filename
    _pyplay_sys.modules["__main__"] = module
    _pyplay_sys.stdin = _PyplayStdin()
    _pyplay_builtins.input = _pyplay_input
    try:
        exec(compile(code, filename, "exec"), module.__dict__)
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

const WORKSPACE_ROOT = '/workspace';

let runner: ((code: string, filename: string) => string) | null = null;
let currentRunId: number | null = null;
let booted = false;

/** The stdin channel adopted at `init` (*Data & Interfaces*). */
let stdinBuffer: SharedArrayBuffer | null = null;
let fsBuffer: SharedArrayBuffer | null = null;
let filesystem: EmscriptenFS | null = null;
let trackWorkspace = false;
let fsSequence = 0;

const post = (message: FromWorker): void => {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
};

function absolutePath(path: string, fs: EmscriptenFS): string {
  if (path.startsWith('/')) return path;
  return `${fs.cwd().replace(/\/$/, '')}/${path}`;
}

function workspaceName(path: string, fs: EmscriptenFS): string | null {
  const absolute = absolutePath(path, fs);
  if (!absolute.startsWith(`${WORKSPACE_ROOT}/`)) return null;
  const name = absolute.slice(WORKSPACE_ROOT.length + 1);
  return name.includes('/') || name === '' ? null : name;
}

function isInsideWorkspace(path: string, fs: EmscriptenFS): boolean {
  const absolute = absolutePath(path, fs);
  return absolute === WORKSPACE_ROOT || absolute.startsWith(`${WORKSPACE_ROOT}/`);
}

function fsError(fs: EmscriptenFS, code: 'ENOSPC' | 'ENOTSUP'): Error {
  // Emscripten exposes ErrnoError but not its errno map as a public API.
  return new fs.ErrnoError(code === 'ENOSPC' ? 51 : 58);
}

function rootFiles(fs: EmscriptenFS): WorkspaceFile[] {
  return fs.readdir(WORKSPACE_ROOT)
    .filter((name) => name !== '.' && name !== '..')
    .flatMap((name) => {
      const path = `${WORKSPACE_ROOT}/${name}`;
      try {
        if (!fs.isFile(fs.stat(path).mode)) return [];
        const bytes = fs.readFile(path, { encoding: 'binary' }) as Uint8Array;
        return [{ name, bytes: new Uint8Array(bytes) }];
      } catch {
        return [];
      }
    });
}

function workspaceBytes(fs: EmscriptenFS): number {
  return rootFiles(fs).reduce((total, file) => total + file.bytes.length, 0);
}

function publishWorkspaceMutation(mutation: FsMutation): void {
  if (!trackWorkspace || fsBuffer === null || currentRunId === null) return;
  const sequence = ++fsSequence;
  publishFsMutation(fsBuffer, mutation, sequence, () => {
    if (currentRunId !== null) post({ type: 'fsMutationAvailable', runId: currentRunId, sequence });
  });
}

/** Mirror completed Emscripten file operations without changing `open()` itself. */
function installWorkspaceTracking(fs: EmscriptenFS): void {
  let mirroring = false;
  const publishFile = (path: string): void => {
    const name = workspaceName(path, fs);
    if (!trackWorkspace || mirroring || name === null) return;
    mirroring = true;
    try {
      const data = new Uint8Array(fs.readFile(`${WORKSPACE_ROOT}/${name}`, { encoding: 'binary' }) as Uint8Array);
      if (workspaceBytes(fs) > WORKSPACE_MAX_BYTES) throw fsError(fs, 'ENOSPC');
      publishWorkspaceMutation({ kind: 'replace', name, data });
    } catch {
      // A deletion may win a delayed close/write callback; it has its own event.
    } finally {
      mirroring = false;
    }
  };

  fs.trackingDelegate = {
    onWriteToFile: (path) => publishFile(path),
    onCloseFile: (path) => publishFile(path),
    onDeletePath: (path) => {
      const name = workspaceName(path, fs);
      if (trackWorkspace && name !== null) publishWorkspaceMutation({ kind: 'delete', name });
    },
    onMovePath: (from, to) => {
      const oldName = workspaceName(from, fs);
      const newName = workspaceName(to, fs);
      if (trackWorkspace && oldName !== null && newName !== null) {
        publishWorkspaceMutation({ kind: 'rename', name: oldName, to: newName });
      }
    },
  };

  const originalMkdir = fs.mkdir.bind(fs);
  fs.mkdir = (path: string) => {
    if (trackWorkspace && isInsideWorkspace(path, fs)) throw fsError(fs, 'ENOTSUP');
    originalMkdir(path);
  };
}

function hydrateWorkspace(fs: EmscriptenFS, files: WorkspaceFile[]): string | null {
  trackWorkspace = false;
  try {
    try { fs.mkdir(WORKSPACE_ROOT); } catch { /* already mounted */ }
    for (const name of fs.readdir(WORKSPACE_ROOT)) {
      if (name !== '.' && name !== '..') fs.unlink(`${WORKSPACE_ROOT}/${name}`);
    }
    let total = 0;
    for (const file of files) {
      if (file.name.includes('/') || file.name.includes('\\') || file.name.length === 0) return 'Invalid workspace file name.';
      total += file.bytes.length;
      if (total > WORKSPACE_MAX_BYTES) return 'Workspace is too large (max 2 MB).';
      fs.writeFile(`${WORKSPACE_ROOT}/${file.name}`, file.bytes, { encoding: 'binary' });
    }
    return null;
  } finally {
    trackWorkspace = true;
  }
}

/**
 * NFR-009: a program printing flat out writes far more often than any main
 * thread can consume one message per write, so writes are coalesced here into
 * at most one message every few milliseconds. The window is opened by the
 * *previous* post, so a lone write after a quiet stretch still goes out
 * immediately and FR-019's 100 ms budget holds.
 */
const FLUSH_MS = 8;
const FLUSH_CHARS = 8192;

let pendingType: 'stdout' | 'stderr' | null = null;
let pendingText = '';
let lastPostAt = 0;

/** Post whatever output is held, keeping stdout and stderr in program order. */
function flushOutput(): void {
  const type = pendingType;
  const text = pendingText;
  pendingType = null;
  pendingText = '';
  if (type === null || text === '' || currentRunId === null) return;
  post({ type, runId: currentRunId, text });
  lastPostAt = performance.now();
}

/** Hold `text` for the current coalescing window, or send it now. */
function emit(type: 'stdout' | 'stderr', text: string): void {
  if (text === '' || currentRunId === null) return;
  // The two streams never share a message, so their order is never in doubt.
  if (pendingType !== null && pendingType !== type) flushOutput();
  pendingType = type;
  pendingText += text;
  if (pendingText.length >= FLUSH_CHARS || performance.now() - lastPostAt >= FLUSH_MS) {
    flushOutput();
  }
}

/**
 * One blocking read: announce the suspension, then park on the channel until
 * the main thread submits a line or EOF (FR-029, BR-002). The interpreter
 * stops here — it resumes at exactly this point, however deep in the program
 * the read was (FR-057).
 */
const stdin = new StdinStream((mode: StdinMode, prompt: string) => {
  if (stdinBuffer === null || currentRunId === null) return null;
  // Everything the program printed is on screen before it suspends (FR-057).
  flushOutput();
  post({ type: 'stdinRequest', runId: currentRunId, prompt, mode });
  return waitForSubmission(stdinBuffer);
});

/**
 * Turns raw stream bytes into `stdout` / `stderr` messages, preserving the
 * program's exact characters across multi-byte boundaries (FR-019, FR-020).
 */
function streamOptions(type: 'stdout' | 'stderr'): StreamOptions {
  const decoder = new TextDecoder('utf-8');
  return {
    isatty: true,
    write(buffer: Uint8Array): number {
      emit(type, decoder.decode(buffer, { stream: true }));
      return buffer.length;
    },
  };
}

async function boot(): Promise<void> {
  try {
    await loadPyodideLoader(`${PYODIDE_BASE}pyodide.js`);
    const pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
    filesystem = pyodide.FS;
    installWorkspaceTracking(filesystem);
    pyodide.setStdout(streamOptions('stdout'));
    pyodide.setStderr(streamOptions('stderr'));
    // The Python shim reaches the stream through these two entry points.
    pyodide.globals.set('_pyplay_js_readline', (prompt: string, limit: number) =>
      stdin.readline(prompt, limit),
    );
    pyodide.globals.set('_pyplay_js_read', (size: number) => stdin.read(size));
    pyodide.runPython(RUNNER_SOURCE);
    runner = pyodide.globals.get('_pyplay_run') as (code: string, filename: string) => string;
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
function run(files: WorkspaceFile[], entryFile: string, runId: number): void {
  if (!runner || !filesystem) {
    post({ type: 'error', runId, traceback: 'The Python runtime is not ready.' });
    return;
  }
  currentRunId = runId;
  fsSequence = 0;
  const hydrateError = hydrateWorkspace(filesystem, files);
  if (hydrateError !== null) {
    post({ type: 'error', runId, traceback: hydrateError });
    currentRunId = null;
    return;
  }
  if (!entryFile.endsWith('.py') || !files.some((file) => file.name === entryFile)) {
    post({ type: 'error', runId, traceback: 'Select a Python (.py) file before running.' });
    currentRunId = null;
    return;
  }
  let source: string | Uint8Array;
  try {
    source = filesystem.readFile(`${WORKSPACE_ROOT}/${entryFile}`, { encoding: 'binary' });
  } catch {
    post({ type: 'error', runId, traceback: `The selected file no longer exists: ${entryFile}` });
    currentRunId = null;
    return;
  }
  if (!(source instanceof Uint8Array)) {
    post({ type: 'error', runId, traceback: `${entryFile} must be a UTF-8 text file.` });
    currentRunId = null;
    return;
  }
  let code: string;
  try {
    code = new TextDecoder('utf-8', { fatal: true }).decode(source);
  } catch {
    post({ type: 'error', runId, traceback: `${entryFile} must be a UTF-8 text file.` });
    currentRunId = null;
    return;
  }
  // BR-004: neither buffered characters nor a latched EOF survive a run.
  stdin.reset();
  pendingType = null;
  pendingText = '';
  lastPostAt = 0;
  const startedAt = performance.now();
  let traceback: string;
  try {
    traceback = runner(code, `${WORKSPACE_ROOT}/${entryFile}`);
  } catch (error) {
    traceback = describe(error);
  }
  const durationMs = performance.now() - startedAt;
  // The run's last words reach the console before its termination notice.
  flushOutput();
  post({ type: 'workspaceSnapshot', runId, files: rootFiles(filesystem) });
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
    stdinBuffer = message.stdinBuffer;
    fsBuffer = message.fsBuffer;
    void boot();
    return;
  }
  if (message.type === 'run') run(message.files, message.entryFile, message.runId);
});
