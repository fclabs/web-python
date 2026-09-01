/** Exact user-visible strings and their formatting (spec: Functional Requirements). */

const two = (n: number): string => String(n).padStart(2, '0');

/**
 * FR-018: `─── Run at HH:MM:SS ───`, 24-hour clock, visitor's local time zone.
 */
export function formatRunSeparator(at: Date): string {
  return `─── Run at ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())} ───`;
}

/** FR-022: `Program finished in N.NN s`, wall-clock seconds to two decimals. */
export function formatFinished(durationMs: number): string {
  return `Program finished in ${(Math.max(0, durationMs) / 1000).toFixed(2)} s`;
}

/** FR-013: single ready line naming the Python version. */
export function formatReady(pythonVersion: string): string {
  return `Python ${pythonVersion} ready`;
}

/** FR-012 / FR-065: `Loading Python… N%` with an integer percentage. */
export function formatLoading(percent: number): string {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  return `Loading Python… ${clamped}%`;
}

/** FR-023: the visitor killed the run. */
export const PROGRAM_STOPPED = 'Program stopped.';

/** FR-021 */
export const PROGRAM_ERRORED = 'Program exited with an error.';

/** FR-014 */
export const RUNTIME_FAILED = 'Python runtime failed to load. Check your connection and reload the page.';

/** FR-015 */
export const NOT_ISOLATED_BANNER =
  'This page must be served with cross-origin isolation enabled (see Deployment). Python cannot run here.';

/** FR-020: literal prefix rendered immediately before each stderr chunk. */
export const STDERR_PREFIX = '[stderr] ';

/** FR-065 status-indicator texts. */
export const STATUS_PYTHON_UNAVAILABLE = 'Python unavailable';
export const STATUS_CACHING = 'Caching for offline…';
export const STATUS_OFFLINE_READY = 'Offline ready';
export const STATUS_OFFLINE_UNAVAILABLE = 'Offline unavailable';
export const STATUS_RESTARTING = 'Restarting Python…';

/** FR-053: a newer deployment's worker has installed and is waiting. */
export const UPDATE_AVAILABLE = 'A new version is available — reload to update';
