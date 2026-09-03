import { STDIN_HEADER_BYTES } from './stdin-channel';
import type { StdinMode } from './stdin-stream';
import type { WorkspaceFile } from './workspace';

/**
 * Main thread <-> worker message protocol (spec: *Data & Interfaces*).
 *
 * `runId` is allocated by the main thread, starts at 1, increments on every
 * Run and is never reset — so a stale message from a terminated worker can
 * never be mistaken for output of the current run.
 */

/** Main -> worker. */
export type ToWorker =
  | { type: 'init'; stdinBuffer: SharedArrayBuffer; fsBuffer: SharedArrayBuffer }
  | { type: 'run'; files: WorkspaceFile[]; entryFile: string; runId: number };

/** Worker -> main. */
export type FromWorker =
  | { type: 'ready'; pythonVersion: string }
  | { type: 'initError'; message: string }
  | { type: 'stdout'; runId: number; text: string }
  | { type: 'stderr'; runId: number; text: string }
  | { type: 'fsMutationAvailable'; runId: number; sequence: number }
  | { type: 'workspaceSnapshot'; runId: number; files: WorkspaceFile[] }
  | { type: 'stdinRequest'; runId: number; prompt: string; mode: StdinMode }
  | { type: 'done'; runId: number; durationMs: number }
  | { type: 'error'; runId: number; traceback: string };

/** Where the vendored Pyodide runtime is served from (BR-001: own origin). */
export const PYODIDE_INDEX_URL = 'pyodide/';

/** FR-066: the longest stdin line the visitor may submit, in code points. */
export const STDIN_MAX_LINE = 65_536;

/**
 * Size of the stdin `SharedArrayBuffer`: the control header plus room for one
 * submitted line of 65 536 code points, each up to 4 UTF-8 bytes, plus the
 * `\n` the main thread appends (FR-066).
 */
export const STDIN_BUFFER_BYTES = STDIN_HEADER_BYTES + STDIN_MAX_LINE * 4 + 4;

/**
 * True when a worker message belongs to the run the main thread is currently
 * tracking. Messages carrying any other `runId` are discarded.
 */
export function isCurrentRun(message: FromWorker, currentRunId: number | null): boolean {
  if (!('runId' in message)) return true;
  return currentRunId !== null && message.runId === currentRunId;
}
