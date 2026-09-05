/**
 * Diagnostics-panel height preference helpers (spec-09: FR-907 – FR-912).
 *
 * Pure logic only: no DOM, no storage acquisition. The caller passes the
 * store (`getLocalStorage()` from `src/storage.ts`) and measured bounds, so
 * every branch of FR-911 / FR-908 is unit-testable without a browser.
 */

import type { StorageLike } from './storage';

/** localStorage key holding the canonical height string (FR-909 – FR-911). */
export const DIAG_HEIGHT_KEY = 'pyplay.diagnostics-height.v1';

/** Keyboard step in CSS px (FR-905). */
export const DIAG_HEIGHT_STEP = 16;

/** Shift+arrow step in CSS px (FR-905). */
export const DIAG_HEIGHT_STEP_LARGE = 48;

/** Cap as a fraction of right-column height (FR-908 / FR-409). */
export const DIAG_HEIGHT_MAX_RATIO = 0.4;

/** Console content-box floor in CSS px (FR-908 / FR-409). */
export const DIAG_CONSOLE_MIN = 80;

/** Canonical height string: non-empty decimal integer, no sign/leading zero/units (FR-911). */
const CANONICAL_HEIGHT = /^[1-9][0-9]*$/;

/**
 * FR-911: true iff `raw` is exactly a canonical height string.
 */
export function isCanonicalDiagHeight(raw: string): boolean {
  return CANONICAL_HEIGHT.test(raw);
}

/**
 * FR-910 / FR-911: read the stored height. Missing key, throw, or non-canonical
 * value → null. Never writes — a non-canonical value is left in place until
 * the visitor next commits a resize (FR-911).
 */
export function loadDiagHeight(storage: StorageLike | null): number | null {
  if (!storage) return null;
  let value: string | null;
  try {
    value = storage.getItem(DIAG_HEIGHT_KEY);
  } catch {
    return null;
  }
  if (value === null || !isCanonicalDiagHeight(value)) return null;
  return Number(value);
}

/**
 * FR-909 / FR-912: persist height as a canonical integer string. Returns false
 * rather than throwing when storage is unavailable or the write is rejected.
 */
export function saveDiagHeight(storage: StorageLike | null, height: number): boolean {
  if (!storage) return false;
  const canonical = String(Math.trunc(height));
  if (!isCanonicalDiagHeight(canonical)) return false;
  try {
    storage.setItem(DIAG_HEIGHT_KEY, canonical);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clamp a diagnostics height into the inclusive [min, max] band (FR-907 / FR-908).
 * Degenerate (min > max) viewports resolve to `max` via the nested min/max.
 */
export function clampDiagHeight(
  height: number,
  bounds: { min: number; max: number },
): number {
  return Math.min(bounds.max, Math.max(bounds.min, height));
}

/**
 * FR-908: the largest diagnostics height that still respects both caps —
 * ≤ 40 % of the right column, and console ≥ `consoleMin` (default
 * `DIAG_CONSOLE_MIN`). Whichever bound is hit first wins:
 *
 *   Math.max(0, Math.floor(Math.min(
 *     rightColumnHeight * DIAG_HEIGHT_MAX_RATIO,
 *     rightColumnHeight - (consoleMin ?? DIAG_CONSOLE_MIN),
 *   )))
 */
export function maxDiagHeight(
  rightColumnHeight: number,
  consoleMin: number = DIAG_CONSOLE_MIN,
): number {
  const byRatio = rightColumnHeight * DIAG_HEIGHT_MAX_RATIO;
  const byConsoleFloor = rightColumnHeight - consoleMin;
  return Math.max(0, Math.floor(Math.min(byRatio, byConsoleFloor)));
}
