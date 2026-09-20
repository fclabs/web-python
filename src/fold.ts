import {
  codeFolding,
  foldGutter,
  foldService,
} from '@codemirror/language';
import type { EditorState, Extension, Text } from '@codemirror/state';

/**
 * Leading space/tab count, or `-1` when the line is blank or whitespace-only.
 * Python counts only ASCII space and tab as indentation (FR-1501).
 */
export function lineIndent(text: string): number {
  const width = /^[ \t]*/.exec(text)?.[0].length ?? 0;
  return width === text.length ? -1 : width;
}

/**
 * Indentation fold for the document line covering `lineStart`.
 * `from` is `lineEnd` so the header stays visible (FR-1501, FR-1504).
 */
export function indentFoldRange(
  doc: Text,
  lineStart: number,
  lineEnd: number,
): { from: number; to: number } | null {
  const header = doc.lineAt(lineStart);
  const headerIndent = lineIndent(header.text);
  if (headerIndent < 0) return null;

  let foldTo = -1;
  for (let number = header.number + 1; number <= doc.lines; number += 1) {
    const line = doc.line(number);
    const indent = lineIndent(line.text);
    if (indent < 0) continue;
    if (indent <= headerIndent) break;
    foldTo = line.to;
  }
  if (foldTo <= lineEnd) return null;
  return { from: lineEnd, to: foldTo };
}

/** BR-1501: consulted before `@codemirror/lang-python`'s syntax folds. */
export function indentFoldService(
  state: EditorState,
  lineStart: number,
  lineEnd: number,
): { from: number; to: number } | null {
  return indentFoldRange(state.doc, lineStart, lineEnd);
}

function foldMarker(open: boolean): HTMLElement {
  const marker = document.createElement('span');
  marker.textContent = open ? '⌄' : '›';
  marker.setAttribute('aria-label', open ? 'Fold indented block' : 'Unfold indented block');
  marker.title = open ? 'Fold' : 'Unfold';
  return marker;
}

/**
 * Native CodeMirror folding with indentation as the default strategy
 * (FR-1501 – FR-1504 / BR-1501). Syntax folds remain the fallback.
 */
export function indentFolding(): Extension {
  return [
    codeFolding({ placeholderText: '...' }),
    foldGutter({ markerDOM: foldMarker }),
    foldService.of(indentFoldService),
  ];
}
