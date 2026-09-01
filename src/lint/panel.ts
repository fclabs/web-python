/**
 * The diagnostics panel (FR-038 – FR-040, FR-046).
 *
 * It has exactly three states: a list with a live count, the empty state
 * `No problems found.`, and — when the engine never loaded — `Linter
 * unavailable.` (FR-046, BR-009).
 */
import { formatDiagnosticEntry, type Diagnostic } from './diagnostics';

/** FR-040 */
export const NO_PROBLEMS = 'No problems found.';
/** FR-046 */
export const LINTER_UNAVAILABLE = 'Linter unavailable.';

export interface DiagnosticsPanelElements {
  list: HTMLElement;
  count: HTMLElement;
  empty: HTMLElement;
}

export class DiagnosticsPanel {
  private unavailable = false;

  constructor(
    private readonly elements: DiagnosticsPanelElements,
    /** FR-039: activating an entry reveals the diagnostic in the editor. */
    private readonly onActivate: (diagnostic: Diagnostic) => void,
  ) {
    this.render([]);
  }

  /** FR-035 / FR-038: the pass replaces everything the previous one listed. */
  render(diagnostics: readonly Diagnostic[]): void {
    if (this.unavailable) return;
    const { list, count, empty } = this.elements;

    list.replaceChildren(
      ...diagnostics.map((diagnostic) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `diagnostic-entry diagnostic-entry--${diagnostic.severity}`;
        button.dataset.code = diagnostic.code;
        button.dataset.severity = diagnostic.severity;
        button.dataset.line = String(diagnostic.start.line);
        button.dataset.column = String(diagnostic.start.column);
        button.textContent = formatDiagnosticEntry(diagnostic);
        button.addEventListener('click', () => this.onActivate(diagnostic));
        item.append(button);
        return item;
      }),
    );

    count.textContent = String(diagnostics.length); // FR-038: live count.
    empty.textContent = NO_PROBLEMS;
    empty.hidden = diagnostics.length > 0;
  }

  /** FR-046: the engine failed to load; nothing else will ever be listed. */
  markUnavailable(): void {
    this.unavailable = true;
    this.elements.list.replaceChildren();
    this.elements.count.textContent = '0';
    this.elements.empty.textContent = LINTER_UNAVAILABLE;
    this.elements.empty.hidden = false;
  }
}
