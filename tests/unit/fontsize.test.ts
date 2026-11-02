import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_KEY,
  FONT_SIZES,
  applyFontSize,
  isFontSize,
  loadFontSize,
  saveFontSize,
} from '../../src/fontsize';
import {
  FONT_SIZE_ITEM,
  FONT_SIZE_LABEL,
  FONT_SIZE_NAME,
  FONT_SIZE_SAVE_FAILED,
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

describe('Constants and strings (Data & Interfaces)', () => {
  it('pins the key, the preset list and the default', () => {
    expect(FONT_SIZE_KEY).toBe('pyplay.fontsize.v1');
    expect([...FONT_SIZES]).toEqual([12, 14, 16, 18, 20, 24]);
    expect(FONT_SIZE_DEFAULT).toBe(14);
  });

  it('quotes the four strings verbatim from the spec', () => {
    expect(FONT_SIZE_LABEL(20)).toBe('Font size: 20');
    expect(FONT_SIZE_NAME(20)).toBe('Font size: 20 px');
    expect(FONT_SIZE_ITEM(18)).toBe('18 px');
    expect(FONT_SIZE_ITEM(14)).toBe('14 px (default)');
    expect(FONT_SIZE_SAVE_FAILED).toBe("Font size won't be remembered");
  });
});

describe('VC-1313: invalid or absent stored value (FR-1313, BR-1303)', () => {
  it('loads the default when the key is absent', () => {
    const s = recordingStorage();
    expect(loadFontSize(s)).toBe(14);
    expect(s.writes).toEqual([]);
  });

  for (const bad of ['15', '016', '16px', ' 16', '', 'large', '16 ', '+16', '1e1', '16.0', '0x10']) {
    it(`loads 14 for ${JSON.stringify(bad)} and leaves it in place`, () => {
      const s = recordingStorage({ [FONT_SIZE_KEY]: bad });
      expect(loadFontSize(s)).toBe(14);
      expect(s.writes).toEqual([]);
      expect(s.getItem(FONT_SIZE_KEY)).toBe(bad);
    });
  }

  it('loads 14 when getItem throws', () => {
    const s: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {},
    };
    expect(loadFontSize(s)).toBe(14);
  });

  it('loads 14 when storage is unavailable', () => {
    expect(loadFontSize(null)).toBe(14);
  });

  it('accepts every canonical preset', () => {
    for (const n of FONT_SIZES) {
      expect(loadFontSize(recordingStorage({ [FONT_SIZE_KEY]: String(n) }))).toBe(n);
    }
  });
});

describe('VC-1311: persist on selection (FR-1311, BR-1303) — write half', () => {
  it('writes exactly the canonical string, synchronously', () => {
    const s = recordingStorage();
    expect(saveFontSize(s, 20)).toBe(true);
    expect(s.writes).toEqual([['pyplay.fontsize.v1', '20']]);
  });

  it('refuses a value outside the preset list without writing', () => {
    const s = recordingStorage();
    expect(saveFontSize(s, 15)).toBe(false);
    expect(saveFontSize(s, 16.5)).toBe(false);
    expect(s.writes).toEqual([]);
  });

  it('returns false rather than throwing (FR-1314)', () => {
    const throwing: StorageLike = {
      getItem: () => null,
      setItem() {
        throw new Error('quota');
      },
    };
    expect(saveFontSize(throwing, 18)).toBe(false);
    expect(saveFontSize(null, 18)).toBe(false);
  });
});

describe('applyFontSize (BR-1305)', () => {
  it('sets --editor-font-size in px on the document element', () => {
    applyFontSize(24);
    expect(document.documentElement.style.getPropertyValue('--editor-font-size')).toBe('24px');
    applyFontSize(12);
    expect(document.documentElement.style.getPropertyValue('--editor-font-size')).toBe('12px');
  });
});

describe('VC-1317: allow-list lives twice (BR-1304)', () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .find((body) => body.includes('pyplay.fontsize.v1'));

  it('finds the inline bootstrap', () => {
    expect(script).toBeDefined();
  });

  it('the allow-list parsed from the inline script equals FONT_SIZES', () => {
    const literal = /ALLOWED\s*=\s*\[([^\]]*)\]/.exec(script!);
    expect(literal).not.toBeNull();
    const parsed = literal![1]
      .split(',')
      .map((item) => item.trim().replace(/^'|'$/g, ''))
      .filter((item) => item !== '');
    expect(parsed).toEqual(FONT_SIZES.map(String));
  });

  /** Run the real inline script against a stub; true iff it set the variable. */
  function inlineAccepts(raw: string): boolean {
    const props: Record<string, string> = {};
    const doc = {
      documentElement: {
        style: {
          setProperty(name: string, value: string) {
            props[name] = value;
          },
        },
      },
    };
    const localStorageStub = { getItem: () => raw };
    new Function('document', 'localStorage', script!)(doc, localStorageStub);
    if (Object.keys(props).length === 0) return false;
    expect(props).toEqual({ '--editor-font-size': `${raw}px` });
    return true;
  }

  it('inline and module validators agree on "0"…"100" and the odd forms', () => {
    const samples = [
      ...Array.from({ length: 101 }, (_, i) => String(i)),
      '016',
      '16px',
      ' 16',
      '',
    ];
    for (const raw of samples) {
      expect(inlineAccepts(raw), JSON.stringify(raw)).toBe(isFontSize(raw));
    }
  });

  it('inline script sets nothing when localStorage is absent or throws', () => {
    const props: string[] = [];
    const doc = { documentElement: { style: { setProperty: (n: string) => props.push(n) } } };
    new Function('document', 'localStorage', script!)(doc, {
      getItem() {
        throw new Error('blocked');
      },
    });
    new Function('document', 'localStorage', script!)(doc, { getItem: () => null });
    expect(props).toEqual([]);
  });
});
