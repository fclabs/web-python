import { describe, expect, it } from 'vitest';
import { StdinStream, type StdinMode } from '../../src/stdin-stream';

/**
 * The stdin-stream state machine, exercised without a browser: the blocking
 * request is replaced by a scripted queue, so buffering, EOF and partial
 * `read(n)` are checked purely (spec: *stdin channel*, FR-029 – FR-034,
 * FR-060 – FR-062).
 *
 * Every entry is what the main thread would write into the channel: a line
 * with the `\n` it appends (FR-031), or `null` for Send EOF (FR-034).
 */
function scripted(submissions: (string | null)[]): {
  stream: StdinStream;
  requests: { mode: StdinMode; prompt: string }[];
} {
  const requests: { mode: StdinMode; prompt: string }[] = [];
  const queue = [...submissions];
  const stream = new StdinStream((mode, prompt) => {
    requests.push({ mode, prompt });
    if (queue.length === 0) throw new Error('the read blocked with nothing left to submit');
    return queue.shift() ?? null;
  });
  return { stream, requests };
}

describe('readline() / input() — one line or EOF (FR-029, FR-031)', () => {
  it('returns the line including its trailing newline', () => {
    const { stream, requests } = scripted(['Ana\n']);
    expect(stream.readline()).toBe('Ana\n');
    expect(requests).toEqual([{ mode: 'line', prompt: '' }]);
  });

  it('returns an empty line as just the newline, so input() yields ""', () => {
    const { stream } = scripted(['\n']);
    expect(stream.readline()).toBe('\n');
  });

  it('carries the prompt on the request and never repeats it (FR-030)', () => {
    const { stream, requests } = scripted(['Ana\n']);
    stream.readline('Name: ');
    expect(requests).toEqual([{ mode: 'line', prompt: 'Name: ' }]);
  });

  it("returns '' on EOF before a line, which is what makes input() raise EOFError", () => {
    const { stream } = scripted([null]);
    expect(stream.readline()).toBe('');
  });

  it('blocks once per line across several reads (FR-057)', () => {
    const { stream, requests } = scripted(['2\n', '3\n']);
    expect(stream.readline()).toBe('2\n');
    expect(stream.readline()).toBe('3\n');
    expect(requests).toHaveLength(2);
  });

  it('serves later lines from the buffer without blocking again', () => {
    const { stream, requests } = scripted(['a\nb\n']);
    expect(stream.readline()).toBe('a\n');
    expect(stream.readline()).toBe('b\n');
    expect(requests).toHaveLength(1);
  });

  it('honours a size limit and leaves the remainder buffered', () => {
    const { stream, requests } = scripted(['abcdef\n']);
    expect(stream.readline('', 3)).toBe('abc');
    expect(stream.readline()).toBe('def\n');
    expect(requests).toHaveLength(1);
  });

  it('latches EOF: every later read returns immediately', () => {
    const { stream, requests } = scripted([null]);
    expect(stream.readline()).toBe('');
    expect(stream.readline()).toBe('');
    expect(stream.read()).toBe('');
    expect(requests).toHaveLength(1);
    expect(stream.atEof).toBe(true);
  });
});

describe('read() — everything until EOF (FR-060)', () => {
  it('concatenates the submitted lines and returns them on EOF', () => {
    const { stream, requests } = scripted(['line1\n', 'line2\n', null]);
    expect(stream.read()).toBe('line1\nline2\n');
    expect(requests.map((r) => r.mode)).toEqual(['stream', 'stream', 'stream']);
  });

  it("returns '' on an immediate EOF, without raising (FR-034)", () => {
    const { stream } = scripted([null]);
    expect(stream.read()).toBe('');
  });
});

describe('read(n) — n characters or EOF (FR-061)', () => {
  it('returns exactly n characters and buffers the rest', () => {
    const { stream, requests } = scripted(['abcdef\n']);
    expect(stream.read(3)).toBe('abc');
    expect(requests).toHaveLength(1);
    expect(stream.readline()).toBe('def\n');
  });

  it('keeps blocking across submissions until n characters are buffered', () => {
    const { stream, requests } = scripted(['hi\n', 'abc\n']);
    expect(stream.read(5)).toBe('hi\nab');
    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.mode === 'stream')).toBe(true);
  });

  it('returns the partial buffer when EOF arrives first (FR-034)', () => {
    const { stream } = scripted(['hi\n', null]);
    expect(stream.read(10)).toBe('hi\n');
  });

  it('returns nothing and does not block for read(0)', () => {
    const { stream, requests } = scripted([]);
    expect(stream.read(0)).toBe('');
    expect(requests).toHaveLength(0);
  });

  it('counts Unicode code points, not UTF-16 units', () => {
    const { stream } = scripted(['🐍🐍🐍\n']);
    expect(stream.read(2)).toBe('🐍🐍');
    expect(stream.read(1)).toBe('🐍');
  });
});

describe('mixing the APIs, terminal-style', () => {
  it('lets a line read consume what a partial read(n) left behind', () => {
    const { stream, requests } = scripted(['abcdef\n', 'next\n']);
    expect(stream.read(2)).toBe('ab');
    expect(stream.readline()).toBe('cdef\n');
    expect(stream.readline()).toBe('next\n');
    expect(requests).toHaveLength(2);
  });

  it('drops buffered characters and the EOF latch on reset (BR-004)', () => {
    const { stream } = scripted(['abc\n', null, 'later\n']);
    expect(stream.read(1)).toBe('a');
    expect(stream.read()).toBe('bc\n');
    expect(stream.atEof).toBe(true);

    stream.reset();
    expect(stream.atEof).toBe(false);
    expect(stream.readline()).toBe('later\n');
  });
});
