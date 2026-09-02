/**
 * VC-306 (data half) and VC-325 — the compiled character set.
 *
 * `src/symbols.ts` is a transcription of spec-03's *Character set* table, and
 * the table is normative (FR-305, BR-302). These assertions restate the table
 * independently of the module, so a typo in either is a failure rather than a
 * silent agreement.
 */
import { describe, expect, it } from 'vitest';
import { SYMBOLS, SYMBOL_GROUPS } from '../../src/symbols';

/** The 29 rows exactly as the spec's table lists them, in table order. */
const TABLE: [value: string, glyph: string, name: string, group: string][] = [
  ['"', '"', 'Double quote', 'Quotes'],
  ["'", "'", 'Single quote', 'Quotes'],
  ['(', '(', 'Left parenthesis', 'Brackets'],
  [')', ')', 'Right parenthesis', 'Brackets'],
  ['[', '[', 'Left square bracket', 'Brackets'],
  [']', ']', 'Right square bracket', 'Brackets'],
  ['{', '{', 'Left brace', 'Brackets'],
  ['}', '}', 'Right brace', 'Brackets'],
  ['+', '+', 'Plus', 'Operators'],
  ['-', '-', 'Minus', 'Operators'],
  ['*', '*', 'Asterisk', 'Operators'],
  ['/', '/', 'Slash', 'Operators'],
  ['//', '//', 'Floor division', 'Operators'],
  ['%', '%', 'Percent', 'Operators'],
  ['**', '**', 'Power', 'Operators'],
  ['==', '==', 'Equal to', 'Operators'],
  ['!=', '!=', 'Not equal to', 'Operators'],
  ['<', '<', 'Less than', 'Operators'],
  ['>', '>', 'Greater than', 'Operators'],
  ['<=', '<=', 'Less than or equal to', 'Operators'],
  ['>=', '>=', 'Greater than or equal to', 'Operators'],
  [':', ':', 'Colon', 'Punctuation'],
  [',', ',', 'Comma', 'Punctuation'],
  ['.', '.', 'Period', 'Punctuation'],
  ['#', '#', 'Hash', 'Punctuation'],
  ['_', '_', 'Underscore', 'Punctuation'],
  ['\\', '\\', 'Backslash', 'Punctuation'],
  ['|', '|', 'Pipe', 'Punctuation'],
  ['...', '...', 'Ellipsis', 'Ellipsis'],
];

describe('VC-306 (FR-305): the character set is the spec table', () => {
  it('has exactly 29 rows, in table order, field for field', () => {
    expect(SYMBOLS).toHaveLength(29);
    expect(SYMBOLS.map((row) => [row.value, row.glyph, row.name, row.group])).toEqual(TABLE);
  });

  it('names the five group headings in order', () => {
    expect(SYMBOL_GROUPS).toEqual(['Quotes', 'Brackets', 'Operators', 'Punctuation', 'Ellipsis']);
  });

  it('lists the rows of each group contiguously, in heading order', () => {
    const order = SYMBOLS.map((row) => SYMBOL_GROUPS.indexOf(row.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(SYMBOL_GROUPS.length);
  });

  it('carries no whitespace and no empty value', () => {
    for (const row of SYMBOLS) {
      expect(row.value.length, `value of ${row.name}`).toBeGreaterThan(0);
      expect(row.value, `value of ${row.name}`).not.toMatch(/\s/);
      expect(row.glyph.length, `glyph of ${row.name}`).toBeGreaterThan(0);
      expect(row.name.trim(), `name of ${row.name}`).toBe(row.name);
    }
  });

  it('spells row 28 as U+007C and row 29 as three full stops, not U+2026', () => {
    const pipe = SYMBOLS[27]!;
    expect(pipe.name).toBe('Pipe');
    expect([...pipe.value].map((c) => c.codePointAt(0))).toEqual([0x7c]);

    const ellipsis = SYMBOLS[28]!;
    expect(ellipsis.name).toBe('Ellipsis');
    expect([...ellipsis.value].map((c) => c.codePointAt(0))).toEqual([0x2e, 0x2e, 0x2e]);
    expect(ellipsis.value).not.toContain('…');
    expect(ellipsis.glyph).not.toContain('…');
  });
});

describe('VC-325 (BR-302): no Python look-alikes', () => {
  /** The code points BR-302 forbids by name. */
  const FORBIDDEN = [0x2018, 0x2019, 0x201c, 0x201d, 0x2264, 0x2265, 0x2260, 0x00d7, 0x00f7, 0xff08, 0xff09];

  it('contains none of the forbidden code points and nothing above U+1F000', () => {
    const points = SYMBOLS.flatMap((row) => [...row.value, ...row.glyph]).map(
      (c) => c.codePointAt(0)!,
    );
    for (const bad of FORBIDDEN) expect(points).not.toContain(bad);
    expect(points.filter((p) => p >= 0x1f000)).toEqual([]);
  });

  it('uses only printable ASCII for every value and glyph', () => {
    for (const row of SYMBOLS) {
      expect(row.value, `value of ${row.name}`).toMatch(/^[\x21-\x7e]+$/);
      expect(row.glyph, `glyph of ${row.name}`).toMatch(/^[\x21-\x7e]+$/);
    }
  });
});
