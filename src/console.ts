import {
  ConsoleModel,
  EARLIER_TRUNCATED,
  WriteTruncator,
  type Segment,
} from './console-buffer';
import { STDERR_PREFIX } from './format';

/** Distance from the bottom, in pixels, still counted as "at the bottom". */
const BOTTOM_EPSILON = 2;

const schedule: (callback: () => void) => number =
  typeof requestAnimationFrame === 'function'
    ? (callback) => requestAnimationFrame(() => callback())
    : (callback) => setTimeout(callback, 16) as unknown as number;

const unschedule: (handle: number) => void =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;

/**
 * The on-page console (FR-018 – FR-022, FR-026 – FR-028, FR-056).
 *
 * Chunks are appended as inline spans inside a `white-space: pre` region, so
 * the program's exact characters, line breaks and whitespace survive
 * unchanged (FR-019).
 *
 * Writes never touch the DOM: they land in the pure `ConsoleModel`, which caps
 * retention at 5 000 lines (FR-027), and one animation frame later the view
 * mirrors whatever the model then holds. A program printing far faster than
 * the display refreshes therefore costs one paint per frame instead of one per
 * line, which is what keeps the main thread under NFR-009's 100 ms.
 */
export class ConsoleView {
  private readonly model = new ConsoleModel();
  /** FR-056: one cap per stream, since each builds its own lines. */
  private readonly stdoutCap = new WriteTruncator();
  private readonly stderrCap = new WriteTruncator();

  /** Rendered span per segment serial, in DOM order. */
  private readonly nodes = new Map<number, { node: HTMLElement; text: string }>();
  private markerNode: HTMLElement | null = null;
  private frame: number | null = null;

  /** FR-028: follow new output only while the visitor is at the bottom. */
  private pinned = true;

  constructor(private readonly host: HTMLElement) {
    host.addEventListener('scroll', () => {
      const distance = host.scrollHeight - host.scrollTop - host.clientHeight;
      this.pinned = distance <= BOTTOM_EPSILON;
    });
  }

  /** A chunk of the program's stdout (FR-019). */
  stdout(text: string): void {
    this.write('console-stdout', this.stdoutCap.accept(text));
  }

  /**
   * A chunk of the program's stderr (FR-020): the literal `[stderr] ` prefix
   * immediately before the chunk text, plus a distinct colour.
   */
  stderr(text: string): void {
    this.write('console-stderr', STDERR_PREFIX + this.stderrCap.accept(text));
  }

  /**
   * FR-030: the prompt of `input(prompt)`, rendered from the `stdinRequest`
   * message exactly once. It is deliberately not part of the stdout stream and
   * ends no line, so the echoed answer lands beside it as in a terminal.
   */
  prompt(text: string): void {
    this.write('console-prompt', text);
  }

  /** FR-031 / FR-062: the visitor's submitted line, styled as input. */
  input(text: string): void {
    this.write('console-input', text.endsWith('\n') ? text : `${text}\n`);
  }

  /** A page-generated line: run separator, ready line, termination notice. */
  meta(text: string): void {
    this.line('console-meta', text);
  }

  /** An uncaught-exception traceback and its trailing notice (FR-021). */
  errorText(text: string): void {
    this.line('console-error', text);
  }

  /**
   * The run is over: a line the program left unterminated after busting the
   * per-write cap still owes its marker (FR-056).
   */
  endRun(): void {
    const owedOut = this.stdoutCap.end();
    if (owedOut !== '') this.write('console-stdout', `${owedOut}\n`);
    const owedErr = this.stderrCap.end();
    if (owedErr !== '') this.write('console-stderr', `${owedErr}\n`);
  }

  /** FR-026: all console content is removed; the editor is not touched. */
  clear(): void {
    if (this.frame !== null) {
      unschedule(this.frame);
      this.frame = null;
    }
    this.model.clear();
    this.stdoutCap.reset();
    this.stderrCap.reset();
    this.nodes.clear();
    this.markerNode = null;
    this.pinned = true;
    this.host.replaceChildren();
  }

  /** The console's full text, used by the verification suite. */
  get text(): string {
    this.paint();
    return this.host.textContent ?? '';
  }

  /** Render everything pending right now, instead of on the next frame. */
  flush(): void {
    this.paint();
  }

  /** Append `text` on a line of its own. */
  private line(cls: string, text: string): void {
    if (!this.model.endsWithNewline) this.write(cls, '\n');
    this.write(cls, text.endsWith('\n') ? text : `${text}\n`);
  }

  private write(cls: string, text: string): void {
    if (text === '') return;
    this.model.append(cls, text);
    if (this.frame === null) {
      this.frame = schedule(() => {
        this.frame = null;
        this.paint();
      });
    }
  }

  /** Mirror the model into the DOM, then honour FR-028's scroll rules. */
  private paint(): void {
    if (this.frame !== null) {
      unschedule(this.frame);
      this.frame = null;
    }
    const pinned = this.pinned;
    const heightBefore = pinned ? 0 : this.host.scrollHeight;

    this.syncMarker();
    this.dropRetiredNodes();
    this.syncSegments();

    if (pinned) {
      // FR-028: already at the bottom, so stay there.
      this.host.scrollTop = this.host.scrollHeight;
    } else {
      // FR-028: the visitor scrolled up — new output, and the dropping of old
      // output above it, must leave the viewport exactly where they put it.
      const shrunkBy = heightBefore - this.host.scrollHeight;
      if (shrunkBy > 0) this.host.scrollTop = Math.max(0, this.host.scrollTop - shrunkBy);
    }
  }

  /** FR-027: the marker sits at the top of the retained region. */
  private syncMarker(): void {
    if (!this.model.truncated || this.markerNode !== null) return;
    const node = document.createElement('span');
    node.className = 'console-truncated';
    node.textContent = `${EARLIER_TRUNCATED}\n`;
    this.host.prepend(node);
    this.markerNode = node;
  }

  /** Remove the spans whose segments the retention cap has dropped. */
  private dropRetiredNodes(): void {
    const first = this.model.segments[0]?.serial ?? Number.MAX_SAFE_INTEGER;
    for (const [serial, entry] of this.nodes) {
      if (serial >= first) break; // insertion order is serial order
      entry.node.remove();
      this.nodes.delete(serial);
    }
  }

  /** Create or update one span per retained segment. */
  private syncSegments(): void {
    for (const segment of this.model.segments) {
      const entry = this.nodes.get(segment.serial);
      if (entry === undefined) {
        this.nodes.set(segment.serial, { node: this.createNode(segment), text: segment.text });
      } else if (entry.text !== segment.text) {
        entry.node.textContent = segment.text;
        entry.text = segment.text;
      }
    }
  }

  private createNode(segment: Segment): HTMLElement {
    const node = document.createElement('span');
    node.className = segment.cls;
    node.textContent = segment.text;
    this.host.append(node);
    return node;
  }
}
