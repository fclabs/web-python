/**
 * The vertical special-character pane (spec-03: FR-301 – FR-318; spec-16).
 *
 * spec-03's BR-301 (copy-only, never insert-at-caret) is **superseded by
 * BR-1601**. The pane's effects are now exactly three: one insertion per live
 * activation, its own feedback, and its own open/closed state. It still holds
 * no `EditorView` reference and imports nothing from the CodeMirror packages
 * (BR-1601) — the mutation, the target resolution and the inertness decision
 * all live in `src/main.ts`, which injects the `onInsert` callback below and
 * is the sole caller of {@link SymbolPane.setLocked} (BR-1604).
 *
 * Dismissal is deliberately narrow (FR-318, FR-1610): the pane closes from
 * exactly two code paths — the toggle and `Escape` from inside the pane. This
 * module registers no focus-loss listener, no outside-click listener and no
 * pointer listener of any kind, which is what makes "the pane survives
 * everything else" true by construction rather than by enumeration. A grep of
 * this file for those listener names is part of the criterion.
 */
import { isInert, setInert } from './controls';
import { COPIED_MS, formatSymbolInserted } from './format';
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
   * FR-1609's insertion feedback lands.
   */
  status: HTMLElement;
  /**
   * FR-1601 / BR-1601: the pane's one route to a text target. `src/main.ts`
   * resolves the target (FR-1605) and performs the mutation; the pane only
   * says *which character* a live activation asked for.
   */
  onInsert(value: string): void;
}

export class SymbolPane {
  private readonly toggle: HTMLButtonElement;
  private readonly pane: HTMLElement;
  private readonly status: HTMLElement;
  private readonly onInsert: (value: string) => void;

  /** The 29 character buttons, in *Character set* order. */
  private readonly buttons: HTMLButtonElement[] = [];

  /** Which button currently holds the roving `tabindex="0"` (FR-309). */
  private rovingIndex = 0;

  /** The pending FR-1609 revert, or null when no feedback is showing. */
  private revertTimer: ReturnType<typeof setTimeout> | null = null;

  /** The button currently carrying `data-state="inserted"`, if any. */
  private insertedButton: HTMLButtonElement | null = null;

  constructor(elements: SymbolPaneElements) {
    this.toggle = elements.toggle;
    this.pane = elements.pane;
    this.status = elements.status;
    this.status.textContent = '';
    this.onInsert = elements.onInsert;

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
    // FR-1609: closing leaves no `Inserted V` and no `data-state` behind.
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
   * FR-1607 / BR-1604: mark every character button inert or live. Called only
   * by `syncControls()` in `src/main.ts`, which is the single owner of the
   * "is there a live insertion target" question. `setInert` writes
   * `aria-disabled` only — never the `disabled` attribute, and never
   * `tabIndex`, which the FR-309 roving model owns.
   */
  setLocked(locked: boolean): void {
    for (const button of this.buttons) setInert(button, locked);
  }

  /**
   * FR-1601 / FR-1604 / FR-1609. Synchronous: pointer, `Enter` and `Space`
   * all arrive here as a click and produce the same insertion, the same
   * feedback and the same undo granularity. The pane performs no mutation of
   * its own — `onInsert` is the one route out (BR-1601).
   */
  private activate(button: HTMLButtonElement): void {
    // FR-1607: every activation path is guarded, and an inert button no-ops
    // completely — no insertion, no feedback.
    if (isInert(button)) return;

    const value = button.dataset.value ?? '';
    this.onInsert(value);

    // FR-1609: one owner of the feedback state, cleared before the write, so
    // a second insertion inside the window replaces the text, moves the state
    // to the new button and restarts the timer from zero.
    this.clearFeedback();
    this.status.textContent = formatSymbolInserted(value);
    button.dataset.state = 'inserted';
    this.insertedButton = button;
    this.revertTimer = setTimeout(() => this.clearFeedback(), COPIED_MS);
  }

  /** The single writer of FR-1609 feedback state. */
  private clearFeedback(): void {
    if (this.revertTimer !== null) {
      clearTimeout(this.revertTimer);
      this.revertTimer = null;
    }
    if (this.insertedButton) {
      delete this.insertedButton.dataset.state;
      this.insertedButton = null;
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
