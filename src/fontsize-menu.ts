/**
 * Font size drop-down (spec-13: FR-1301 – FR-1307, FR-1311, FR-1314 – FR-1316,
 * BR-1306, BR-1307).
 *
 * A button plus a custom `role="menu"` — not a native `<select>` (BR-1307).
 * The control is never inert: no `disabled`, no `aria-disabled`, no
 * `setInert()` (FR-1315, BR-1306). Persistence and the editor are the
 * caller's business (`onSelect`), so this module holds no `EditorView`.
 */
import { FONT_SIZES } from './fontsize';
import { FONT_SIZE_ITEM, FONT_SIZE_LABEL, FONT_SIZE_NAME } from './format';

export interface FontSizeMenuOptions {
  button: HTMLButtonElement;
  menu: HTMLElement;
  /** The size in effect at mount (FR-1302). */
  initial: number;
  /** Called only when the chosen size differs from the current one (FR-1311). */
  onSelect: (size: number) => void;
}

/** Gap kept between the popup and the viewport edge / the button, in px. */
const MARGIN = 4;

export function mountFontSizeMenu(options: FontSizeMenuOptions): void {
  const { button, menu, onSelect } = options;
  let current = options.initial;
  let open = false;

  // FR-1303 / FR-1304: exactly the nine presets, ascending. `div`, not
  // `<button>`: a button item would take a native Space-keyup click, which
  // after FR-1307 returns focus to the toggle would re-open the menu.
  const items = FONT_SIZES.map((size) => {
    const item = document.createElement('div');
    item.className = 'fontsize-item';
    item.setAttribute('role', 'menuitemradio');
    item.tabIndex = -1;
    item.dataset.size = String(size);
    item.textContent = FONT_SIZE_ITEM(size);
    menu.append(item);
    return { size, item };
  });

  const render = (): void => {
    // FR-1302: visible text and accessible name follow the current size.
    button.textContent = FONT_SIZE_LABEL(current);
    button.setAttribute('aria-label', FONT_SIZE_NAME(current));
    for (const { size, item } of items) {
      item.setAttribute('aria-checked', size === current ? 'true' : 'false');
    }
  };

  const focusItem = (index: number): void => {
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    items[clamped]?.item.focus();
  };

  const focusedIndex = (): number =>
    items.findIndex((entry) => entry.item === document.activeElement);

  /**
   * FR-1316: anchor below the button, clamp horizontally into the viewport,
   * flip above when there is no room below (DECISIONS D-002).
   */
  const position = (): void => {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    menu.style.maxHeight = `${Math.max(0, vh - 2 * MARGIN)}px`;
    const anchor = button.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = Math.max(MARGIN, Math.min(anchor.left, vw - width - MARGIN));
    let top = anchor.bottom + MARGIN;
    if (top + height > vh - MARGIN) top = anchor.top - MARGIN - height;
    top = Math.max(MARGIN, Math.min(top, vh - height - MARGIN));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  };

  // FR-1306: while open, Esc is consumed here in the window capture phase —
  // before About's document-capture handler and the panes' own — so it
  // reaches no other Esc handler.
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close(true);
  };
  // FR-1306: outside click. `click` (not pointerdown) so the refocus lands
  // after the default mousedown focus move to whatever was clicked.
  const onDocumentClick = (event: MouseEvent): void => {
    const target = event.target as Node | null;
    if (target && (menu.contains(target) || button.contains(target))) return;
    close(true);
  };

  function close(returnFocus: boolean): void {
    if (!open) return;
    open = false;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    window.removeEventListener('keydown', onEscape, true);
    document.removeEventListener('click', onDocumentClick, true);
    window.removeEventListener('resize', position);
    if (returnFocus) button.focus();
  }

  function openMenu(): void {
    if (open) return;
    open = true;
    render();
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    position();
    window.addEventListener('keydown', onEscape, true);
    document.addEventListener('click', onDocumentClick, true);
    window.addEventListener('resize', position);
    // FR-1303: focus lands on the item for the current size.
    focusItem(FONT_SIZES.indexOf(current));
  }

  const select = (size: number): void => {
    const changed = size !== current;
    current = size;
    render();
    close(true); // FR-1307: menu closes, focus returns to the button.
    if (changed) onSelect(size); // FR-1311: equal size → no write, no notice.
  };

  // FR-1303 / FR-1306: a click opens, a click on the open button closes.
  // Enter and Space reach here as the button's native click.
  button.addEventListener('click', () => {
    if (open) close(true);
    else openMenu();
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      openMenu();
    }
  });

  menu.addEventListener('click', (event) => {
    const entry = items.find(({ item }) => item.contains(event.target as Node));
    if (entry) select(entry.size);
  });
  menu.addEventListener('keydown', (event) => {
    const index = focusedIndex();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(index + 1); // FR-1305: stops at the end, no wrap.
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const entry = items[index];
        if (entry) select(entry.size);
        break;
      }
      case 'Tab':
        // FR-1306: close and let the default Tab move on from the button, so
        // focus continues in toolbar order (not from the menu's DOM position).
        close(true);
        break;
    }
  });

  render();
}
