import { undo } from '@codemirror/commands';
import { foldEffect, foldable, foldedRanges } from '@codemirror/language';
import { Text } from '@codemirror/state';
import { describe, expect, test } from 'vitest';
import { createEditor, setEditorReadOnly } from '../../src/editor';
import { indentFoldRange, lineIndent } from '../../src/fold';

function foldedSlice(doc: string, lineNumber: number): string | null {
  const text = Text.of(doc.split('\n'));
  const line = text.line(lineNumber);
  const range = indentFoldRange(text, line.from, line.to);
  return range && range.from === line.to ? text.sliceString(range.from, range.to) : null;
}

function editor(doc: string) {
  return createEditor({
    parent: document.body.appendChild(document.createElement('div')),
    initialDoc: doc,
    onChange: () => {},
    effectiveColorScheme: 'light',
  });
}

function foldLine(
  view: ReturnType<typeof createEditor>,
  lineNumber: number,
): boolean {
  const line = view.state.doc.line(lineNumber);
  const range = foldable(view.state, line.from, line.to);
  if (!range) return false;
  view.dispatch({ effects: foldEffect.of(range) });
  return true;
}

describe('lineIndent', () => {
  test('VC-1501 (FR-1501): blank and whitespace-only lines are not headers', () => {
    expect(lineIndent('')).toBe(-1);
    expect(lineIndent('    ')).toBe(-1);
    expect(lineIndent('\t\t')).toBe(-1);
    expect(lineIndent('def f():')).toBe(0);
    expect(lineIndent('    return 1')).toBe(4);
  });
});

describe('indentFoldRange', () => {
  test('VC-1501 (FR-1501): functions and classes fold their indented body', () => {
    const fn = ['def process_payment(payment):', '    validate(payment)', '    return payment'].join(
      '\n',
    );
    expect(foldedSlice(fn, 1)).toBe('\n    validate(payment)\n    return payment');
    expect(foldedSlice(fn, 2)).toBeNull();

    const cls = ['class Account:', '    def __init__(self):', '        self.n = 0'].join('\n');
    expect(foldedSlice(cls, 1)).toBe('\n    def __init__(self):\n        self.n = 0');
    expect(foldedSlice(cls, 2)).toBe('\n        self.n = 0');
  });

  test('VC-1501 (FR-1501): if/elif/else, loops, try, and with fold independently', () => {
    const branches = [
      'if enabled:',
      '    execute()',
      'elif retry:',
      '    retry()',
      'else:',
      '    skip()',
    ].join('\n');
    expect(foldedSlice(branches, 1)).toBe('\n    execute()');
    expect(foldedSlice(branches, 3)).toBe('\n    retry()');
    expect(foldedSlice(branches, 5)).toBe('\n    skip()');

    const loop = ['for item in items:', '    handle(item)', 'while running:', '    step()'].join('\n');
    expect(foldedSlice(loop, 1)).toBe('\n    handle(item)');
    expect(foldedSlice(loop, 3)).toBe('\n    step()');

    const caught = [
      'try:',
      '    risky()',
      'except Error:',
      '    recover()',
      'finally:',
      '    cleanup()',
    ].join('\n');
    expect(foldedSlice(caught, 1)).toBe('\n    risky()');
    expect(foldedSlice(caught, 3)).toBe('\n    recover()');
    expect(foldedSlice(caught, 5)).toBe('\n    cleanup()');

    const manager = ['with open(path) as handle:', '    data = handle.read()'].join('\n');
    expect(foldedSlice(manager, 1)).toBe('\n    data = handle.read()');
  });

  test('VC-1501 (FR-1501): nested headers and blank lines inside a block', () => {
    const nested = [
      'def process_payment(payment):',
      '    validate(payment)',
      '',
      '    if payment.approved:',
      '        notify_customer(payment)',
      '        save_transaction(payment)',
      '',
      '    return payment',
    ].join('\n');

    expect(foldedSlice(nested, 1)).toBe(
      '\n    validate(payment)\n\n    if payment.approved:\n        notify_customer(payment)\n        save_transaction(payment)\n\n    return payment',
    );
    expect(foldedSlice(nested, 4)).toBe('\n        notify_customer(payment)\n        save_transaction(payment)');
    expect(foldedSlice(nested, 2)).toBeNull();
    expect(foldedSlice(nested, 3)).toBeNull();
  });

  test('VC-1501 (FR-1501): incomplete indented code still produces a range', () => {
    const incomplete = ['if enabled', '    execute()', '    log_result()'].join('\n');
    expect(foldedSlice(incomplete, 1)).toBe('\n    execute()\n    log_result()');
    expect(foldedSlice('if enabled: pass', 1)).toBeNull();
    expect(foldedSlice('print(1)', 1)).toBeNull();
  });
});

describe('editor folding', () => {
  test('VC-1503 (FR-1503): folding does not change the document or steal Undo', () => {
    const source = 'def f():\n    return 1\n';
    const view = editor(source);
    expect(foldLine(view, 1)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(foldedRanges(view.state).size).toBe(1);

    view.dispatch({ changes: { from: 0, insert: '# note\n' } });
    expect(view.state.doc.toString()).toBe(`# note\n${source}`);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    view.destroy();
  });

  test('VC-1503 (FR-1503): a read-only editor can still fold', () => {
    const source = 'def f():\n    return 1\n';
    const view = editor(source);
    setEditorReadOnly(view, true);
    expect(foldLine(view, 1)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(foldedRanges(view.state).size).toBe(1);
    view.destroy();
  });

  test('VC-1501 (FR-1501): foldable() uses indent ranges, not only Python Body nodes', () => {
    const source = 'if enabled\n    execute()\n';
    const view = editor(source);
    const line = view.state.doc.line(1);
    expect(foldable(view.state, line.from, line.to)).toEqual({ from: line.to, to: view.state.doc.line(2).to });
    view.destroy();
  });
});
