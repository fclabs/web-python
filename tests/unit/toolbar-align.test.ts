/**
 * VC-706 (BR-702) — the toolbar right-align rule uses logical properties only.
 *
 * Spec-07 places `#btn-symbols { margin-inline-start: auto }` inside the
 * existing `@media (min-width: 900px)` block. Grepping that rule (same spirit
 * as VC-325) locks BR-702: no physical `margin-left` / `margin-right` /
 * `left:` / `right:`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src', 'styles.css'), 'utf8');

/** Body of the first `@media (min-width: 900px)` block (brace-balanced). */
function minWidth900Block(css: string): string {
  const start = css.search(/@media\s*\(\s*min-width\s*:\s*900px\s*\)\s*\{/);
  expect(start, 'expected @media (min-width: 900px) in styles.css').toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error('unbalanced braces in @media (min-width: 900px) block');
}

/** Declaration body of `#btn-symbols { ... }` inside `block`, comments stripped. */
function btnSymbolsRuleBody(block: string): string {
  const withoutComments = block
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const match = withoutComments.match(/#btn-symbols\s*\{([^}]*)\}/);
  expect(match, 'expected #btn-symbols rule inside @media (min-width: 900px)').toBeTruthy();
  return match![1]!;
}

describe('VC-706 (BR-702): toolbar align uses logical properties only', () => {
  it('places #btn-symbols { margin-inline-start } only under min-width 900px', () => {
    const rule = btnSymbolsRuleBody(minWidth900Block(styles));
    expect(rule).toMatch(/margin-inline-start\s*:/);
    expect(rule).not.toMatch(/margin-left\s*:/);
    expect(rule).not.toMatch(/margin-right\s*:/);
    expect(rule).not.toMatch(/\bleft\s*:/);
    expect(rule).not.toMatch(/\bright\s*:/);
  });

  it('does not put the auto margin on the unscoped .toolbar block', () => {
    // Outside the 900 px media query, #btn-symbols must not carry the align rule.
    const before = styles.slice(0, styles.search(/@media\s*\(\s*min-width\s*:\s*900px\s*\)/));
    expect(before).not.toMatch(/#btn-symbols\s*\{[^}]*margin-inline-start/);
  });
});
