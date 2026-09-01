/**
 * Debounced autosave with a synchronous flush hook.
 *
 * FR-002: writes 500 ms after the last change.
 * FR-050: `flush()` writes any pending contents synchronously before returning.
 * FR-005: the failure callback fires at most once per page load.
 */
export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: string | null = null;
  private failureReported = false;

  constructor(
    private readonly write: (code: string) => boolean,
    private readonly onFailure: () => void,
    private readonly delayMs = 500,
  ) {}

  /** Record a change; the write happens after `delayMs` of quiet. */
  schedule(code: string): void {
    this.pending = code;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  /** Write pending contents right now, synchronously. Safe to call any time. */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending === null) return;
    const code = this.pending;
    this.pending = null;
    if (!this.write(code)) this.reportFailure();
  }

  /** True while a scheduled write has not yet been performed. */
  get hasPending(): boolean {
    return this.pending !== null;
  }

  private reportFailure(): void {
    if (this.failureReported) return;
    this.failureReported = true;
    this.onFailure();
  }
}
