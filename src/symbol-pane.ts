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
}

export class SymbolPane {
  private readonly toggle: HTMLButtonElement;
  private readonly pane: HTMLElement;
  private readonly status: HTMLElement;

  /** The 29 character buttons, in *Character set* order. */
  private readonly buttons: HTMLButtonElement[] = [];

  /** Which button currently holds the roving `tabindex="0"` (FR-309). */
  private rovingIndex = 0;

  constructor(elements: SymbolPaneElements) {
    this.toggle = elements.toggle;
    this.pane = elements.pane;
    this.status = elements.status;
    this.status.textContent = '';

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
    this.pane.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.focus();
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
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
