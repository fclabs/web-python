import { describe, expect, it } from 'vitest';
import { PROGRAM_KEY, loadProgram, saveProgram, type StorageLike } from '../../src/storage';
import { STARTER_PROGRAM } from '../../src/starter';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('loadProgram (FR-003, FR-004)', () => {
  it('restores the stored program byte for byte', () => {
    const store = memoryStorage({ [PROGRAM_KEY]: 'x = 42\n\t indented\n' });
    expect(loadProgram(store)).toBe('x = 42\n\t indented\n');
  });

  it('restores an empty stored program as empty, not as the starter', () => {
    expect(loadProgram(memoryStorage({ [PROGRAM_KEY]: '' }))).toBe('');
  });

  it('falls back to the starter program when the key is absent', () => {
    expect(loadProgram(memoryStorage())).toBe(STARTER_PROGRAM);
  });

  it('falls back to the starter program when storage is unavailable', () => {
    expect(loadProgram(null)).toBe(STARTER_PROGRAM);
  });

  it('falls back to the starter program when the read throws', () => {
    const store: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {},
    };
    expect(loadProgram(store)).toBe(STARTER_PROGRAM);
  });
});

describe('saveProgram (FR-002, FR-005)', () => {
  it('writes under pyplay.program.v1 and reports success', () => {
    const store = memoryStorage();
    expect(saveProgram(store, 'x = 42')).toBe(true);
    expect(store.data[PROGRAM_KEY]).toBe('x = 42');
  });

  it('reports failure instead of throwing when the write is rejected', () => {
    const store: StorageLike = {
      getItem: () => null,
      setItem() {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    expect(saveProgram(store, 'x = 42')).toBe(false);
  });

  it('reports failure when storage is unavailable', () => {
    expect(saveProgram(null, 'x = 42')).toBe(false);
  });
});
