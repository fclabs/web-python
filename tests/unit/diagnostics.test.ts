import { describe, expect, it } from 'vitest';
import {
  SYNTAX_ERROR_CODE,
  formatDiagnosticEntry,
  formatDiagnosticTooltip,
  mapRuffDiagnostic,
  mapRuffDiagnostics,
  severityFor,
  sortDiagnostics,
  type Diagnostic,
  type RuffDiagnostic,
} from '../../src/lint/diagnostics';

const raw = (over: Partial<RuffDiagnostic> = {}): RuffDiagnostic => ({
  code: 'F401',
  message: '`os` imported but unused',
  start_location: { row: 1, column: 8 },
  end_location: { row: 1, column: 10 },
  ...over,
});

const diag = (over: Partial<Diagnostic> = {}): Diagnostic => ({
  code: 'F401',
  message: '`os` imported but unused',
  severity: 'warning',
  start: { line: 1, column: 8 },
  end: { line: 1, column: 10 },
  ...over,
});

describe('mapRuffDiagnostic (Data & Interfaces: Diagnostic)', () => {
  it('carries code, message and the exact 1-based source range', () => {
    expect(mapRuffDiagnostic(raw())).toEqual(diag());
  });

  it('names a code-less report as a syntax error (FR-041)', () => {
    const mapped = mapRuffDiagnostic(raw({ code: null, message: 'unexpected EOF while parsing' }));
    expect(mapped.code).toBe(SYNTAX_ERROR_CODE);
    expect(mapped.severity).toBe('error');
  });

  it('strips a trailing period, which the spec’s shape forbids', () => {
    expect(mapRuffDiagnostic(raw({ message: 'Something is wrong.' })).message).toBe(
      'Something is wrong',
    );
  });

  it('clamps out-of-range positions to line 1, column 1', () => {
    const mapped = mapRuffDiagnostic(
      raw({ start_location: { row: 0, column: 0 }, end_location: { row: -3, column: 0 } }),
    );
    expect(mapped.start).toEqual({ line: 1, column: 1 });
    expect(mapped.end).toEqual({ line: 1, column: 1 });
  });
});

describe('severityFor (FR-041, VC-061)', () => {
  it('treats parse failures as errors', () => {
    expect(severityFor(SYNTAX_ERROR_CODE)).toBe('error');
  });

  it('treats undefined names as errors, since they cannot exist at run time', () => {
    expect(severityFor('F821')).toBe('error');
    expect(severityFor('F822')).toBe('error');
  });

  it('treats Ruff’s E9 family as errors', () => {
    expect(severityFor('E902')).toBe('error');
    expect(severityFor('E999')).toBe('error');
  });

  it('treats style and hygiene rules as warnings', () => {
    expect(severityFor('F401')).toBe('warning');
    expect(severityFor('E501')).toBe('warning');
    expect(severityFor('E711')).toBe('warning');
  });
});

describe('sortDiagnostics (FR-038)', () => {
  it('orders by line, then by column', () => {
    const sorted = sortDiagnostics([
      diag({ code: 'C', start: { line: 4, column: 1 }, end: { line: 4, column: 2 } }),
      diag({ code: 'B', start: { line: 1, column: 9 }, end: { line: 1, column: 10 } }),
      diag({ code: 'A', start: { line: 1, column: 2 }, end: { line: 1, column: 3 } }),
    ]);
    expect(sorted.map((d) => d.code)).toEqual(['A', 'B', 'C']);
  });

  it('does not mutate its input', () => {
    const input = [
      diag({ code: 'B', start: { line: 4, column: 1 }, end: { line: 4, column: 2 } }),
      diag({ code: 'A', start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }),
    ];
    sortDiagnostics(input);
    expect(input.map((d) => d.code)).toEqual(['B', 'A']);
  });
});

describe('mapRuffDiagnostics (FR-035)', () => {
  it('maps and orders a whole pass', () => {
    const mapped = mapRuffDiagnostics([
      raw({ code: 'F821', start_location: { row: 4, column: 7 }, end_location: { row: 4, column: 9 } }),
      raw(),
    ]);
    expect(mapped.map((d) => [d.code, d.severity, d.start.line])).toEqual([
      ['F401', 'warning', 1],
      ['F821', 'error', 4],
    ]);
  });
});

describe('rendering (FR-037, FR-038)', () => {
  it('formats a panel entry as line:col · code · message', () => {
    expect(
      formatDiagnosticEntry(
        diag({
          code: 'F821',
          message: "Undefined name 'foo'",
          severity: 'error',
          start: { line: 12, column: 5 },
          end: { line: 12, column: 8 },
        }),
      ),
    ).toBe("12:5 · F821 · Undefined name 'foo'");
  });

  it('formats a tooltip as code · message', () => {
    expect(
      formatDiagnosticTooltip(diag({ code: 'F821', message: "Undefined name 'foo'" })),
    ).toBe("F821 · Undefined name 'foo'");
  });
});
