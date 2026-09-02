/**
 * The pane's character set (spec-03: Data & Interfaces → Character set).
 *
 * The *Character set* table is normative for all three fields; this module is
 * its transcription and nothing else may be rendered by a character button
 * (FR-305, FR-314, FR-315). Every entry is a Python 3 token or a punctuation
 * character that appears in Python 3 source — BR-302 forbids look-alikes such
 * as `≤`, `≠`, `×`, `÷` and the typographic quotes.
 */

/** The five group headings, in the order the pane renders them (FR-305). */
export const SYMBOL_GROUPS = ['Quotes', 'Brackets', 'Operators', 'Punctuation', 'Ellipsis'] as const;

export type SymbolGroup = (typeof SYMBOL_GROUPS)[number];

export interface SymbolRow {
  /** Exactly what FR-306 writes to the clipboard. */
  readonly value: string;
  /** The visible button label (FR-314). */
  readonly glyph: string;
  /** The accessible name (FR-314) and the native tooltip (FR-315). */
  readonly name: string;
  /** The heading this row is listed under (FR-305). */
  readonly group: SymbolGroup;
}

/**
 * The 29 rows, in *Character set* table order. Row 28's value is the single
 * character U+007C and row 29's is three ASCII full stops — never U+2026.
 */
export const SYMBOLS = [
  { value: '"', glyph: '"', name: 'Double quote', group: 'Quotes' },
  { value: "'", glyph: "'", name: 'Single quote', group: 'Quotes' },

  { value: '(', glyph: '(', name: 'Left parenthesis', group: 'Brackets' },
  { value: ')', glyph: ')', name: 'Right parenthesis', group: 'Brackets' },
  { value: '[', glyph: '[', name: 'Left square bracket', group: 'Brackets' },
  { value: ']', glyph: ']', name: 'Right square bracket', group: 'Brackets' },
  { value: '{', glyph: '{', name: 'Left brace', group: 'Brackets' },
  { value: '}', glyph: '}', name: 'Right brace', group: 'Brackets' },

  { value: '+', glyph: '+', name: 'Plus', group: 'Operators' },
  { value: '-', glyph: '-', name: 'Minus', group: 'Operators' },
  { value: '*', glyph: '*', name: 'Asterisk', group: 'Operators' },
  { value: '/', glyph: '/', name: 'Slash', group: 'Operators' },
  { value: '//', glyph: '//', name: 'Floor division', group: 'Operators' },
  { value: '%', glyph: '%', name: 'Percent', group: 'Operators' },
  { value: '**', glyph: '**', name: 'Power', group: 'Operators' },
  { value: '==', glyph: '==', name: 'Equal to', group: 'Operators' },
  { value: '!=', glyph: '!=', name: 'Not equal to', group: 'Operators' },
  { value: '<', glyph: '<', name: 'Less than', group: 'Operators' },
  { value: '>', glyph: '>', name: 'Greater than', group: 'Operators' },
  { value: '<=', glyph: '<=', name: 'Less than or equal to', group: 'Operators' },
  { value: '>=', glyph: '>=', name: 'Greater than or equal to', group: 'Operators' },

  { value: ':', glyph: ':', name: 'Colon', group: 'Punctuation' },
  { value: ',', glyph: ',', name: 'Comma', group: 'Punctuation' },
  { value: '.', glyph: '.', name: 'Period', group: 'Punctuation' },
  { value: '#', glyph: '#', name: 'Hash', group: 'Punctuation' },
  { value: '_', glyph: '_', name: 'Underscore', group: 'Punctuation' },
  { value: '\\', glyph: '\\', name: 'Backslash', group: 'Punctuation' },
  { value: '|', glyph: '|', name: 'Pipe', group: 'Punctuation' },

  { value: '...', glyph: '...', name: 'Ellipsis', group: 'Ellipsis' },
] as const satisfies readonly SymbolRow[];
