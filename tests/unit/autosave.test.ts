import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosaver } from '../../src/autosave';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Autosaver (FR-002, FR-050, FR-005)', () => {
  it('writes once, 500 ms after the last change', () => {
    const write = vi.fn(() => true);
    const saver = new Autosaver(write, vi.fn());

    saver.schedule('a');
    vi.advanceTimersByTime(400);
    saver.schedule('ab');
    vi.advanceTimersByTime(400);
    expect(write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('ab');
  });

  it('flush() writes the pending contents synchronously and in full', () => {
    const write = vi.fn(() => true);
    const saver = new Autosaver(write, vi.fn());

    saver.schedule('x = 42');
    vi.advanceTimersByTime(100);
    expect(saver.hasPending).toBe(true);

    saver.flush();
    expect(write).toHaveBeenCalledWith('x = 42');
    expect(saver.hasPending).toBe(false);
  });

  it('flush() with nothing pending is a no-op', () => {
    const write = vi.fn(() => true);
    const saver = new Autosaver(write, vi.fn());
    saver.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it('does not write again after a flush when the debounce elapses', () => {
    const write = vi.fn(() => true);
    const saver = new Autosaver(write, vi.fn());
    saver.schedule('x');
    saver.flush();
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('reports a write failure exactly once per page load', () => {
    const onFailure = vi.fn();
    const saver = new Autosaver(() => false, onFailure);

    saver.schedule('a');
    vi.advanceTimersByTime(500);
    saver.schedule('b');
    vi.advanceTimersByTime(500);
    saver.schedule('c');
    saver.flush();

    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
