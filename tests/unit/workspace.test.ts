import { describe, expect, it } from 'vitest';
import {
  LEGACY_PROGRAM_KEY,
  MAIN_FILE,
  MAX_FILENAME_BYTES,
  STARTER_MAIN,
  WORKSPACE_MAX_BYTES,
  WORKSPACE_KEY,
  Workspace,
  decodeText,
  encodeText,
  loadWorkspace,
  saveWorkspace,
  type StorageLike,
} from '../../src/workspace';
import { STARTER_PROGRAM } from '../../src/starter';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { data[key] = value; },
    removeItem: (key) => { delete data[key]; },
  };
}

describe('flat workspace persistence', () => {
  it('starts a clean origin with the friendly starter main.py', () => {
    const workspace = loadWorkspace(memoryStorage());
    expect(workspace.names()).toEqual([MAIN_FILE]);
    expect(decodeText(workspace.get(MAIN_FILE)!)).toBe(STARTER_MAIN);
    expect(STARTER_MAIN).toBe(STARTER_PROGRAM);
  });

  it('migrates the old single editor buffer without changing bytes', () => {
    const store = memoryStorage({ [LEGACY_PROGRAM_KEY]: 'print("legacy")\n' });
    const workspace = loadWorkspace(store);
    expect(decodeText(workspace.get(MAIN_FILE)!)).toBe('print("legacy")\n');
    expect(store.data[LEGACY_PROGRAM_KEY]).toBeUndefined();
    expect(store.data[WORKSPACE_KEY]).toBeTruthy();
  });

  it('round-trips text and binary files', () => {
    const store = memoryStorage();
    const workspace = Workspace.starter();
    expect(workspace.put('data.bin', new Uint8Array([0, 255, 4]))).toBeNull();
    workspace.select('data.bin');
    expect(saveWorkspace(store, workspace)).toBe(true);

    const restored = loadWorkspace(store);
    expect(restored.activeFile).toBe('data.bin');
    expect(restored.get('data.bin')).toEqual(new Uint8Array([0, 255, 4]));
  });

  it('rejects nested names and keeps a flat root', () => {
    const workspace = Workspace.starter();
    expect(workspace.put('folder/helper.py', encodeText('x = 1'))).toBe('Files must stay at the workspace root.');
    expect(workspace.names()).toEqual([MAIN_FILE]);
  });

  it('lets a worker snapshot replace the current workspace while preserving a valid selection', () => {
    const workspace = Workspace.starter();
    workspace.select(MAIN_FILE);
    expect(workspace.replaceFiles([{ name: 'answer.txt', bytes: encodeText('done') }])).toBeNull();
    expect(workspace.names()).toEqual(['answer.txt']);
    expect(workspace.activeFile).toBe('answer.txt');
  });

  it('allows a student to delete or rename main.py, leaving no runnable entrypoint', () => {
    const workspace = Workspace.starter();

    workspace.remove(MAIN_FILE);
    expect(workspace.names()).toEqual([]);
    expect(workspace.activeFile).toBeNull();

    expect(workspace.put(MAIN_FILE, encodeText('print("back")\n'))).toBeNull();
    expect(workspace.rename(MAIN_FILE, 'solution.py')).toBeNull();
    expect(workspace.has(MAIN_FILE)).toBe(false);
    expect(workspace.names()).toEqual(['solution.py']);
  });

  it('does not overwrite files when a student renames to an existing name', () => {
    const workspace = Workspace.starter();
    expect(workspace.put('answer.txt', encodeText('original answer'))).toBeNull();

    expect(workspace.rename(MAIN_FILE, 'answer.txt')).toBe('A file with that name already exists.');
    expect(decodeText(workspace.get(MAIN_FILE)!)).toBe(STARTER_MAIN);
    expect(decodeText(workspace.get('answer.txt')!)).toBe('original answer');
  });

  it('rejects every filename that could escape the flat workspace', () => {
    const workspace = Workspace.starter();
    const invalidNames = ['', '.', '..', 'folder/file.py', 'folder\\file.py', 'null\0byte.py'];

    for (const name of invalidNames) {
      expect(workspace.put(name, encodeText('x'))).not.toBeNull();
    }
    expect(workspace.put('a'.repeat(MAX_FILENAME_BYTES + 1), encodeText('x'))).toBe('File name is too long.');
    expect(workspace.names()).toEqual([MAIN_FILE]);
  });

  it('enforces the 2 MB limit without partially replacing existing files', () => {
    const workspace = new Workspace({ activeFile: null, files: [] });
    const exactLimit = new Uint8Array(WORKSPACE_MAX_BYTES);

    expect(workspace.put('limit.bin', exactLimit)).toBeNull();
    expect(workspace.put('one-more-byte.txt', new Uint8Array([1]))).toBe('Workspace is full (max 2 MB).');
    expect(workspace.get('limit.bin')).toHaveLength(WORKSPACE_MAX_BYTES);
    expect(workspace.get('limit.bin')?.at(-1)).toBe(0);
    expect(workspace.has('one-more-byte.txt')).toBe(false);
  });

  it('keeps the current workspace when a worker snapshot is invalid or too large', () => {
    const workspace = Workspace.starter();
    const before = workspace.snapshot();

    expect(workspace.replaceFiles([
      { name: 'duplicate.txt', bytes: encodeText('one') },
      { name: 'duplicate.txt', bytes: encodeText('two') },
    ])).toBe('Duplicate file name.');
    expect(workspace.snapshot()).toEqual(before);

    expect(workspace.replaceFiles([
      { name: 'too-large.bin', bytes: new Uint8Array(WORKSPACE_MAX_BYTES + 1) },
    ])).toBe('Workspace is full (max 2 MB).');
    expect(workspace.snapshot()).toEqual(before);
  });

  it('falls back safely from malformed persisted workspace data and reset restores only main.py', () => {
    const malformed = memoryStorage({ [WORKSPACE_KEY]: '{not json' });
    const workspace = loadWorkspace(malformed);
    expect(workspace.snapshot()).toEqual(Workspace.starter().snapshot());

    expect(workspace.put('student.txt', encodeText('work'))).toBeNull();
    workspace.reset();
    expect(workspace.names()).toEqual([MAIN_FILE]);
    expect(decodeText(workspace.get(MAIN_FILE)!)).toBe(STARTER_MAIN);
  });
});
