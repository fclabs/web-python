/**
 * The vertical special-character pane (spec-03: FR-301 – FR-318).
 *
 * The pane is main-thread UI and nothing else. It never touches the editor
 * buffer, the CodeMirror undo history, the caret, the console, the stdin field
 * or the worker protocol (BR-301) — its only effects are the clipboard write
 * of FR-306, the feedback of FR-307 / FR-308 and its own open/closed state.
 *
 * Dismissal is deliberately narrow (FR-318): the pane closes from exactly two
 * code paths — the toggle and `Escape` from inside the pane. This module
 * registers no focus-loss listener, no outside-click listener and no pointer
 * listener of any kind, which is what makes "the pane survives everything
 * else" true by construction rather than by enumeration. A grep of this file
 * for those listener names is part of the criterion.
 */
import { writeClipboard } from './clipboard';
import { COPIED_MS, SYMBOL_COPY_FAILED, formatSymbolCopied } from './format';
import type { Notices } from './notices';
import { SYMBOLS, SYMBOL_GROUPS, type SymbolRow } from './symbols';

/**
 * FR-311's breakpoint, shared by the layout and by `aria-orientation`.
 * Mirrored by the single `@media (min-width: 700px)` block in
 * `src/styles.css`; the two must be changed together.
 */
export const WIDE_LAYOUT_QUERY = '(min-width: 700px)';

export interface SymbolPaneElements {
  /** The `Symbols` toolbar toggle (FR-301). Never inert — see `controls.ts`. */
  toggle: HTMLButtonElement;
  /** The `role="toolbar"` pane itself. */
  pane: HTMLElement;
  /**
   * The `role="status"` feedback region inside the pane. It stays empty until
   * FR-307's copy feedback lands.
   */
  status: HTMLElement;
  /** The existing notice strip, reused unchanged for FR-308. */
  notices: Notices;
}

/**
 * FR-308: put the document selection over exactly this button's glyph and
 * nothing else, so `Ctrl/Cmd+C` copies the character the visitor asked for.
 */
function selectGlyph(button: HTMLButtonElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(button);
  selection.removeAllRanges();
  selection.addRange(range);
}

export class SymbolPane {
  private readonly toggle: HTMLButtonElement;
  private readonly pane: HTMLElement;
  private readonly status: HTMLElement;
  private readonly notices: Notices;

  /** The 29 character buttons, in *Character set* order. */
  private readonly buttons: HTMLButtonElement[] = [];

  /** Which button currently holds the roving `tabindex="0"` (FR-309). */
  private rovingIndex = 0;

  /** The pending FR-307 revert, or null when no feedback is showing. */
  private revertTimer: ReturnType<typeof setTimeout> | null = null;

  /** The button currently carrying `data-state="copied"`, if any. */
  private copiedButton: HTMLButtonElement | null = null;

  /**
   * FR-316: monotonic id of the most recent activation. A write that resolves
   * after a newer activation — or after the pane closed — is discarded.
   */
  private activationId = 0;

  constructor(elements: SymbolPaneElements) {
    this.toggle = elements.toggle;
    this.pane = elements.pane;
    this.status = elements.status;
    this.status.textContent = '';
    this.notices = elements.notices;

    this.render();
    this.setRoving(0);

    // FR-302 / FR-303. A native button turns `Enter` and `Space` into a click,
    // so this one listener covers all three activation paths (VC-303).
    this.toggle.addEventListener('click', () => {
      if (this.isOpen) this.close();
      else this.open();
    });

    // FR-304: the pane's *only* other dismissal path.
    this.pane.addEventListener('keydown', (event) => this.onKeydown(event));

    // DOM contract: `aria-orientation` tracks the FR-311 breakpoint.
    const wide = window.matchMedia(WIDE_LAYOUT_QUERY);
    const applyOrientation = (): void => {
      this.pane.setAttribute('aria-orientation', wide.matches ? 'vertical' : 'horizontal');
    };
    applyOrientation();
    wide.addEventListener('change', applyOrientation);
  }

  /** Whether the pane is currently shown (FR-301, FR-318). */
  get isOpen(): boolean {
    return !this.pane.hidden;
  }

  /** FR-302: show the pane and move focus to its first character button. */
  open(): void {
    if (this.isOpen) return;
    this.pane.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
    this.setRoving(0);
    this.buttons[0]?.focus();
  }

  /** FR-303 / FR-304: hide the pane and return focus to the toggle. */
  close(): void {
    if (!this.isOpen) return;
    // FR-316: a write still in flight resolves into nothing.
    this.clearFeedback();
    this.pane.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.focus();
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    const from = this.buttons.indexOf(event.target as HTMLButtonElement);
    if (from < 0) return;

    const target = this.arrowTarget(event.key, from);
    // FR-309: a move with no target in that direction leaves focus where it
    // is — focus never wraps and never leaves the pane.
    if (target === null) return;
    event.preventDefault();
    if (target === from) return;
    this.setRoving(target);
    this.buttons[target]?.focus();
  }

  /**
   * FR-309's focus model, resolved against the grid the pane *currently*
   * renders: `ArrowRight`/`ArrowLeft` within the visual row,
   * `ArrowUp`/`ArrowDown` to the same column index of the adjacent row (or
   * that row's last button when it is shorter), `Home`/`End` to the ends.
   * Returns null when the key is not a navigation key.
   */
  private arrowTarget(key: string, from: number): number | null {
    if (key === 'Home') return 0;
    if (key === 'End') return this.buttons.length - 1;
    if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'ArrowUp' && key !== 'ArrowDown') {
      return null;
    }

    const rows = this.visualRows();
    const row = rows.findIndex((entries) => entries.includes(from));
    if (row < 0) return from;
    const column = rows[row]!.indexOf(from);

    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      const next = column + (key === 'ArrowRight' ? 1 : -1);
      return rows[row]![next] ?? from;
    }

    const adjacent = rows[row + (key === 'ArrowDown' ? 1 : -1)];
    if (!adjacent) return from;
    return adjacent[Math.min(column, adjacent.length - 1)] ?? from;
  }

  /**
   * The pane's *visual rows* — buttons grouped by rendered top edge, ordered
   * top to bottom, group headings taking no part (FR-309). Derived from the
   * live geometry at keystroke time, so it needs no knowledge of the CSS and
   * is correct at both FR-311 breakpoints and at any zoom level.
   */
  private visualRows(): number[][] {
    const rows: { top: number; entries: number[] }[] = [];
    this.buttons.forEach((button, index) => {
      const top = button.getBoundingClientRect().top;
      // Sub-pixel rounding means two buttons on one row can differ slightly.
      const row = rows.find((candidate) => Math.abs(candidate.top - top) <= 2);
      if (row) row.entries.push(index);
      else rows.push({ top, entries: [index] });
    });
    return rows.sort((a, b) => a.top - b.top).map((row) => row.entries);
  }

  /**
   * FR-306 – FR-308, FR-316. The clipboard write is the pane's *only* effect
   * outside its own feedback: no CodeMirror transaction, so no undo entry, no
   * autosave and no lint schedule (BR-301).
   */
  private activate(button: HTMLButtonElement): void {
    const value = button.dataset.value ?? '';
    const id = ++this.activationId;
    void (async () => {
      const ok = await writeClipboard(value);

      // FR-316: the pane closed, or a newer activation overtook this one —
      // either way this resolution produces no feedback at all.
      if (id !== this.activationId || !this.isOpen) return;

      // One owner of the feedback state, clearing before either path writes:
      // a second success restarts FR-307's window from zero, and a denial
      // after a recent success leaves no `Copied V` behind (FR-308).
      this.clearFeedback();

      if (ok) {
        this.status.textContent = formatSymbolCopied(value);
        button.dataset.state = 'copied';
        this.copiedButton = button;
        this.revertTimer = setTimeout(() => this.clearFeedback(), COPIED_MS);
      } else {
        // BR-303: the pane degrades alone — it stays open and navigable, and
        // the core write-run-read loop is untouched.
        this.notices.show(SYMBOL_COPY_FAILED);
        selectGlyph(button);
      }
    })();
  }

  /** The single writer of FR-307 / FR-308 feedback state. */
  private clearFeedback(): void {
    if (this.revertTimer !== null) {
      clearTimeout(this.revertTimer);
      this.revertTimer = null;
    }
    if (this.copiedButton) {
      delete this.copiedButton.dataset.state;
      this.copiedButton = null;
    }
    this.status.textContent = '';
  }

  /**
   * FR-305 / FR-314 / FR-315: one button per row, in table order, under the
   * five group headings. Rendered from {@link SYMBOLS} so the compiled
   * character set is the only source of what the pane can show (BR-302).
   */
  private render(): void {
    for (const group of SYMBOL_GROUPS) {
      const section = document.createElement('div');
      section.className = 'symbol-group';
      section.dataset.group = group;

      const heading = document.createElement('h2');
      heading.className = 'symbol-group-title';
      heading.textContent = group;
      section.append(heading);

      const items = document.createElement('div');
      items.className = 'symbol-items';
      for (const row of SYMBOLS.filter((entry) => entry.group === group)) {
        items.append(this.createButton(row));
      }
      section.append(items);
      this.pane.append(section);
    }
  }

  private createButton(row: SymbolRow): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'symbol';
    button.dataset.value = row.value;
    button.setAttribute('aria-label', row.name); // FR-314
    button.title = row.name; // FR-315
    button.textContent = row.glyph;
    button.tabIndex = -1; // BR-305; `setRoving` promotes exactly one to 0.
    // A native button turns `Enter` and `Space` into a click, so this one
    // listener is all three activation paths of FR-309.
    button.addEventListener('click', () => {
      this.setRoving(this.buttons.indexOf(button));
      this.activate(button);
    });
    this.buttons.push(button);
    return button;
  }

  /**
   * BR-305 / FR-309: exactly one button is in the tab order, so the pane
   * contributes a single tab stop however many characters it holds.
   */
  private setRoving(index: number): void {
    this.rovingIndex = Math.min(Math.max(index, 0), this.buttons.length - 1);
    this.buttons.forEach((button, i) => {
      button.tabIndex = i === this.rovingIndex ? 0 : -1;
    });
  }
}
