/**
 * Editor font-size preference (spec-13: FR-1311 – FR-1314, BR-1301 – BR-1305).
 *
 * Pure validate/load/save stay free of the DOM. The size reaches the editor
 * through one CSS custom property on the document element, so applying it can
 * neither dispatch a transaction nor re-create the `EditorView` (BR-1305).
 */

import type { StorageLike } from './storage';

/** BR-1303: localStorage key holding the canonical size string. */
export const FONT_SIZE_KEY = 'pyplay.fontsize.v1';

/**
 * BR-1301: the closed preset list, in CSS px, ascending.
 * BR-1304: duplicated as a literal in the inline script in `index.html`;
 * `tests/unit/fontsize.test.ts` (VC-1317) asserts the two are equal.
 */
export const FONT_SIZES: readonly number[] = [12, 14, 16, 18, 20, 24];

/** BR-1301 / FR-1313: the size used when nothing valid is stored. */
export const FONT_SIZE_DEFAULT = 14;

/** BR-1305: the document-level variable read by `.cm-content` / `.cm-gutters`. */
const FONT_SIZE_VAR = '--editor-font-size';

/**
 * BR-1303: true iff `raw` is exactly one of the canonical strings
 * `12`, `14`, `16`, `18`, `20`, `24` — no units, whitespace or leading zeros.
 */
export function isFontSize(raw: string): boolean {
  return FONT_SIZES.some((size) => String(size) === raw);
}

/**
 * FR-1313: read the stored size. Absent key, throwing storage or a
 * non-canonical value → the default. Never writes — a non-canonical value is
 * left in place until the visitor next chooses a size (BR-1303).
 */
export function loadFontSize(storage: StorageLike | null): number {
  if (!storage) return FONT_SIZE_DEFAULT;
  let value: string | null;
  try {
    value = storage.getItem(FONT_SIZE_KEY);
  } catch {
    return FONT_SIZE_DEFAULT;
  }
  if (value === null || !isFontSize(value)) return FONT_SIZE_DEFAULT;
  return Number(value);
}

/**
 * FR-1311 / FR-1314: persist the size as its canonical string, synchronously.
 * Returns false rather than throwing when storage is unavailable, the write is
 * rejected, or `size` is not a preset.
 */
export function saveFontSize(storage: StorageLike | null, size: number): boolean {
  if (!storage) return false;
  const canonical = String(size);
  if (!isFontSize(canonical)) return false;
  try {
    storage.setItem(FONT_SIZE_KEY, canonical);
    return true;
  } catch {
    return false;
  }
}

/**
 * BR-1305: carry the size in `--editor-font-size` on the document element.
 * Idempotent with the inline bootstrap in `index.html` (FR-1312).
 */
export function applyFontSize(size: number): void {
  document.documentElement.style.setProperty(FONT_SIZE_VAR, `${size}px`);
}
