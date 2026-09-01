/**
 * Editor presentation of the diagnostics: a severity-appropriate underline and
 * a gutter icon over the exact source range (FR-036), with a hover/caret
 * tooltip carrying the rule code and message (FR-037).
 */
import {
  RangeSet,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  hoverTooltip,
  showTooltip,
  type DecorationSet,
  type Tooltip,
} from '@codemirror/view';
import { formatDiagnosticTooltip, type Diagnostic } from './diagnostics';

/** FR-035: one effect per lint pass; it replaces everything the last one set. */
export const setDiagnosticsEffect = StateEffect.define<readonly Diagnostic[]>();

/** Document offset of a 1-based line/column, clamped into the document. */
export function offsetOf(state: EditorState, line: number, column: number): number {
  const lineNumber = Math.min(Math.max(1, line), state.doc.lines);
  const target = state.doc.line(lineNumber);
  return Math.min(target.to, target.from + Math.max(0, column - 1));
}

/**
 * The exact source range of a diagnostic, as offsets. A zero-width report —
 * `unexpected EOF while parsing` lands on one — is widened by a character so
 * there is something to underline, never past the end of the document.
 */
export function diagnosticRange(
  state: EditorState,
  diagnostic: Diagnostic,
): { from: number; to: number } {
  const from = offsetOf(state, diagnostic.start.line, diagnostic.start.column);
  let to = Math.max(from, offsetOf(state, diagnostic.end.line, diagnostic.end.column));
  if (to === from) {
    if (to < state.doc.length) to = from + 1;
    else return { from: Math.max(0, from - 1), to: Math.max(0, from) };
  }
  return { from, to };
}

const markFor = (severity: Diagnostic['severity']) =>
  Decoration.mark({ class: `cm-diagnostic-mark cm-diagnostic-${severity}` });

class DiagnosticGutterMarker extends GutterMarker {
  constructor(private readonly severity: Diagnostic['severity']) {
    super();
  }

  override eq(other: DiagnosticGutterMarker): boolean {
    return other.severity === this.severity;
  }

  override toDOM(): Node {
    const el = document.createElement('span');
    el.className = `cm-diagnostic-gutter-icon cm-diagnostic-gutter-${this.severity}`;
    // A shape, not only a colour, so the icon survives NFR-013's greyscale eye.
    el.textContent = this.severity === 'error' ? '✕' : '!';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
}

const ERROR_MARKER = new DiagnosticGutterMarker('error');
const WARNING_MARKER = new DiagnosticGutterMarker('warning');

/**
 * Reserves the icon column's width so the editor does not shift sideways the
 * first time a diagnostic appears. It is never a diagnostic itself.
 */
class SpacerMarker extends GutterMarker {
  override eq(other: GutterMarker): boolean {
    return other instanceof SpacerMarker;
  }

  override toDOM(): Node {
    const el = document.createElement('span');
    el.className = 'cm-diagnostic-gutter-spacer';
    el.textContent = '!';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
}

const SPACER_MARKER = new SpacerMarker();

interface DiagnosticState {
  diagnostics: readonly Diagnostic[];
  marks: DecorationSet;
  gutterMarks: RangeSet<GutterMarker>;
}

const EMPTY: DiagnosticState = {
  diagnostics: [],
  marks: Decoration.none,
  gutterMarks: RangeSet.empty,
};

function build(state: EditorState, diagnostics: readonly Diagnostic[]): DiagnosticState {
  const marks: { from: number; to: number; value: Decoration }[] = [];
  const gutterByLine = new Map<number, Diagnostic['severity']>();

  for (const diagnostic of diagnostics) {
    const { from, to } = diagnosticRange(state, diagnostic);
    if (to > from) marks.push({ from, to, value: markFor(diagnostic.severity) });
    const lineFrom = state.doc.lineAt(from).from;
    // An error on a line outranks a warning on the same line.
    if (gutterByLine.get(lineFrom) !== 'error') gutterByLine.set(lineFrom, diagnostic.severity);
  }

  marks.sort((a, b) => a.from - b.from || a.to - b.to);
  const gutterMarks = [...gutterByLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([from, severity]) =>
      (severity === 'error' ? ERROR_MARKER : WARNING_MARKER).range(from),
    );

  return {
    diagnostics,
    marks: Decoration.set(marks, true),
    gutterMarks: RangeSet.of(gutterMarks, true),
  };
}

export const diagnosticsField = StateField.define<DiagnosticState>({
  create: () => EMPTY,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setDiagnosticsEffect)) return build(transaction.state, effect.value);
    }
    if (!transaction.docChanged) return value;
    // Keep the markers glued to their text until the next pass replaces them.
    return {
      diagnostics: value.diagnostics,
      marks: value.marks.map(transaction.changes),
      gutterMarks: value.gutterMarks.map(transaction.changes),
    };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.marks),
});

/** Every diagnostic whose range covers `pos`, in panel order. */
function diagnosticsAt(state: EditorState, pos: number): Diagnostic[] {
  return state.field(diagnosticsField).diagnostics.filter((diagnostic) => {
    const { from, to } = diagnosticRange(state, diagnostic);
    return pos >= from && pos <= to;
  });
}

function tooltipDom(diagnostics: readonly Diagnostic[]): { dom: HTMLElement } {
  const dom = document.createElement('div');
  dom.className = 'cm-diagnostic-tooltip';
  for (const diagnostic of diagnostics) {
    const line = document.createElement('div');
    line.className = `cm-diagnostic-tooltip-line cm-diagnostic-${diagnostic.severity}`;
    // FR-037: `F821 · Undefined name 'foo'`.
    line.textContent = formatDiagnosticTooltip(diagnostic);
    dom.append(line);
  }
  return { dom };
}

function tooltipAt(state: EditorState, pos: number): Tooltip | null {
  const found = diagnosticsAt(state, pos);
  if (found.length === 0) return null;
  return { pos, above: true, create: () => tooltipDom(found) };
}

/** FR-037, pointer half. */
const diagnosticHover = hoverTooltip((view, pos) => tooltipAt(view.state, pos), {
  hoverTime: 100,
});

/**
 * FR-037, keyboard half: a diagnostic the caret sits inside shows the same
 * tooltip, so the marker is reachable without a pointer.
 */
const caretTooltip = StateField.define<Tooltip | null>({
  create: (state) => (state.selection.main.empty ? tooltipAt(state, state.selection.main.head) : null),
  update(value, transaction) {
    if (!transaction.docChanged && !transaction.selection && transaction.effects.length === 0) {
      return value;
    }
    const { main } = transaction.state.selection;
    return main.empty ? tooltipAt(transaction.state, main.head) : null;
  },
  provide: (field) => showTooltip.from(field),
});

/** FR-036: the gutter icon column. */
const diagnosticGutter = gutter({
  class: 'cm-diagnostic-gutter',
  markers: (view) => view.state.field(diagnosticsField).gutterMarks,
  initialSpacer: () => SPACER_MARKER,
});

export function diagnosticMarkers(): Extension {
  return [diagnosticsField, diagnosticGutter, diagnosticHover, caretTooltip];
}

/** FR-035: install a whole pass, replacing whatever the previous one left. */
export function applyDiagnostics(view: EditorView, diagnostics: readonly Diagnostic[]): void {
  view.dispatch({ effects: setDiagnosticsEffect.of(diagnostics) });
}
