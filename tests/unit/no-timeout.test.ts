import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROGRAM_STOPPED } from '../../src/format';

/**
 * VC-059 (BR-008), static half.
 *
 * BR-008: there is no automatic execution timeout — a run ends only by
 * returning, raising, or being stopped by the visitor. The behavioural half of
 * this check is `tests/e2e/stop.spec.ts` (a 20 s run always, a 6-minute run
 * behind `RUN_LONG=1`). Here we assert the stronger, instant property: no
 * timeout logic exists anywhere in the run code path at all, so there is
 * nothing that could fire at minute 7 either.
 */

const source = (relative: string): string =>
  readFileSync(resolve(process.cwd(), 'src', relative), 'utf8');

/** Strip comments and string literals so only executable code is inspected. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

const RUN_PATH = ['runtime.ts', 'main.ts', 'worker/pyodide.worker.ts'] as const;

/** Anything that could end a run on its own, without the visitor. */
const WATCHDOGS = [
  /\bAbortSignal\s*\.\s*timeout\b/,
  /\bsetTimeout\s*\([^)]*terminate/,
  /\bAtomics\s*\.\s*wait\s*\([^)]*,[^)]*,[^)]*,/, // a wait with a timeout argument
  /\binterruptBuffer\b/,
  /\bsys\.settrace\b/,
  /\bsignal\.alarm\b/,
];

describe('BR-008: no automatic execution timeout (VC-059)', () => {
  it.each(RUN_PATH)('%s contains no watchdog that could end a run', (file) => {
    const body = code(source(file));
    for (const pattern of WATCHDOGS) {
      expect(body, `${file} must not use ${pattern}`).not.toMatch(pattern);
    }
  });

  it('the worker never arms a timer at all', () => {
    const body = code(source('worker/pyodide.worker.ts'));
    expect(body).not.toMatch(/\bsetTimeout\s*\(/);
    expect(body).not.toMatch(/\bsetInterval\s*\(/);
  });

  it('terminates the worker only from the Stop path', () => {
    const body = code(source('runtime.ts'));
    expect(body.match(/\.terminate\s*\(/g) ?? []).toHaveLength(1);

    // The single `terminate()` lives inside `stop()`, which is reached only
    // from the Stop control — never from a timer callback.
    const stopBody = body.slice(body.indexOf('stop(): void {'));
    expect(stopBody).toContain('.terminate(');
    expect(body.indexOf('.terminate(')).toBeGreaterThan(body.indexOf('stop(): void {'));
  });

  it('arms only the boot-progress ticker, which cannot end a run', () => {
    const body = code(source('runtime.ts'));
    const timers = body.match(/\bset(?:Timeout|Interval)\s*\([^;]*/g) ?? [];
    expect(timers).toHaveLength(1);
    expect(timers[0]).toContain('tickProgress');
  });

  it('reports the visitor-initiated stop with the spec string (FR-023)', () => {
    expect(PROGRAM_STOPPED).toBe('Program stopped.');
  });
});
