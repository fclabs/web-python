import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { python } from '@codemirror/lang-python';
import { EditorState } from '@codemirror/state';
import { describe, expect, test } from 'vitest';
import {
  PYTHON_HARD_KEYWORDS,
  PYTHON_SOFT_KEYWORDS,
  pythonNameCompletionSource,
} from '../../src/completion';

async function complete(doc: string, explicit = false): Promise<CompletionResult | null> {
  const state = EditorState.create({ doc, extensions: [python()] });
  return pythonNameCompletionSource(new CompletionContext(state, doc.length, explicit)) as Promise<
    CompletionResult | null
  >;
}

describe('pythonNameCompletionSource', () => {
  test('VC-601 (FR-601): merges local and Unicode identifiers with built-ins', async () => {
    const result = await complete('def f(niño, print):\n    pri');
    const byLabel = new Map(result?.options.map((option) => [option.label, option]));

    expect(byLabel.get('niño')?.type).toBe('variable');
    expect(byLabel.get('print')?.type).toBe('variable');
    expect(byLabel.get('range')?.type).toBe('class');
    expect(byLabel.get('len')?.type).toBe('function');
  });

  test('VC-602 (FR-602): contains every Python 3.13 hard and soft keyword once', async () => {
    const result = await complete('', true);
    const labels = result?.options.map((option) => option.label) ?? [];

    expect(labels).toEqual(expect.arrayContaining([...PYTHON_HARD_KEYWORDS]));
    expect(labels).toEqual(expect.arrayContaining([...PYTHON_SOFT_KEYWORDS]));
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('VC-603 (FR-603): local definitions win duplicate global labels', async () => {
    const result = await complete('def f(print):\n    pri');
    const matches = result?.options.filter((option) => option.label === 'print') ?? [];

    expect(matches).toHaveLength(1);
    expect(matches[0]?.type).toBe('variable');
  });

  test('VC-604 (FR-604): every completion inserts only its literal label', async () => {
    const result = await complete('', true);

    for (const option of result?.options ?? []) {
      expect(option.apply).toBe(option.label);
      expect(option).not.toHaveProperty('detail');
      expect(option).not.toHaveProperty('displayLabel');
      expect(option).not.toHaveProperty('info');
    }
  });

  test.each([
    ['comment', '# pri'],
    ['string', '"pri'],
    ['formatted string', 'f"{pri'],
    ['property', 'value.pri'],
  ])('VC-605 (FR-607): returns nothing in a %s', async (_name, doc) => {
    expect(await complete(doc, true)).toBeNull();
  });

  test('VC-606 (FR-605): automatic completion requires an identifier prefix', async () => {
    expect(await complete('')).toBeNull();
    expect(await complete('\n    ')).toBeNull();
    expect(await complete('\n    ', true)).not.toBeNull();
  });
});
