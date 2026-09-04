import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { globalCompletion, localCompletionSource } from '@codemirror/lang-python';

/** Python 3.13's `keyword.kwlist`, in the order published by CPython. */
export const PYTHON_HARD_KEYWORDS = [
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
] as const;

/** Python 3.13's `keyword.softkwlist`. */
export const PYTHON_SOFT_KEYWORDS = ['_', 'case', 'match', 'type'] as const;

const IDENTIFIER = /^[\p{ID_Start}_][\p{ID_Continue}_]*$/u;
const IDENTIFIER_TAIL = /[\p{ID_Continue}_]+$/u;
const SUPPRESSED_NODES = new Set(['Comment', 'String', 'FormatString', 'PropertyName']);

function isSuppressed(context: CompletionContext, from: number): boolean {
  let node = syntaxTree(context.state).resolveInner(context.pos, -1);
  for (;;) {
    if (SUPPRESSED_NODES.has(node.name)) return true;
    if (node.type.isTop) break;
    const parent = node.parent;
    if (!parent) break;
    node = parent;
  }

  // The parser calls a completed member `PropertyName`; this also covers the
  // temporarily incomplete tree immediately after `.` and while its name is
  // still being typed (FR-607).
  return from > 0 && context.state.sliceDoc(from - 1, from) === '.';
}

function nameOnly(completion: Completion): Completion {
  const { apply: _apply, detail: _detail, displayLabel: _displayLabel, info: _info, ...name } =
    completion;
  return { ...name, apply: completion.label };
}

function addUnique(target: Map<string, Completion>, options: readonly Completion[]): void {
  for (const option of options) {
    if (!target.has(option.label)) target.set(option.label, nameOnly(option));
  }
}

/**
 * Offline, syntactic Python name completion (spec-06).
 *
 * Local definitions are added first so they win label collisions with Python
 * globals. Every option applies its visible label literally: CodeMirror's
 * Python snippets are intentionally reduced to names, with no placeholders,
 * detail panel or documentation.
 */
export const pythonNameCompletionSource: CompletionSource = async (
  context,
): Promise<CompletionResult | null> => {
  const tail = context.matchBefore(IDENTIFIER_TAIL);
  const word = tail && IDENTIFIER.test(tail.text) ? tail : null;
  const from = word?.from ?? context.pos;

  if ((!word && !context.explicit) || isSuppressed(context, from)) return null;

  const [local, global] = await Promise.all([
    localCompletionSource(context),
    globalCompletion(context),
  ]);
  const options = new Map<string, Completion>();

  if (local) addUnique(options, local.options);
  addUnique(
    options,
    PYTHON_HARD_KEYWORDS.map((label) => ({ label, type: 'keyword' })),
  );
  addUnique(
    options,
    PYTHON_SOFT_KEYWORDS.map((label) => ({ label, type: 'keyword' })),
  );
  if (global) addUnique(options, global.options);

  return {
    from,
    options: [...options.values()],
    validFor: IDENTIFIER,
  };
};
