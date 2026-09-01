/**
 * FR-059: caret-to-statement mapping across a reformat.
 *
 * Pure text in, offset out, so it is unit-testable without an editor. The
 * formatter rewrites whitespace far more often than it rewrites tokens, so a
 * statement is identified by its line with **all** whitespace removed: `x   =
 * 1` and `x = 1` are the same statement, while two genuinely different
 * statements are told apart. Repeated identical statements are disambiguated
 * by their ordinal. When nothing matches — a reformat that joined or split
 * lines — the caret falls back to the same line index, clamped.
 */

const squash = (line: string): string => line.replace(/\s+/gu, '');

/** Offset of the first character of `lines[index]` within their joined text. */
function lineStart(lines: readonly string[], index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i++) offset += lines[i].length + 1;
  return offset;
}

/** Offset of the first non-whitespace character of a line, or its start. */
function firstNonBlank(lines: readonly string[], index: number): number {
  const line = lines[index] ?? '';
  const indent = line.length - line.trimStart().length;
  return lineStart(lines, index) + indent;
}

/** The 0-based index of the line containing `offset` in `lines`. */
export function lineIndexAt(lines: readonly string[], offset: number): number {
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const end = start + lines[i].length;
    if (offset <= end) return i;
    start = end + 1;
  }
  return Math.max(0, lines.length - 1);
}

/**
 * Where the caret should land in `after` given that it sat at `caret` in
 * `before`. The result is an offset into `after`, always at the first
 * character of the statement the caret was in.
 */
export function mapCaretAcrossFormat(before: string, after: string, caret: number): number {
  const src = before.split('\n');
  const out = after.split('\n');
  const srcIndex = lineIndexAt(src, Math.max(0, Math.min(caret, before.length)));

  const key = squash(src[srcIndex] ?? '');
  if (key !== '') {
    // Which of the identical statements is this one?
    let ordinal = 0;
    for (let i = 0; i < srcIndex; i++) if (squash(src[i]) === key) ordinal++;

    let seen = 0;
    for (let i = 0; i < out.length; i++) {
      if (squash(out[i]) !== key) continue;
      if (seen === ordinal) return firstNonBlank(out, i);
      seen++;
    }
    // The statement survived but its text changed, or it moved past its
    // ordinal: take the first occurrence if there was one at all.
    for (let i = 0; i < out.length; i++) {
      if (squash(out[i]) === key) return firstNonBlank(out, i);
    }
  }

  const fallback = Math.max(0, Math.min(srcIndex, out.length - 1));
  return firstNonBlank(out, fallback);
}
