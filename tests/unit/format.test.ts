import { describe, expect, it } from 'vitest';
import {
  NOT_ISOLATED_BANNER,
  PROGRAM_ERRORED,
  RUNTIME_FAILED,
  STDERR_PREFIX,
  formatFinished,
  formatLoading,
  formatReady,
  formatRunSeparator,
} from '../../src/format';

describe('formatRunSeparator (FR-018)', () => {
  it('renders a 24-hour local clock between the box-drawing rules', () => {
    expect(formatRunSeparator('exercise.py', new Date(2026, 8, 1, 14, 5, 9))).toBe(
      '─── Running exercise.py at 14:05:09 ───',
    );
  });

  it('never falls back to a 12-hour clock', () => {
    expect(formatRunSeparator('main.py', new Date(2026, 8, 1, 0, 0, 0))).toBe(
      '─── Running main.py at 00:00:00 ───',
    );
    expect(formatRunSeparator('main.py', new Date(2026, 8, 1, 23, 59, 59))).toBe(
      '─── Running main.py at 23:59:59 ───',
    );
  });
});

describe('formatFinished (FR-022)', () => {
  it('reports wall-clock seconds to exactly two decimals', () => {
    expect(formatFinished(0)).toBe('Program finished in 0.00 s');
    expect(formatFinished(1234)).toBe('Program finished in 1.23 s');
    expect(formatFinished(1235)).toBe('Program finished in 1.24 s');
    expect(formatFinished(60_000)).toBe('Program finished in 60.00 s');
  });
});

describe('formatReady (FR-013)', () => {
  it('names the Python version exactly once', () => {
    expect(formatReady('3.13.2')).toBe('Python 3.13.2 ready');
  });
});

describe('formatLoading (FR-012, FR-065)', () => {
  it('renders an integer percentage', () => {
    expect(formatLoading(0)).toBe('Loading Python… 0%');
    expect(formatLoading(41.6)).toBe('Loading Python… 42%');
    expect(formatLoading(100)).toBe('Loading Python… 100%');
  });

  it('clamps out-of-range values', () => {
    expect(formatLoading(-5)).toBe('Loading Python… 0%');
    expect(formatLoading(140)).toBe('Loading Python… 100%');
  });
});

describe('fixed strings quoted by the spec', () => {
  it('match the requirement text byte for byte', () => {
    expect(PROGRAM_ERRORED).toBe('Program exited with an error.');
    expect(RUNTIME_FAILED).toBe(
      'Python runtime failed to load. Check your connection and reload the page.',
    );
    expect(NOT_ISOLATED_BANNER).toBe(
      'This page must be served with cross-origin isolation enabled (see Deployment). Python cannot run here.',
    );
    expect(STDERR_PREFIX).toBe('[stderr] ');
  });
});
