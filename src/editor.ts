import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { tags as t } from '@lezer/highlight';

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

export interface EditorOptions {
  parent: HTMLElement;
  initialDoc: string;
  onChange: (doc: string) => void;
}

export function createEditor({ parent, initialDoc, onChange }: EditorOptions): EditorView {
  const extensions: Extension[] = [
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
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
    EditorView.contentAttributes.of({ 'aria-label': 'Python program editor' }),
  ];

  return new EditorView({
    parent,
    state: EditorState.create({ doc: initialDoc, extensions }),
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
