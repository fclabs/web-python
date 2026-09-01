/**
 * The stdin stream state machine (spec: *stdin channel*, FR-029, FR-031,
 * FR-034, FR-060, FR-061, FR-062).
 *
 * This is the pure half of blocking stdin: it owns the buffered characters,
 * the EOF latch, and the CPython-correct return values of the consumption
 * table. Everything that actually blocks — `Atomics.wait`, `postMessage` —
 * lives behind the injected `StdinRequest`, so the semantics are exercisable
 * in Node without a browser.
 *
 * | API              | Blocks until                 | Returns                          |
 * |------------------|------------------------------|----------------------------------|
 * | `readline()`     | one line submitted or EOF    | line incl. `\n`; `''` on EOF     |
 * | `read()`         | EOF                          | all buffered characters          |
 * | `read(n)`        | `n` characters or EOF        | first `n`, or the partial buffer |
 *
 * `input()` is `readline()` plus CPython's own rules — `EOFError` on `''`,
 * and the trailing `\n` stripped — and lives in the worker's Python shim.
 */

/** Which stdin field behaviour the pending read implies (FR-031 vs FR-062). */
export type StdinMode = 'line' | 'stream';

/**
 * Blocks until the visitor submits a line or sends EOF. Returns the submitted
 * text — always ending in `\n`, as the main thread appends it — or `null` for
 * end of file.
 */
export type StdinRequest = (mode: StdinMode, prompt: string) => string | null;

export class StdinStream {
  /** Buffered characters, held as code points so `read(n)` counts as CPython does. */
  private buffer: string[] = [];

  /** Latched by the first EOF; every later read returns immediately. */
  private eof = false;

  constructor(private readonly request: StdinRequest) {}

  /** Start of a run: no characters, no EOF (BR-004). */
  reset(): void {
    this.buffer = [];
    this.eof = false;
  }

  /** True once EOF has been delivered for this run. */
  get atEof(): boolean {
    return this.eof;
  }

  /**
   * FR-029 / FR-031: block for one line or EOF. Returns the line including its
   * trailing `\n`, the partial buffer when EOF interrupts an unterminated
   * line, or `''` on EOF with nothing buffered.
   *
   * `limit` mirrors `io.TextIOBase.readline(size)`: a non-negative value caps
   * the returned characters and leaves the remainder buffered.
   */
  readline(prompt = '', limit = -1): string {
    let pending = prompt;
    while (!this.eof && !this.buffer.includes('\n')) {
      this.pull('line', pending);
      // FR-030: the prompt belongs to the read, not to each retry.
      pending = '';
    }
    const newline = this.buffer.indexOf('\n');
    let end = newline === -1 ? this.buffer.length : newline + 1;
    if (limit >= 0 && limit < end) end = limit;
    return this.take(end);
  }

  /**
   * FR-060 / FR-061: with `size < 0`, block until EOF and return everything
   * buffered; otherwise block until `size` characters are available or EOF
   * arrives, then return the first `size` characters or the partial buffer.
   */
  read(size = -1): string {
    if (size < 0) {
      while (!this.eof) this.pull('stream', '');
      return this.take(this.buffer.length);
    }
    while (!this.eof && this.buffer.length < size) this.pull('stream', '');
    return this.take(Math.min(size, this.buffer.length));
  }

  private pull(mode: StdinMode, prompt: string): void {
    const chunk = this.request(mode, prompt);
    if (chunk === null) {
      // FR-034: EOF closes the stream for every later read of this run.
      this.eof = true;
      return;
    }
    // A code-point-at-a-time append: `push(...chunk)` would blow the argument
    // limit on a full-length line (FR-066).
    for (const codePoint of chunk) this.buffer.push(codePoint);
  }

  private take(count: number): string {
    const taken = this.buffer.slice(0, count).join('');
    this.buffer = this.buffer.slice(count);
    return taken;
  }
}
