import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { tags as t } from '@lezer/highlight';
import { diagnosticMarkers } from './lint/markers';

/**
 * Syntax highlighting mapped to stable class names so the palette lives in CSS
 * (light/dark tokens) and the highlighting is assertable from tests (FR-001).
 */
const pyHighlight = HighlightStyle.define([
  { tag: t.keyword, class: 'tok-keyword' },
  { tag: t.controlKeyword, class: 'tok-keyword' },
  { tag: t.definitionKeyword, class: 'tok-keyword' },
  { tag: t.operatorKeyword, class: 'tok-keyword' },
  { tag: t.moduleKeyword, class: 'tok-keyword' },
  { tag: t.string, class: 'tok-string' },
  { tag: t.special(t.string), class: 'tok-string' },
  { tag: t.comment, class: 'tok-comment' },
  { tag: t.number, class: 'tok-number' },
  { tag: t.bool, class: 'tok-atom' },
  { tag: t.null, class: 'tok-atom' },
  { tag: t.definition(t.variableName), class: 'tok-def' },
  { tag: t.function(t.variableName), class: 'tok-def' },
  { tag: t.propertyName, class: 'tok-property' },
  { tag: t.operator, class: 'tok-operator' },
  { tag: t.punctuation, class: 'tok-punct' },
]);

/** Drive CodeMirror's dark-theme facet from the effective palette (BR-503). */
const colorScheme = new Compartment();

function colorSchemeExtensions(effective: 'light' | 'dark'): Extension[] {
  return effective === 'dark' ? [EditorView.darkTheme.of(true)] : [];
}

export interface EditorOptions {
  parent: HTMLElement;
  initialDoc: string;
  onChange: (doc: string) => void;
  /** FR-008: `Ctrl+Enter` / `Cmd+Enter` triggers Run from inside the editor. */
  onRun?: () => void;
  /** FR-009: `Shift+Alt+F` triggers Format from inside the editor. */
  onFormat?: () => void;
  /** Effective palette from the theme module (BR-502 — no matchMedia here). */
  effectiveColorScheme: 'light' | 'dark';
}

export function createEditor({
  parent,
  initialDoc,
  onChange,
  onRun,
  onFormat,
  effectiveColorScheme,
}: EditorOptions): EditorView {
  const extensions: Extension[] = [
    // Ahead of the default keymap, which binds `Mod-Enter` to insertBlankLine.
    Prec.highest(
      keymap.of([
        {
          key: 'Mod-Enter',
          preventDefault: true,
          run: () => {
            onRun?.();
            return true;
          },
        },
        {
          // FR-009 / FR-058: the page decides whether Format is available at
          // all, so the binding is always installed and always consumed.
          key: 'Shift-Alt-f',
          preventDefault: true,
          run: () => {
            onFormat?.();
            return true;
          },
        },
      ]),
    ),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    highlightSpecialChars(),
    drawSelection(),
    history(),
    indentOnInput(),
    bracketMatching(),
    indentUnit.of('    '),
    syntaxHighlighting(pyHighlight),
    python(),
    // FR-036 / FR-037: diagnostic underlines, gutter icons and tooltips.
    diagnosticMarkers(),
    // FR-049: `Tab` is deliberately NOT bound to indentation. CodeMirror's
    // `indentWithTab` would trap the tab sequence inside the editor, and
    // FR-049 requires `Tab` from page load to walk past the editor to the
    // stdin field, Send EOF and the diagnostics entries. Indentation still
    // comes from `indentOnInput`, `indentUnit` and the default keymap's
    // `insertNewlineAndIndent`.
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
    EditorView.contentAttributes.of({ 'aria-label': 'Python program editor' }),
    colorScheme.of(colorSchemeExtensions(effectiveColorScheme)),
  ];

  return new EditorView({
    parent,
    state: EditorState.create({ doc: initialDoc, extensions }),
  });
}

/** Reconfigure the editor's dark-theme compartment (BR-502, BR-503). */
export function setEditorColorScheme(
  view: EditorView,
  effective: 'light' | 'dark',
): void {
  view.dispatch({
    effects: colorScheme.reconfigure(colorSchemeExtensions(effective)),
  });
}

/** Replace the whole document as a single undoable edit. */
export function setDoc(view: EditorView, doc: string): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: doc },
    selection: { anchor: Math.min(doc.length, view.state.selection.main.anchor) },
  });
}

/** FR-007: leave the editor contents selected so the visitor can copy manually. */
export function selectAll(view: EditorView): void {
  view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
  view.focus();
}

/**
 * FR-039: scroll the given 1-based line/column into view and put the caret on
 * it. Used by the diagnostics panel to reveal an entry's source position.
 */
export function revealPosition(view: EditorView, line: number, column: number): void {
  const lineNumber = Math.min(Math.max(1, line), view.state.doc.lines);
  const target = view.state.doc.line(lineNumber);
  const pos = Math.min(target.to, target.from + Math.max(0, column - 1));
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'center' }),
  });
  view.focus();
}
