import { STDIN_BUFFER_BYTES, isCurrentRun, type FromWorker, type ToWorker } from './protocol';

/** Callbacks the page installs on the runtime. */
export interface RuntimeHandlers {
  onProgress(percent: number): void;
  onReady(pythonVersion: string): void;
  onInitError(message: string): void;
  onStdout(text: string): void;
  onStderr(text: string): void;
  onDone(durationMs: number): void;
  onError(traceback: string): void;
  onRunStateChange(running: boolean): void;
}

export type RuntimeState = 'loading' | 'ready' | 'failed';

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
 * Stop (terminate-and-replace) lands in Iteration 3.
 */
export class PyodideRuntime {
  private worker: Worker | null = null;
  private nextRunId = 1;
  private currentRunId: number | null = null;
  private state: RuntimeState = 'loading';
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private lastPercent = 0;

  constructor(private readonly handlers: RuntimeHandlers) {}

  /** Spawn the worker and boot Pyodide (BR-003: never on the main thread). */
  start(): void {
    this.startedAt = performance.now();
    this.tickProgress();
    this.progressTimer = setInterval(() => this.tickProgress(), PROGRESS_TICK_MS);

    // A classic worker: it pulls the self-hosted Pyodide loader in with
    // `importScripts`, so no CDN and no bundler indirection (BR-001).
    const worker = new Worker(new URL('./worker/pyodide.worker.ts', import.meta.url));
    this.worker = worker;
    worker.addEventListener('message', (event: MessageEvent<FromWorker>) =>
      this.receive(event.data),
    );
    worker.addEventListener('error', (event) => {
      this.fail(event.message || 'The Python worker could not be started.');
    });

    // The stdin channel is created here and consumed in Iteration 4.
    const init: ToWorker = {
      type: 'init',
      stdinBuffer: new SharedArrayBuffer(STDIN_BUFFER_BYTES),
    };
    worker.postMessage(init);
  }

  get isReady(): boolean {
    return this.state === 'ready';
  }

  get isRunning(): boolean {
    return this.currentRunId !== null;
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

  private receive(message: FromWorker): void {
    if (!isCurrentRun(message, this.currentRunId)) return;

    switch (message.type) {
      case 'ready':
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
        // Iteration 4 suspends on this; ignored for now.
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
