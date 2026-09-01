/**
 * Main thread <-> worker message protocol (spec: *Data & Interfaces*).
 *
 * `runId` is allocated by the main thread, starts at 1, increments on every
 * Run and is never reset — so a stale message from a terminated worker can
 * never be mistaken for output of the current run.
 */

/** Main -> worker. */
export type ToWorker =
  | { type: 'init'; stdinBuffer: SharedArrayBuffer }
  | { type: 'run'; code: string; runId: number };

/** Worker -> main. */
export type FromWorker =
  | { type: 'ready'; pythonVersion: string }
  | { type: 'initError'; message: string }
  | { type: 'stdout'; runId: number; text: string }
  | { type: 'stderr'; runId: number; text: string }
  | { type: 'stdinRequest'; runId: number; prompt: string }
  | { type: 'done'; runId: number; durationMs: number }
  | { type: 'error'; runId: number; traceback: string };

/** Where the vendored Pyodide runtime is served from (BR-001: own origin). */
export const PYODIDE_INDEX_URL = 'pyodide/';

/**
 * Size of the stdin `SharedArrayBuffer`. Control word plus room for one
 * submitted line of 65 536 code points as UTF-8 (FR-066). The buffer is
 * created and shared at `init` now; it is consumed in Iteration 4.
 */
export const STDIN_BUFFER_BYTES = 8 + 65_536 * 4 + 4;

/**
 * True when a worker message belongs to the run the main thread is currently
 * tracking. Messages carrying any other `runId` are discarded.
 */
export function isCurrentRun(message: FromWorker, currentRunId: number | null): boolean {
  if (!('runId' in message)) return true;
  return currentRunId !== null && message.runId === currentRunId;
}
