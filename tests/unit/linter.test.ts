import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINT_DEBOUNCE_MS, Linter } from '../../src/lint/linter';
import type { Diagnostic } from '../../src/lint/diagnostics';
import type { RuffEngine } from '../../src/lint/ruff';

const diagnostic = (code: string): Diagnostic => ({
  code,
  message: code,
  severity: 'warning',
  start: { line: 1, column: 1 },
  end: { line: 1, column: 2 },
});

function fakeEngine(check: (code: string) => Diagnostic[]): RuffEngine {
  return { check, format: (code) => code, version: 'test' };
}

describe('Linter (FR-035)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lints 400 ms after the last change, not before', () => {
    const results: Diagnostic[][] = [];
    const linter = new Linter(
      fakeEngine((code) => [diagnostic(code)]),
      (d) => results.push(d),
    );

    linter.schedule('a');
    vi.advanceTimersByTime(LINT_DEBOUNCE_MS - 1);
    expect(results).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(results).toHaveLength(1);
    expect(results[0][0].code).toBe('a');
  });

  it('runs once for a burst of changes, on the latest contents', () => {
    const results: Diagnostic[][] = [];
    const linter = new Linter(
      fakeEngine((code) => [diagnostic(code)]),
      (d) => results.push(d),
    );

    linter.schedule('a');
    vi.advanceTimersByTime(300);
    linter.schedule('b');
    vi.advanceTimersByTime(300);
    linter.schedule('c');
    vi.advanceTimersByTime(LINT_DEBOUNCE_MS);

    expect(results).toHaveLength(1);
    expect(results[0][0].code).toBe('c');
  });

  it('lintNow cancels the pending pass and reports immediately', () => {
    const results: Diagnostic[][] = [];
    const linter = new Linter(
      fakeEngine((code) => [diagnostic(code)]),
      (d) => results.push(d),
    );

    linter.schedule('a');
    linter.lintNow('b');
    expect(results).toHaveLength(1);
    expect(results[0][0].code).toBe('b');

    vi.advanceTimersByTime(LINT_DEBOUNCE_MS * 2);
    expect(results).toHaveLength(1);
  });

  it('reports an empty pass when a rule throws, rather than taking the page down (BR-009)', () => {
    const results: Diagnostic[][] = [];
    const linter = new Linter(
      fakeEngine(() => {
        throw new Error('rule panicked');
      }),
      (d) => results.push(d),
    );

    expect(() => linter.lintNow('x = 1')).not.toThrow();
    expect(results).toEqual([[]]);
  });
});
