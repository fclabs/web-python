import type { EditorView } from '@codemirror/view';
import { setEditorColorScheme } from './editor';
import {
  THEME_GLYPHS,
  THEME_LABELS,
  formatThemeAccessibleName,
} from './format';
import { getLocalStorage, type StorageLike } from './storage';

/** localStorage key for the color-mode preference (BR-501). */
export const THEME_KEY = 'pyplay.theme.v1';

/** Canonical preference strings — BR-501 allow-list shared with index.html bootstrap. */
export type ThemePreference = 'light' | 'dark' | 'system';

export type EffectivePalette = 'light' | 'dark';

const ALLOWED: readonly ThemePreference[] = ['light', 'dark', 'system'];

/** Read `prefers-color-scheme: dark` once. No change listener (BR-502). */
export function readOsDarkOnce(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/** BR-502 / A-504: sample OS prefers-color-scheme once per page load. */
const osDarkSample: boolean = readOsDarkOnce();

/** Accept only exact `light` | `dark` | `system`; anything else → `system` (FR-505, FR-507). */
export function parsePreference(raw: string | null | undefined): ThemePreference {
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

/** Resolve the effective light/dark palette (BR-503). */
export function effectivePalette(
  preference: ThemePreference,
  osDark: boolean = osDarkSample,
): EffectivePalette {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return osDark ? 'dark' : 'light';
}

/** FR-502 cycle order: light → dark → system → light. */
export function cyclePreference(current: ThemePreference): ThemePreference {
  const i = ALLOWED.indexOf(current);
  return ALLOWED[(i + 1) % ALLOWED.length]!;
}

/**
 * FR-514 / FR-516 / BR-506: `data-theme` mirrors the preference; used
 * `color-scheme` and `data-effective` track the effective palette so System
 * chrome stays load-scoped (FR-510 / BR-502 / VC-508) instead of following a
 * live `@media (prefers-color-scheme)`.
 */
export function applyDocumentTheme(preference: ThemePreference): EffectivePalette {
  const effective = effectivePalette(preference);
  document.documentElement.dataset.theme = preference;
  document.documentElement.dataset.effective = effective;
  document.documentElement.style.colorScheme = effective;
  return effective;
}

export function loadPreference(storage: StorageLike | null = getLocalStorage()): ThemePreference {
  if (!storage) return 'system';
  try {
    return parsePreference(storage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

/** Persist a canonical preference string. Returns false on write failure (BR-504). */
export function savePreference(
  storage: StorageLike | null,
  preference: ThemePreference,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(THEME_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

/** FR-503 / FR-504: glyph, title, and accessible name for the current preference. */
export function refreshThemeControl(
  button: HTMLButtonElement,
  preference: ThemePreference,
): void {
  const label = THEME_LABELS[preference];
  button.textContent = THEME_GLYPHS[preference];
  button.title = label;
  button.setAttribute('aria-label', formatThemeAccessibleName(label));
}

/**
 * FR-501 – FR-504 / FR-512: wire `#btn-theme` to cycle preference, paint chrome
 * + editor, persist, and refresh the control chrome. Not routed through
 * `setInert()` (same posture as Symbols).
 */
export function bindThemeControl(
  button: HTMLButtonElement,
  view: EditorView,
  storage: StorageLike | null = getLocalStorage(),
): void {
  let preference = loadPreference(storage);
  refreshThemeControl(button, preference);

  button.addEventListener('click', () => {
    preference = cyclePreference(preference);
    const effective = applyDocumentTheme(preference);
    setEditorColorScheme(view, effective);
    savePreference(storage, preference);
    refreshThemeControl(button, preference);
  });
}
