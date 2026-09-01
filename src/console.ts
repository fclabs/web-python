import { STDERR_PREFIX } from './format';

/**
 * The on-page console (FR-018 – FR-022).
 *
 * Chunks are appended as inline spans inside a `white-space: pre` region, so
 * the program's exact characters, line breaks and whitespace survive
 * unchanged (FR-019). Retention limits and scroll behaviour are Iteration 5.
 */
export class ConsoleView {
  /** False while the last appended chunk left a partial line open. */
  private atLineStart = true;

  constructor(private readonly host: HTMLElement) {}

  /** A chunk of the program's stdout (FR-019). */
  stdout(text: string): void {
    this.append('console-stdout', text);
  }

  /**
   * A chunk of the program's stderr (FR-020): the literal `[stderr] ` prefix
   * immediately before the chunk text, plus a distinct colour.
   */
  stderr(text: string): void {
    this.append('console-stderr', STDERR_PREFIX + text);
  }

  /** A page-generated line: run separator, ready line, termination notice. */
  meta(text: string): void {
    this.line('console-meta', text);
  }

  /** An uncaught-exception traceback and its trailing notice (FR-021). */
  errorText(text: string): void {
    this.line('console-error', text);
  }

  /** FR-026 (wired up in Iteration 5). */
  clear(): void {
    this.host.replaceChildren();
    this.atLineStart = true;
  }

  /** The console's full text, used by the verification suite. */
  get text(): string {
    return this.host.textContent ?? '';
  }

  /** Append `text` on a line of its own. */
  private line(cls: string, text: string): void {
    if (!this.atLineStart) this.append(cls, '\n');
    this.append(cls, text.endsWith('\n') ? text : `${text}\n`);
  }

  private append(cls: string, text: string): void {
    if (text === '') return;
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    this.host.append(span);
    this.atLineStart = text.endsWith('\n');
    this.host.scrollTop = this.host.scrollHeight;
  }
}
