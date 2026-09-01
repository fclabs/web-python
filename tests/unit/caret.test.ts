import { describe, expect, it } from 'vitest';
import { lineIndexAt, mapCaretAcrossFormat } from '../../src/lint/caret';

/** Offset of the middle of the 1-based `line` in `text`. */
function midOfLine(text: string, line: number): number {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < line - 1; i++) offset += lines[i].length + 1;
  return offset + Math.floor(lines[line - 1].length / 2);
}

describe('lineIndexAt', () => {
  it('locates the line containing an offset', () => {
    const lines = ['abc', 'de', 'f'];
    expect(lineIndexAt(lines, 0)).toBe(0);
    expect(lineIndexAt(lines, 3)).toBe(0);
    expect(lineIndexAt(lines, 4)).toBe(1);
    expect(lineIndexAt(lines, 7)).toBe(2);
  });
});

describe('mapCaretAcrossFormat (FR-059)', () => {
  it('places the caret on the first character of the same statement', () => {
    const before = 'x=1\ny   =    2\nz=3\n';
    const after = 'x = 1\ny = 2\nz = 3\n';
    const caret = mapCaretAcrossFormat(before, after, midOfLine(before, 2));
    expect(caret).toBe(after.indexOf('y = 2'));
  });

  it('follows a statement that the reformat moved to a different line', () => {
    const before = 'import os\nprint(1)\n';
    const after = 'import os\n\nprint(1)\n';
    const caret = mapCaretAcrossFormat(before, after, midOfLine(before, 2));
    expect(caret).toBe(after.indexOf('print(1)'));
  });

  it('lands on the first character, past the indentation', () => {
    const before = 'def f():\n  return   1\n';
    const after = 'def f():\n    return 1\n';
    const caret = mapCaretAcrossFormat(before, after, midOfLine(before, 2));
    expect(caret).toBe(after.indexOf('return 1'));
  });

  it('disambiguates repeated identical statements by ordinal', () => {
    const before = 'print(1)\nprint(2)\nprint(1)\n';
    const after = 'print(1)\n\nprint(2)\n\nprint(1)\n';
    const caret = mapCaretAcrossFormat(before, after, midOfLine(before, 3));
    expect(caret).toBe(after.lastIndexOf('print(1)'));
  });

  it('is a no-op position when nothing changed', () => {
    const text = 'x = 1\ny = 2\n';
    expect(mapCaretAcrossFormat(text, text, midOfLine(text, 2))).toBe(text.indexOf('y = 2'));
  });

  it('falls back to the same line index when the statement vanished', () => {
    const before = 'a = 1\nweird ==== stuff\nc = 3\n';
    const after = 'a = 1\nb = 2\nc = 3\n';
    expect(mapCaretAcrossFormat(before, after, midOfLine(before, 2))).toBe(after.indexOf('b = 2'));
  });

  it('handles a caret on a blank line without throwing', () => {
    const before = 'a = 1\n\nc = 3\n';
    const after = 'a = 1\n\nc = 3\n';
    expect(mapCaretAcrossFormat(before, after, 6)).toBe(6);
  });

  it('clamps a caret past the end of the document', () => {
    const before = 'a=1\n';
    const after = 'a = 1\n';
    expect(mapCaretAcrossFormat(before, after, 9999)).toBeLessThanOrEqual(after.length);
  });
});
