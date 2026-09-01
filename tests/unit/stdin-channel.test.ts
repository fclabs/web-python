import { describe, expect, it } from 'vitest';
import {
  CONTROL_EMPTY,
  CONTROL_FILLED,
  STDIN_HEADER_BYTES,
  stdinCapacity,
  takeSubmission,
  writeSubmission,
} from '../../src/stdin-channel';
import { STDIN_BUFFER_BYTES, STDIN_MAX_LINE } from '../../src/protocol';

const channel = (): SharedArrayBuffer => new SharedArrayBuffer(STDIN_BUFFER_BYTES);
const control = (buffer: SharedArrayBuffer): number => new Int32Array(buffer, 0, 4)[0]!;

/**
 * The `SharedArrayBuffer` stdin channel (spec: *stdin channel*, BR-002),
 * checked without the blocking half: `writeSubmission` is what the main thread
 * does before `Atomics.notify`, `takeSubmission` is what the parked worker
 * does when it wakes.
 */
describe('stdin channel framing', () => {
  it('carries a submitted line to the worker and empties the channel', () => {
    const buffer = channel();
    expect(control(buffer)).toBe(CONTROL_EMPTY);

    expect(writeSubmission(buffer, 'Ana\n')).toBe(true);
    expect(control(buffer)).toBe(CONTROL_FILLED);

    expect(takeSubmission(buffer)).toBe('Ana\n');
    expect(control(buffer)).toBe(CONTROL_EMPTY);
  });

  it('reports nothing pending on an empty channel', () => {
    expect(takeSubmission(channel())).toBeUndefined();
  });

  it('carries EOF as null rather than as text (FR-034)', () => {
    const buffer = channel();
    expect(writeSubmission(buffer, null)).toBe(true);
    expect(takeSubmission(buffer)).toBeNull();
  });

  it('distinguishes an empty line from EOF (FR-031, VC-036)', () => {
    const buffer = channel();
    writeSubmission(buffer, '\n');
    expect(takeSubmission(buffer)).toBe('\n');
  });

  it('round-trips non-ASCII text byte for byte', () => {
    const buffer = channel();
    writeSubmission(buffer, '¿Cómo te llamás? 🐍\n');
    expect(takeSubmission(buffer)).toBe('¿Cómo te llamás? 🐍\n');
  });

  it('repeats for as many submissions as one read needs (FR-062)', () => {
    const buffer = channel();
    for (const line of ['hi\n', 'abc\n', 'more\n']) {
      writeSubmission(buffer, line);
      expect(takeSubmission(buffer)).toBe(line);
    }
  });

  it('fits a full-length line plus its newline (FR-066)', () => {
    const buffer = channel();
    // The worst case: 65 536 four-byte code points, plus the appended `\n`.
    expect(stdinCapacity(buffer)).toBeGreaterThanOrEqual(STDIN_MAX_LINE * 4 + 1);
    expect(STDIN_BUFFER_BYTES).toBe(STDIN_HEADER_BYTES + STDIN_MAX_LINE * 4 + 4);

    const line = `${'a'.repeat(STDIN_MAX_LINE)}\n`;
    expect(writeSubmission(buffer, line)).toBe(true);
    expect(takeSubmission(buffer)).toBe(line);
  });

  it('refuses a payload that does not fit and leaves the read blocked', () => {
    const small = new SharedArrayBuffer(STDIN_HEADER_BYTES + 4);
    expect(writeSubmission(small, 'far too long for this channel\n')).toBe(false);
    expect(control(small)).toBe(CONTROL_EMPTY);
    expect(takeSubmission(small)).toBeUndefined();
  });
});
