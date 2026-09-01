import { describe, expect, it } from 'vitest';
import { STDIN_BUFFER_BYTES, isCurrentRun, type FromWorker } from '../../src/protocol';

const stdout = (runId: number): FromWorker => ({ type: 'stdout', runId, text: 'x' });

describe('runId discipline (Data & Interfaces)', () => {
  it('keeps messages carrying the current runId', () => {
    expect(isCurrentRun(stdout(7), 7)).toBe(true);
  });

  it('discards messages from an earlier run, including a terminated worker', () => {
    expect(isCurrentRun(stdout(6), 7)).toBe(false);
    expect(isCurrentRun({ type: 'done', runId: 6, durationMs: 1 }, 7)).toBe(false);
    expect(isCurrentRun({ type: 'error', runId: 6, traceback: 't' }, 7)).toBe(false);
    expect(isCurrentRun({ type: 'stdinRequest', runId: 6, prompt: '', mode: 'line' }, 7)).toBe(false);
  });

  it('discards run-scoped messages while no run is in flight', () => {
    expect(isCurrentRun(stdout(1), null)).toBe(false);
  });

  it('always keeps the lifecycle messages, which carry no runId', () => {
    expect(isCurrentRun({ type: 'ready', pythonVersion: '3.13.2' }, null)).toBe(true);
    expect(isCurrentRun({ type: 'initError', message: 'boom' }, null)).toBe(true);
  });

  it('sizes the stdin buffer for a full-length line (FR-066)', () => {
    expect(STDIN_BUFFER_BYTES).toBeGreaterThan(65_536 * 4);
  });
});
