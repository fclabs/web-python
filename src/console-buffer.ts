/**
 * The console's retained text, modelled without any DOM (FR-027, FR-056).
 *
 * Keeping the retention ring and the per-write cap here — pure, synchronous
 * and Node-testable — lets the view stay a thin renderer that only mirrors
 * this model into spans on the next animation frame (NFR-009).
 */

/** FR-027: the console keeps at most this many lines. */
export const MAX_RETAINED_LINES = 5000;

/** FR-056: the most characters a single write may contribute to one line. */
export const MAX_WRITE_CHARS = 100_000;

/** FR-027: shown at the top of the retained region once lines were dropped. */
export const EARLIER_TRUNCATED = '… earlier output truncated …';

/** FR-056: follows the retained characters of an over-long write. */
export function formatLineTruncated(dropped: number): string {
  return `… line truncated (${dropped} characters dropped) …`;
}

/**
 * Appends coalesce into segments, but a segment is closed once it reaches
 * either bound, so the segment the renderer keeps rewriting stays small and
 * a frame's DOM work stays proportional to the frame's own output.
 */
const SEGMENT_MAX_CHARS = 8192;
const SEGMENT_MAX_LINES = 256;

/** One run of same-styled text. `serial` identifies it to the renderer. */
export interface Segment {
  readonly serial: number;
  readonly cls: string;
  text: string;
  lines: number;
}

function countNewlines(text: string): number {
  let count = 0;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) count++;
  return count;
}

/** Index just past the `n`-th `\n` of `text` (`n` ≥ 1, assumed present). */
function afterNthNewline(text: string, n: number): number {
  let index = -1;
  for (let i = 0; i < n; i++) index = text.indexOf('\n', index + 1);
  return index + 1;
}

/**
 * FR-056: caps one line's worth of output at 100 000 characters and inlines
 * the truncation marker, counting everything dropped after the cap.
 *
 * The cap is applied per line rather than per message so that it holds however
 * the runtime happens to chunk a single huge write across stream callbacks.
 */
export class WriteTruncator {
  private kept = 0;
  private dropped = 0;

  /** The text that should actually be rendered for this write. */
  accept(text: string): string {
    let out = '';
    let i = 0;
    while (i <= text.length) {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? text.length : nl;
      const chunk = text.slice(i, end);
      const room = Math.max(0, MAX_WRITE_CHARS - this.kept);
      const keep = chunk.length <= room ? chunk : chunk.slice(0, room);
      this.kept += keep.length;
      this.dropped += chunk.length - keep.length;
      out += keep;
      if (nl === -1) break;
      if (this.dropped > 0) out += formatLineTruncated(this.dropped);
      out += '\n';
      this.kept = 0;
      this.dropped = 0;
      i = nl + 1;
    }
    return out;
  }

  /**
   * The marker owed by a truncated line the program never terminated, emitted
   * when the run ends. Also resets the counter for the next run.
   */
  end(): string {
    const owed = this.dropped > 0 ? formatLineTruncated(this.dropped) : '';
    this.reset();
    return owed;
  }

  reset(): void {
    this.kept = 0;
    this.dropped = 0;
  }
}

/**
 * FR-027: a line ring. Text is appended at the end; once more than
 * `MAX_RETAINED_LINES` lines are held, the oldest are dropped and the model
 * reports that a truncation marker belongs at the top of what remains.
 */
export class ConsoleModel {
  private readonly parts: Segment[] = [];
  private nextSerial = 1;
  private lines = 0;
  private dropped = false;

  /** The retained segments, oldest first. */
  get segments(): readonly Segment[] {
    return this.parts;
  }

  /** True once any line has been dropped, i.e. the marker belongs on top. */
  get truncated(): boolean {
    return this.dropped;
  }

  /** Retained complete lines — a trailing partial line is not counted. */
  get lineCount(): number {
    return this.lines;
  }

  /** True when the next append would start on a line of its own. */
  get endsWithNewline(): boolean {
    const last = this.parts[this.parts.length - 1];
    return last === undefined || last.text.endsWith('\n');
  }

  /** Everything the console would show, marker included. */
  get text(): string {
    const body = this.parts.map((part) => part.text).join('');
    return this.dropped ? `${EARLIER_TRUNCATED}\n${body}` : body;
  }

  append(cls: string, text: string): void {
    if (text === '') return;
    let last = this.parts[this.parts.length - 1];
    if (
      last === undefined ||
      last.cls !== cls ||
      last.text.length >= SEGMENT_MAX_CHARS ||
      last.lines >= SEGMENT_MAX_LINES
    ) {
      last = { serial: this.nextSerial++, cls, text: '', lines: 0 };
      this.parts.push(last);
    }
    last.text += text;
    const added = countNewlines(text);
    last.lines += added;
    this.lines += added;
    this.trim();
  }

  /** FR-026: every trace of previous output is gone. */
  clear(): void {
    this.parts.length = 0;
    this.lines = 0;
    this.dropped = false;
  }

  private trim(): void {
    let excess = this.lines - MAX_RETAINED_LINES;
    while (excess > 0) {
      const first = this.parts[0];
      if (first === undefined) break;
      if (first.lines <= excess) {
        this.parts.shift();
        this.lines -= first.lines;
        excess -= first.lines;
      } else {
        const cut = afterNthNewline(first.text, excess);
        first.text = first.text.slice(cut);
        first.lines -= excess;
        this.lines -= excess;
        excess = 0;
      }
      this.dropped = true;
    }
  }
}
