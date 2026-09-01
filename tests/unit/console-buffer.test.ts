import { describe, expect, it } from 'vitest';
import {
  ConsoleModel,
  EARLIER_TRUNCATED,
  MAX_RETAINED_LINES,
  MAX_WRITE_CHARS,
  WriteTruncator,
  formatLineTruncated,
} from '../../src/console-buffer';

/** The lines the model would show, marker included, trailing blank dropped. */
function lines(model: ConsoleModel): string[] {
  const text = model.text;
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  return body === '' ? [] : body.split('\n');
}

describe('ConsoleModel retention (FR-027)', () => {
  it('keeps everything while under the cap, with no marker', () => {
    const model = new ConsoleModel();
    for (let i = 0; i < 100; i++) model.append('console-stdout', `${i}\n`);
    expect(model.truncated).toBe(false);
    expect(model.lineCount).toBe(100);
    expect(lines(model)).toHaveLength(100);
  });

  it('keeps exactly the cap at the boundary', () => {
    const model = new ConsoleModel();
    for (let i = 0; i < MAX_RETAINED_LINES; i++) model.append('console-stdout', `${i}\n`);
    expect(model.truncated).toBe(false);
    expect(model.lineCount).toBe(MAX_RETAINED_LINES);
  });

  it('drops the oldest lines and marks the retained region', () => {
    const model = new ConsoleModel();
    for (let i = 0; i < 20_000; i++) model.append('console-stdout', `${i}\n`);

    expect(model.truncated).toBe(true);
    expect(model.lineCount).toBe(MAX_RETAINED_LINES);

    const shown = lines(model);
    // The marker heads the retained region (FR-027).
    expect(shown[0]).toBe(EARLIER_TRUNCATED);
    expect(shown).toHaveLength(MAX_RETAINED_LINES + 1);
    // The most recent 5 000 lines survive, oldest first, ending at 19999.
    expect(shown[1]).toBe(String(20_000 - MAX_RETAINED_LINES));
    expect(shown[shown.length - 1]).toBe('19999');
    expect(shown).not.toContain('0');
  });

  it('drops lines mid-segment when one write carries many of them', () => {
    const model = new ConsoleModel();
    const bulk = Array.from({ length: MAX_RETAINED_LINES + 10 }, (_, i) => `${i}\n`).join('');
    model.append('console-stdout', bulk);

    expect(model.lineCount).toBe(MAX_RETAINED_LINES);
    const shown = lines(model);
    expect(shown[0]).toBe(EARLIER_TRUNCATED);
    expect(shown[1]).toBe('10');
    expect(shown[shown.length - 1]).toBe(String(MAX_RETAINED_LINES + 9));
  });

  it('does not count an unterminated trailing line against the cap', () => {
    const model = new ConsoleModel();
    for (let i = 0; i < MAX_RETAINED_LINES; i++) model.append('console-stdout', `${i}\n`);
    model.append('console-stdout', 'partial');
    expect(model.truncated).toBe(false);
    expect(model.lineCount).toBe(MAX_RETAINED_LINES);
    expect(model.endsWithNewline).toBe(false);
  });

  it('keeps styles apart, coalescing only same-styled neighbours', () => {
    const model = new ConsoleModel();
    model.append('console-stdout', 'out');
    model.append('console-stdout', 'put\n');
    model.append('console-stderr', '[stderr] boom\n');
    expect(model.segments).toHaveLength(2);
    expect(model.text).toBe('output\n[stderr] boom\n');
  });

  it('forgets everything on clear, marker included (FR-026)', () => {
    const model = new ConsoleModel();
    for (let i = 0; i < 20_000; i++) model.append('console-stdout', `${i}\n`);
    model.clear();
    expect(model.text).toBe('');
    expect(model.truncated).toBe(false);
    expect(model.lineCount).toBe(0);
    expect(model.segments).toHaveLength(0);
  });
});

describe('WriteTruncator (FR-056)', () => {
  it('passes ordinary writes through untouched', () => {
    const cap = new WriteTruncator();
    expect(cap.accept('hello\nworld\n')).toBe('hello\nworld\n');
    expect(cap.end()).toBe('');
  });

  it('keeps the first 100 000 characters and counts every dropped one', () => {
    const cap = new WriteTruncator();
    const out = cap.accept(`${'x'.repeat(5_000_000)}\n`);

    const marker = formatLineTruncated(5_000_000 - MAX_WRITE_CHARS);
    expect(marker).toBe('… line truncated (4900000 characters dropped) …');
    expect(out).toBe(`${'x'.repeat(MAX_WRITE_CHARS)}${marker}\n`);
    expect(out.split('\n')[0]?.startsWith('x'.repeat(MAX_WRITE_CHARS))).toBe(true);
  });

  it('counts across the chunks one over-long line arrives in', () => {
    const cap = new WriteTruncator();
    let out = '';
    for (let i = 0; i < 10; i++) out += cap.accept('y'.repeat(60_000));
    out += cap.accept('\n');

    expect(out).toBe(`${'y'.repeat(MAX_WRITE_CHARS)}${formatLineTruncated(500_000)}\n`);
  });

  it('caps each line on its own', () => {
    const cap = new WriteTruncator();
    const out = cap.accept(`${'a'.repeat(100_010)}\nshort\n${'b'.repeat(100_005)}\n`);
    expect(out).toBe(
      `${'a'.repeat(MAX_WRITE_CHARS)}${formatLineTruncated(10)}\n` +
        'short\n' +
        `${'b'.repeat(MAX_WRITE_CHARS)}${formatLineTruncated(5)}\n`,
    );
  });

  it('leaves nothing owed when the line stops exactly at the cap', () => {
    const cap = new WriteTruncator();
    expect(cap.accept(`${'c'.repeat(MAX_WRITE_CHARS)}\n`)).toBe(`${'c'.repeat(MAX_WRITE_CHARS)}\n`);
    expect(cap.end()).toBe('');
  });

  it('owes the marker at the end of a run when the line never terminated', () => {
    const cap = new WriteTruncator();
    const out = cap.accept('d'.repeat(100_007));
    expect(out).toBe('d'.repeat(MAX_WRITE_CHARS));
    expect(cap.end()).toBe(formatLineTruncated(7));
    // ...and the counter starts clean for the next run.
    expect(cap.end()).toBe('');
  });
});
