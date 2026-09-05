/**
 * FR-801 – FR-819 / BR-803–BR-807: About toolbar control and modal dialog.
 *
 * Presentation-only: no EditorView, no setInert on `#btn-about`, no worker
 * contact, no `#notices` writes (FR-811 / BR-804 / BR-805 / BR-806).
 */
import { buildMeta } from './build-meta';
import { isInert } from './controls';
import {
  ABOUT_BRANCH_LABEL,
  ABOUT_BUILT_LABEL,
  ABOUT_CLOSE_LABEL,
  ABOUT_COMMIT_LABEL,
  ABOUT_GLYPH,
  ABOUT_LABEL,
  ABOUT_VERSION_LABEL,
} from './format';

function need<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

/** Focusable descendants of the dialog panel (for FR-808 Tab trap). */
function focusableIn(dialog: HTMLElement): HTMLElement[] {
  const nodes = dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0);
}

/**
 * FR-801 – FR-808 / FR-818: wire `#btn-about`, fill fields from `buildMeta`,
 * and own open / close / focus-trap / backdrop dismiss.
 */
export function bindAboutControl(button: HTMLButtonElement): void {
  const backdrop = need<HTMLElement>('about-backdrop');
  const dialog = need<HTMLElement>('about-dialog');
  const title = need('about-title');
  const closeBtn = need<HTMLButtonElement>('about-close');
  const versionLabel = need('about-version-label');
  const branchLabel = need('about-branch-label');
  const commitLabel = need('about-commit-label');
  const builtLabel = need('about-built-label');
  const versionValue = need('about-version');
  const branchValue = need('about-branch');
  const commitValue = need('about-commit');
  const builtValue = need('about-built');

  // FR-803 / FR-804 / BR-807: chrome from format.ts only.
  button.textContent = ABOUT_GLYPH;
  button.title = ABOUT_LABEL;
  button.setAttribute('aria-label', ABOUT_LABEL);

  title.textContent = ABOUT_LABEL;
  versionLabel.textContent = ABOUT_VERSION_LABEL;
  branchLabel.textContent = ABOUT_BRANCH_LABEL;
  commitLabel.textContent = ABOUT_COMMIT_LABEL;
  builtLabel.textContent = ABOUT_BUILT_LABEL;
  closeBtn.textContent = ABOUT_CLOSE_LABEL;

  // FR-805 / BR-801 / BR-803: plain-text field values from the Vite inject.
  versionValue.textContent = buildMeta.version;
  branchValue.textContent = buildMeta.branch;
  commitValue.textContent = buildMeta.commit;
  builtValue.textContent = buildMeta.built;

  let open = false;

  const close = (): void => {
    if (!open) return;
    open = false;
    dialog.hidden = true;
    backdrop.hidden = true;
    // FR-806: restore focus to the control that opened the dialog.
    button.focus();
  };

  const openDialog = (): void => {
    // BR-806: only honour isInert if some *other* feature marked the control.
    if (isInert(button) || open) return;
    open = true;
    backdrop.hidden = false;
    dialog.hidden = false;
    // FR-808: move focus into the dialog panel (Close is the sole focusable).
    const targets = focusableIn(dialog);
    (targets[0] ?? closeBtn).focus();
  };

  button.addEventListener('click', () => openDialog());

  closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    close();
  });

  // FR-806: backdrop click dismisses.
  backdrop.addEventListener('click', () => close());

  // FR-819: if a pointer somehow targets chrome under the modal (e.g. a
  // force-click in tests), swallow it without dismissing — only the backdrop
  // dismiss path and the dialog panel receive input.
  document.addEventListener(
    'click',
    (event) => {
      if (!open) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dialog.contains(target) || target === backdrop || backdrop.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );

  dialog.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    // FR-808: Tab / Shift+Tab cycle only among dialog focusables.
    if (event.key !== 'Tab') return;
    const targets = focusableIn(dialog);
    if (targets.length === 0) {
      event.preventDefault();
      return;
    }
    const first = targets[0]!;
    const last = targets[targets.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey) {
      if (active === first || !dialog.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  });

  // Escape when focus is on the backdrop or elsewhere while open.
  document.addEventListener(
    'keydown',
    (event) => {
      if (!open || event.key !== 'Escape') return;
      event.preventDefault();
      close();
    },
    true,
  );
}
