// The bundled worker script's URL, as a plain string. Imported this way, and
// not through `new Worker(new URL(…))`, so a replacement worker can be spawned
// from a *distinct* URL — see `spawn()`.
import pyodideWorkerUrl from './worker/pyodide.worker.ts?worker&url';
import { STDIN_BUFFER_BYTES, isCurrentRun, type FromWorker, type ToWorker } from './protocol';
import { writeSubmission } from './stdin-channel';
import type { StdinMode } from './stdin-stream';

/** Callbacks the page installs on the runtime. */
export interface RuntimeHandlers {
  onProgress(percent: number): void;
  onReady(pythonVersion: string): void;
  onInitError(message: string): void;
  onStdout(text: string): void;
  onStderr(text: string): void;
  onDone(durationMs: number): void;
  onError(traceback: string): void;
  /** FR-029: the program is suspended on a read and needs a line or EOF. */
  onStdinRequest(prompt: string, mode: StdinMode): void;
  onRunStateChange(running: boolean): void;
  /** FR-023: the run was killed by the visitor; recovery has begun. */
  onStopped(): void;
  /** FR-064: the replacement worker reported `ready` — silently. */
  onRecovered(): void;
}

export type RuntimeState = 'loading' | 'ready' | 'failed' | 'restarting';

/**
 * Rough wall-clock cost of a cold Pyodide boot on the reference profile. It
 * only shapes the determinate progress curve of FR-012; the indicator is
 * pinned to 100 % by the `ready` message, whenever that actually arrives.
 */
const EXPECTED_BOOT_MS = 8000;
const PROGRESS_TICK_MS = 50;
const PROGRESS_CEILING = 95;

/**
 * Owns the Pyodide Web Worker and the `runId` discipline of
 * *Data & Interfaces*: ids start at 1, increment on every Run, are never
 * reset, and any message whose id is not the current one is discarded.
 *
 * Stop is not a message: it is `worker.terminate()` followed by spawning a
 * replacement worker, sending a fresh `init` with a **new**
 * `SharedArrayBuffer`, and waiting for `ready` (FR-023, FR-024, FR-064,
 * BR-003). Recovery is silent: no second `Python … ready` line.
 *
 * There is no execution timeout anywhere in this class: a run ends only by
 * returning, raising, or being stopped by the visitor (BR-008).
 */
export class PyodideRuntime {
  private worker: Worker | null = null;
  /** The stdin channel of the worker currently in charge (*stdin channel*). */
  private stdinBuffer: SharedArrayBuffer | null = null;
  private nextRunId = 1;
  private currentRunId: number | null = null;
  private state: RuntimeState = 'loading';
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private lastPercent = 0;
  /** How many workers have been spawned, first boot included (FR-064). */
  private spawnCount = 0;

  constructor(private readonly handlers: RuntimeHandlers) {}

  /** Spawn the worker and boot Pyodide (BR-003: never on the main thread). */
  start(): void {
    this.startedAt = performance.now();
    this.tickProgress();
    this.progressTimer = setInterval(() => this.tickProgress(), PROGRESS_TICK_MS);
    this.spawn();
  }

  /**
   * Spawn a worker and hand it a **fresh** `SharedArrayBuffer` stdin channel.
   * Used for the first boot and for every post-Stop recovery.
   */
  private spawn(): void {
    /*
     * A classic worker: it pulls the self-hosted Pyodide loader in with
     * `importScripts`, so no CDN and no bundler indirection (BR-001).
     *
     * Every *replacement* worker (FR-064) is loaded from a distinct URL. In
     * WebKit a worker script replayed from the HTTP cache arrives without the
     * `Cross-Origin-Embedder-Policy` header of its original response, and the
     * COEP-require-corp document then refuses to start it — so the first Stop
     * would be the last, and Safari could never recover the runtime. The query
     * string is inert everywhere else (the response is identical, and the
     * service worker looks entries up with `ignoreSearch`), and costs one
     * refetch of a ~6 KB script per Stop.
     */
    const url =
      this.spawnCount++ === 0 ? pyodideWorkerUrl : `${pyodideWorkerUrl}?respawn=${this.spawnCount}`;
    const worker = new Worker(url);
    this.worker = worker;
    worker.addEventListener('message', (event: MessageEvent<FromWorker>) => {
      // A message from a worker we have already replaced is never acted on.
      if (this.worker !== worker) return;
      this.receive(event.data);
    });
    worker.addEventListener('error', (event) => {
      if (this.worker !== worker) return;
      this.fail(event.message || 'The Python worker could not be started.');
    });

    // A brand-new channel per worker: nothing a killed run left behind can
    // be read by its replacement (FR-064).
    const stdinBuffer = new SharedArrayBuffer(STDIN_BUFFER_BYTES);
    this.stdinBuffer = stdinBuffer;
    const init: ToWorker = { type: 'init', stdinBuffer };
    worker.postMessage(init);
  }

  /**
   * FR-023 / FR-024: kill the run immediately — the worker is terminated, so
   * the stop never depends on the program yielding control — then recover the
   * runtime in the background (FR-064).
   */
  stop(): void {
    if (!this.isRunning || !this.worker) return;
    this.worker.terminate();
    this.worker = null;
    // Nothing the dead worker may still have queued belongs to any run.
    this.currentRunId = null;
    this.state = 'restarting';
    // Order matters: the page learns it is recovering before it learns the
    // run ended, so Run is never briefly re-enabled (FR-064, FR-065).
    this.handlers.onStopped();
    this.handlers.onRunStateChange(false);
    this.spawn();
  }

  get isReady(): boolean {
    return this.state === 'ready';
  }

  get isRunning(): boolean {
    return this.currentRunId !== null;
  }

  /** True while a replacement worker is booting after a Stop (FR-064). */
  get isRestarting(): boolean {
    return this.state === 'restarting';
  }

  /**
   * FR-016 / BR-006: execute exactly the bytes handed in, which the caller
   * snapshots at the moment Run was activated. Returns the allocated `runId`,
   * or null when no run could be started.
   */
  run(code: string): number | null {
    if (this.state !== 'ready' || this.isRunning || !this.worker) return null;
    const runId = this.nextRunId++;
    this.currentRunId = runId;
    const message: ToWorker = { type: 'run', code, runId };
    this.worker.postMessage(message);
    this.handlers.onRunStateChange(true);
    return runId;
  }

  /**
   * FR-031 / FR-062: hand one submitted line — plus the trailing `\n` the
   * stdin stream is defined in terms of — to the suspended read. Returns false
   * when nothing could be written, leaving the read blocked.
   */
  submitStdinLine(text: string): boolean {
    if (!this.stdinBuffer || !this.isRunning) return false;
    return writeSubmission(this.stdinBuffer, `${text}\n`);
  }

  /** FR-034: deliver end-of-file to the suspended read. */
  sendStdinEof(): boolean {
    if (!this.stdinBuffer || !this.isRunning) return false;
    return writeSubmission(this.stdinBuffer, null);
  }

  private receive(message: FromWorker): void {
    if (!isCurrentRun(message, this.currentRunId)) return;

    switch (message.type) {
      case 'ready':
        if (this.state === 'restarting') {
          // FR-064: recovery is silent — no second `Python … ready` line.
          this.state = 'ready';
          this.handlers.onRecovered();
          break;
        }
        this.stopProgress();
        this.handlers.onProgress(100);
        this.state = 'ready';
        this.handlers.onReady(message.pythonVersion);
        break;
      case 'initError':
        this.fail(message.message);
        break;
      case 'stdout':
        this.handlers.onStdout(message.text);
        break;
      case 'stderr':
        this.handlers.onStderr(message.text);
        break;
      case 'stdinRequest':
        this.handlers.onStdinRequest(message.prompt, message.mode);
        break;
      case 'done':
        this.currentRunId = null;
        this.handlers.onDone(message.durationMs);
        this.handlers.onRunStateChange(false);
        break;
      case 'error':
        this.currentRunId = null;
        this.handlers.onError(message.traceback);
        this.handlers.onRunStateChange(false);
        break;
    }
  }

  private fail(message: string): void {
    if (this.state === 'failed') return;
    this.stopProgress();
    this.state = 'failed';
    this.handlers.onInitError(message);
  }

  private tickProgress(): void {
    const elapsed = performance.now() - this.startedAt;
    const percent = Math.min(PROGRESS_CEILING, (elapsed / EXPECTED_BOOT_MS) * PROGRESS_CEILING);
    if (percent <= this.lastPercent) return;
    this.lastPercent = percent;
    this.handlers.onProgress(percent);
  }

  private stopProgress(): void {
    if (this.progressTimer === null) return;
    clearInterval(this.progressTimer);
    this.progressTimer = null;
  }
}
