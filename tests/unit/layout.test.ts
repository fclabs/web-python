import { describe, expect, it } from 'vitest';
import {
  LAYOUT_EDITOR_COLUMN,
  LAYOUT_KEY,
  LAYOUT_MIN_HEIGHT,
  LAYOUT_MIN_WIDTH,
  type Layout,
  loadLayoutPreference,
  resolveLayout,
  saveLayoutPreference,
} from '../../src/layout';
import {
  LAYOUT_HORIZONTAL,
  LAYOUT_LABEL,
  LAYOUT_NARROW_HINT,
  LAYOUT_SAVE_FAILED,
  LAYOUT_VERTICAL,
} from '../../src/format';
import type { StorageLike } from '../../src/storage';

type Recorder = StorageLike & { reads: string[]; writes: [string, string][] };

/** A store that records every call, so "rewrites nothing" is assertable. */
function recordingStorage(initial: Record<string, string> = {}): Recorder {
  const data = { ...initial };
  const reads: string[] = [];
  const writes: [string, string][] = [];
  return {
    reads,
    writes,
    getItem(key) {
      reads.push(key);
      return key in data ? data[key] : null;
    },
    setItem(key, value) {
      writes.push([key, value]);
      data[key] = value;
    },
  };
}

describe('Constants (Data & Interfaces / Constants)', () => {
  it('pins the key, breakpoint, column share and height floor the spec names', () => {
    expect(LAYOUT_KEY).toBe('pyplay.layout.v2');
    expect(LAYOUT_MIN_WIDTH).toBe(900);
    expect(LAYOUT_EDITOR_COLUMN).toBe('58%');
    expect(LAYOUT_MIN_HEIGHT).toBe(520);
  });
});

describe('User-visible strings (Data & Interfaces / User-visible strings)', () => {
  it('quotes the five layout strings verbatim from the spec', () => {
    expect(LAYOUT_LABEL).toBe('Layout');
    expect(LAYOUT_VERTICAL).toBe('Vertical');
    expect(LAYOUT_HORIZONTAL).toBe('Horizontal');
    expect(LAYOUT_NARROW_HINT).toBe('Vertical layout needs a window at least 900 px wide');
    expect(LAYOUT_SAVE_FAILED).toBe("Layout preference won't be remembered");
  });
});

describe('VC-411: resolveLayout (FR-411)', () => {
  const preferences: (Layout | null)[] = ['vertical', 'horizontal', null];

  /*
   * Both names describe the orientation of the divider between the panels
   * (see `src/layout.ts`): `horizontal` stacks them in one column and is the
   * only layout below `LAYOUT_MIN_WIDTH`; `vertical` is the two-column split
   * and is the default at or above it.
   */
  for (const width of [0, 374, 375, 899]) {
    for (const pref of preferences) {
      it(`resolves the stacked layout at ${width} px with preference ${String(pref)}`, () => {
        expect(resolveLayout(pref, width)).toBe('horizontal');
      });
    }
  }

  for (const width of [LAYOUT_MIN_WIDTH, 1280]) {
    it(`honours a stored horizontal preference at ${width} px`, () => {
      expect(resolveLayout('horizontal', width)).toBe('horizontal');
    });

    it(`honours a stored vertical preference at ${width} px`, () => {
      expect(resolveLayout('vertical', width)).toBe('vertical');
    });

    it(`defaults to the two-column layout at ${width} px with no preference`, () => {
      expect(resolveLayout(null, width)).toBe('vertical');
    });
  }
});

describe('VC-417: loadLayoutPreference (FR-417)', () => {
  const malformed: [string, string][] = [
    ['an empty string', ''],
    ['a leading space', ' vertical'],
    ['a trailing space', 'horizontal '],
    ['the wrong case', 'Horizontal'],
    ['a JSON string', '"horizontal"'],
    ['a JSON document', '{"layout":"horizontal"}'],
    ['an unknown layout', 'diagonal'],
    ['a 1 MB string', 'x'.repeat(1024 * 1024)],
  ];

  for (const [label, value] of malformed) {
    it(`treats ${label} as absent and rewrites nothing`, () => {
      const store = recordingStorage({ [LAYOUT_KEY]: value });
      expect(loadLayoutPreference(store)).toBeNull();
      expect(store.writes).toEqual([]);
    });
  }

  it('treats an absent key as absent and rewrites nothing', () => {
    const store = recordingStorage();
    expect(loadLayoutPreference(store)).toBeNull();
    expect(store.writes).toEqual([]);
  });

  it('treats a throwing read as absent and rewrites nothing', () => {
    const writes: [string, string][] = [];
    const store: StorageLike = {
      getItem() {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem(key, value) {
        writes.push([key, value]);
      },
    };
    expect(loadLayoutPreference(store)).toBeNull();
    expect(writes).toEqual([]);
  });

  it('treats unavailable storage as absent', () => {
    expect(loadLayoutPreference(null)).toBeNull();
  });

  it('returns vertical for exactly that byte string', () => {
    const store = recordingStorage({ [LAYOUT_KEY]: 'vertical' });
    expect(loadLayoutPreference(store)).toBe('vertical');
    expect(store.writes).toEqual([]);
  });

  it('returns horizontal for exactly that byte string', () => {
    const store = recordingStorage({ [LAYOUT_KEY]: 'horizontal' });
    expect(loadLayoutPreference(store)).toBe('horizontal');
    expect(store.writes).toEqual([]);
  });

  it('reads only its own key', () => {
    const store = recordingStorage({ [LAYOUT_KEY]: 'vertical' });
    loadLayoutPreference(store);
    expect(store.reads).toEqual([LAYOUT_KEY]);
  });
});

describe('VC-414: saveLayoutPreference (FR-414, FR-418)', () => {
  for (const layout of ['vertical', 'horizontal'] as const) {
    it(`writes the bare string ${layout} once under pyplay.layout.v2`, () => {
      const store = recordingStorage();
      expect(saveLayoutPreference(store, layout)).toBe(true);
      expect(store.writes).toEqual([[LAYOUT_KEY, layout]]);
      const [, written] = store.writes[0];
      expect(written).toBe(layout);
      expect(written.length).toBe(layout === 'vertical' ? 8 : 10);
      expect(written).not.toMatch(/["'\s]/);
      expect(written.trim()).toBe(written);
    });
  }

  it('reports failure instead of throwing when the write is rejected', () => {
    const store: StorageLike = {
      getItem: () => null,
      setItem() {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    expect(() => saveLayoutPreference(store, 'horizontal')).not.toThrow();
    expect(saveLayoutPreference(store, 'horizontal')).toBe(false);
  });

  it('reports failure when storage is unavailable', () => {
    expect(saveLayoutPreference(null, 'horizontal')).toBe(false);
  });
});
