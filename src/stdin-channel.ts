/**
 * The `SharedArrayBuffer` stdin channel (spec: *stdin channel*, BR-002).
 *
 * One buffer is created per worker and handed over with `init`. On each
 * blocking read the worker parks on `Atomics.wait` on the control word; the
 * main thread writes a submitted line or an EOF flag and calls
 * `Atomics.notify`. The cycle repeats until the read completes, which is what
 * makes FR-057's arbitrarily-placed, unlimited reads work.
 *
 * Layout — a 4-slot `Int32Array` header followed by the UTF-8 payload:
 *
 * | Slot | Meaning                                            |
 * |------|----------------------------------------------------|
 * | 0    | control word: 0 = empty, 1 = a submission is waiting |
 * | 1    | 1 when the submission is EOF rather than text      |
 * | 2    | payload length in bytes                            |
 * | 3    | reserved                                           |
 */

const CONTROL = 0;
const EOF_FLAG = 1;
const LENGTH = 2;

/** Control-word values. */
export const CONTROL_EMPTY = 0;
export const CONTROL_FILLED = 1;

/** Bytes reserved for the header before the payload begins. */
export const STDIN_HEADER_BYTES = 16;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

const header = (buffer: SharedArrayBuffer): Int32Array =>
  new Int32Array(buffer, 0, STDIN_HEADER_BYTES / 4);

/** Payload bytes the buffer can carry. */
export function stdinCapacity(buffer: SharedArrayBuffer): number {
  return buffer.byteLength - STDIN_HEADER_BYTES;
}

/**
 * Main thread → worker: hand over one submission and wake the parked read.
 * `null` is EOF (FR-034). Returns false, writing nothing, when the encoded
 * text does not fit — the read then stays blocked.
 */
export function writeSubmission(buffer: SharedArrayBuffer, text: string | null): boolean {
  const head = header(buffer);
  if (text === null) {
    Atomics.store(head, EOF_FLAG, 1);
    Atomics.store(head, LENGTH, 0);
  } else {
    const bytes = encoder.encode(text);
    if (bytes.length > stdinCapacity(buffer)) return false;
    new Uint8Array(buffer, STDIN_HEADER_BYTES).set(bytes);
    Atomics.store(head, EOF_FLAG, 0);
    Atomics.store(head, LENGTH, bytes.length);
  }
  Atomics.store(head, CONTROL, CONTROL_FILLED);
  Atomics.notify(head, CONTROL);
  return true;
}

/**
 * Worker side, non-blocking: take the waiting submission, or `undefined` when
 * the channel is empty. `null` means EOF.
 */
export function takeSubmission(buffer: SharedArrayBuffer): string | null | undefined {
  const head = header(buffer);
  if (Atomics.load(head, CONTROL) !== CONTROL_FILLED) return undefined;
  const isEof = Atomics.load(head, EOF_FLAG) === 1;
  const length = Atomics.load(head, LENGTH);
  const text = isEof
    ? null
    : decoder.decode(new Uint8Array(buffer, STDIN_HEADER_BYTES, length).slice());
  // Consumed: the channel is ready for the next submission of this read.
  Atomics.store(head, CONTROL, CONTROL_EMPTY);
  return text;
}

/**
 * Worker side: park the thread until the main thread submits. This is the
 * suspend of FR-029 — the interpreter stops at exactly this point and nothing
 * else in the worker runs until a line or EOF arrives. The wait carries no
 * timeout: only the visitor ends a read (BR-008).
 */
export function waitForSubmission(buffer: SharedArrayBuffer): string | null {
  const head = header(buffer);
  while (Atomics.load(head, CONTROL) === CONTROL_EMPTY) {
    Atomics.wait(head, CONTROL, CONTROL_EMPTY);
  }
  return takeSubmission(buffer) ?? null;
}
