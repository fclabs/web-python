/**
 * FR-035: lint on a 400 ms idle debounce, each pass fully replacing the
 * previous diagnostics.
 */
import type { Diagnostic } from './diagnostics';
import type { RuffEngine } from './ruff';

/** FR-035: the idle window after the last keystroke. */
export const LINT_DEBOUNCE_MS = 400;

export class Linter {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: string | null = null;

  constructor(
    private readonly engine: RuffEngine,
    private readonly onResult: (diagnostics: Diagnostic[]) => void,
    private readonly debounceMs: number = LINT_DEBOUNCE_MS,
  ) {}

  /** The buffer changed: lint it once the visitor stops typing. */
  schedule(code: string): void {
    this.pending = code;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const code = this.pending;
      this.pending = null;
      if (code !== null) this.lint(code);
    }, this.debounceMs);
  }

  /** Lint immediately, cancelling any scheduled pass. */
  lintNow(code: string): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
    this.lint(code);
  }

  private lint(code: string): void {
    let diagnostics: Diagnostic[];
    try {
      diagnostics = this.engine.check(code);
    } catch {
      // A rule that panicked must not take the page with it (BR-009); the
      // previous pass is simply replaced by nothing.
      diagnostics = [];
    }
    this.onResult(diagnostics);
  }
}
