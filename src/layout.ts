/**
 * Layout preference and resolution (spec-04: FR-411, FR-414, FR-417).
 *
 * Pure logic only: no DOM, no storage acquisition. The caller passes the
 * store (`getLocalStorage()` from `src/storage.ts`) and the viewport width, so
 * every branch of FR-411 and FR-417 is unit-testable without a browser.
 */

import type { StorageLike } from './storage';

/** The two layouts; no third value exists (spec: Scope / Out of scope). */
export type Layout = 'vertical' | 'horizontal';

/** localStorage key holding the bare layout string (Constants). */
export const LAYOUT_KEY = 'pyplay.layout.v1';

/**
 * The width, in CSS px, below which vertical is the only layout (BR-404).
 * Mirrored by a `@media (min-width: 900px)` guard in `src/styles.css` and by
 * `matchMedia('(min-width: 900px)')` on the main thread, so the CSS can never
 * paint two columns the resolver did not choose.
 */
export const LAYOUT_MIN_WIDTH = 900;

/** The editor column's share of the app content width (FR-409). */
export const LAYOUT_EDITOR_COLUMN = '58%';

/**
 * The viewport height, in CSS px, below which the horizontal layout's right
 * column scrolls as a whole rather than compressing the console (FR-409).
 */
export const LAYOUT_MIN_HEIGHT = 520;

/**
 * FR-417: read the stored preference. Anything that is not exactly one of the
 * two literals — an empty string, `Horizontal`, ` vertical`, a JSON document,
 * any other string — and any throw from `getItem` is treated as absent. The
 * stored bytes are left in place: this function never writes.
 */
export function loadLayoutPreference(storage: StorageLike | null): Layout | null {
  if (!storage) return null;
  let value: string | null;
  try {
    value = storage.getItem(LAYOUT_KEY);
  } catch {
    return null;
  }
  return value === 'vertical' || value === 'horizontal' ? value : null;
}

/**
 * FR-414: persist the preference as a bare string — no JSON, no wrapper, no
 * whitespace. Returns false rather than throwing when the write is rejected
 * (quota exceeded, private browsing, storage disabled), which is what FR-418
 * needs to show its notice.
 */
export function saveLayoutPreference(storage: StorageLike | null, layout: Layout): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LAYOUT_KEY, layout);
    return true;
  } catch {
    return false;
  }
}

/**
 * FR-411: the single rule that decides the effective layout — `vertical`
 * below 900 px, otherwise the stored preference, otherwise `horizontal`.
 * Nothing else may set `data-layout`.
 */
export function resolveLayout(pref: Layout | null, viewportWidth: number): Layout {
  if (viewportWidth < LAYOUT_MIN_WIDTH) return 'vertical';
  return pref ?? 'horizontal';
}
