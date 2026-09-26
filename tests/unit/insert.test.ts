import { EditorSelection, EditorState, type SelectionRange } from '@codemirror/state';
import { beforeEach, describe, expect, test } from 'vitest';
import { symbolInsertion } from '../../src/editor';
import { insertIntoField } from '../../src/insert';

/** Spec-03's seven multi-character rows (FR-1602, FR-1612). */
const MULTI_CHARACTER_VALUES = ['//', '**', '==', '!=', '<=', '>=', '...'];

function apply(doc: string, selection: EditorSelection | SelectionRange, value: string) {
  const state = EditorState.create({
    doc,
    selection,
    // FR-1601 delegates multi-range mapping to CodeMirror; a state keeps only
    // its main range without this facet, so VC-1602's two-range case needs it.
    extensions: EditorState.allowMultipleSelections.of(true),
  });
  return state.update(symbolInsertion(state, value));
}

describe('VC-1601: symbolInsertion inserts at the caret', () => {
  test('a collapsed caret inserts and the caret lands after the text', () => {
    const transaction = apply('print()', EditorSelection.cursor(6), '#');
    expect(transaction.newDoc.toString()).toBe('print(#)');
    expect(transaction.newSelection.main.empty).toBe(true);
    expect(transaction.newSelection.main.head).toBe(7);
  });

  test('the transaction reports the input.type user event (FR-1601, BR-1602)', () => {
    const transaction = apply('x', EditorSelection.cursor(1), '_');
    expect(transaction.isUserEvent('input.type')).toBe(true);
  });
});

describe('VC-1602: symbolInsertion replaces every selected range', () => {
  test('a non-empty selection is replaced', () => {
    const transaction = apply('print("x")', EditorSelection.range(0, 10), '#');
    expect(transaction.newDoc.toString()).toBe('#');
    expect(transaction.newSelection.main.empty).toBe(true);
    expect(transaction.newSelection.main.head).toBe(1);
  });

  test('a two-range selection replaces both with both carets correct', () => {
    const transaction = apply(
      'aa bb',
      EditorSelection.create([EditorSelection.range(0, 2), EditorSelection.range(3, 5)], 1),
      '#',
    );
    expect(transaction.newDoc.toString()).toBe('# #');
    const ranges = transaction.newSelection.ranges;
    expect(ranges.length).toBe(2);
    expect(ranges.map((range) => range.head)).toEqual([1, 3]);
    expect(ranges.every((range) => range.empty)).toBe(true);
  });
});

describe('VC-1602: multi-character values insert every character', () => {
  test.each(MULTI_CHARACTER_VALUES)('%s inserts in one transaction', (value) => {
    const transaction = apply('ab', EditorSelection.cursor(1), value);
    expect(transaction.newDoc.toString()).toBe(`a${value}b`);
    expect(transaction.newSelection.main.head).toBe(1 + value.length);
    expect(transaction.isUserEvent('input.type')).toBe(true);
  });
});

describe('VC-1606: insertIntoField uses setRangeText offsets', () => {
  let field: HTMLInputElement;
  let inputEvents: number;

  beforeEach(() => {
    field = document.createElement('input');
    field.type = 'text';
    document.body.appendChild(field);
    inputEvents = 0;
    field.addEventListener('input', () => {
      inputEvents += 1;
    });
  });

  test('inserts at the start', () => {
    field.value = 'bc';
    field.setSelectionRange(0, 0);
    insertIntoField(field, '_');
    expect(field.value).toBe('_bc');
    expect(field.selectionStart).toBe(1);
    expect(field.selectionEnd).toBe(1);
  });

  test('inserts in the middle', () => {
    field.value = 'ac';
    field.setSelectionRange(1, 1);
    insertIntoField(field, '...');
    expect(field.value).toBe('a...c');
    expect(field.selectionStart).toBe(4);
  });

  test('inserts at the end', () => {
    field.value = 'ab';
    field.setSelectionRange(2, 2);
    insertIntoField(field, '#');
    expect(field.value).toBe('ab#');
    expect(field.selectionStart).toBe(3);
  });

  test('replaces a selection and leaves the caret after the inserted text', () => {
    field.value = 'abcd';
    field.setSelectionRange(1, 3);
    insertIntoField(field, '**');
    expect(field.value).toBe('a**d');
    expect(field.selectionStart).toBe(3);
    expect(field.selectionEnd).toBe(3);
  });

  test('null selection offsets fall back to the end of the value', () => {
    field.value = 'ab';
    Object.defineProperty(field, 'selectionStart', { value: null, configurable: true });
    Object.defineProperty(field, 'selectionEnd', { value: null, configurable: true });
    insertIntoField(field, '#');
    expect(field.value).toBe('ab#');
  });

  test('dispatches no input event (FR-1606)', () => {
    field.value = 'ab';
    field.setSelectionRange(2, 2);
    insertIntoField(field, '#');
    expect(inputEvents).toBe(0);
  });
});
