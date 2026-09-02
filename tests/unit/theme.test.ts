import { describe, expect, it } from 'vitest';
import {
  THEME_KEY,
  cyclePreference,
  effectivePalette,
  loadPreference,
  parsePreference,
  savePreference,
  type ThemePreference,
} from '../../src/theme';
import type { StorageLike } from '../../src/storage';

function memoryStorage(
  initial: Record<string, string> = {},
): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('parsePreference (FR-505, FR-507, BR-501)', () => {
  it('accepts only the exact allow-list strings', () => {
    expect(parsePreference('light')).toBe('light');
    expect(parsePreference('dark')).toBe('dark');
    expect(parsePreference('system')).toBe('system');
  });

  it('treats absent, empty, and non-canonical values as system', () => {
    expect(parsePreference(null)).toBe('system');
    expect(parsePreference(undefined)).toBe('system');
    expect(parsePreference('')).toBe('system');
    expect(parsePreference('Light')).toBe('system');
    expect(parsePreference('DARK')).toBe('system');
    expect(parsePreference('{"mode":"dark"}')).toBe('system');
    expect(parsePreference(' auto ')).toBe('system');
  });
});

describe('cyclePreference (FR-502)', () => {
  it('advances light → dark → system → light', () => {
    const order: ThemePreference[] = ['light', 'dark', 'system', 'light'];
    let current: ThemePreference = 'light';
    for (let i = 1; i < order.length; i++) {
      current = cyclePreference(current);
      expect(current).toBe(order[i]);
    }
  });
});

describe('effectivePalette (BR-503, FR-508, FR-509)', () => {
  it('forces light and dark regardless of the OS sample', () => {
    expect(effectivePalette('light', true)).toBe('light');
    expect(effectivePalette('light', false)).toBe('light');
    expect(effectivePalette('dark', true)).toBe('dark');
    expect(effectivePalette('dark', false)).toBe('dark');
  });

  it('resolves system from the provided OS sample', () => {
    expect(effectivePalette('system', true)).toBe('dark');
    expect(effectivePalette('system', false)).toBe('light');
  });
});

describe('loadPreference / savePreference (BR-501)', () => {
  it('loads a stored canonical value and defaults when absent', () => {
    expect(loadPreference(memoryStorage({ [THEME_KEY]: 'dark' }))).toBe('dark');
    expect(loadPreference(memoryStorage())).toBe('system');
    expect(loadPreference(null)).toBe('system');
  });

  it('falls back to system when the stored value is invalid', () => {
    expect(loadPreference(memoryStorage({ [THEME_KEY]: 'Light' }))).toBe('system');
  });

  it('writes the canonical string under pyplay.theme.v1', () => {
    const store = memoryStorage();
    expect(savePreference(store, 'dark')).toBe(true);
    expect(store.data[THEME_KEY]).toBe('dark');
  });

  it('reports failure instead of throwing when the write is rejected', () => {
    const store: StorageLike = {
      getItem: () => null,
      setItem() {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    expect(savePreference(store, 'light')).toBe(false);
  });
});
