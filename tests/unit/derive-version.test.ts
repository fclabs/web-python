/**
 * The semver bump derivation (spec 02-ci: FR-116, FR-117, BR-100 – BR-102).
 *
 * BR-100 encodes six distinct cases and VC-125 – VC-128, VC-133 and VC-134 each
 * describe them as "merge a PR and observe". Verifying six branches with six
 * real squash-merges is slow and destructive to the tag history, so the
 * derivation is a pure module and every row of BR-100's table is a test here.
 * The release workflow then calls it once (FR-116), and the remaining VCs
 * observe that single call on GitHub.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBump,
  BOOTSTRAP_VERSION,
  deriveBump,
  deriveVersion,
  highestVersion,
  parseCommit,
  parseVersion,
  TYPES,
} from '../../scripts/derive-version.mjs';

describe('BR-100: the bump mapping', () => {
  it('maps feat to a minor bump, with or without a scope', () => {
    expect(deriveBump('feat: add a run-history panel')).toBe('minor');
    expect(deriveBump('feat(editor): add a run-history panel')).toBe('minor');
  });

  it('maps fix, perf and revert to a patch bump', () => {
    expect(deriveBump('fix: restore the stderr prefix')).toBe('patch');
    expect(deriveBump('perf: shrink the vendored runtime')).toBe('patch');
    expect(deriveBump('revert: undo the storage-key change')).toBe('patch');
    expect(deriveBump('fix(worker): restore the prefix')).toBe('patch');
  });

  it('maps chore, docs, style, refactor, test, build and ci to no release', () => {
    for (const type of ['chore', 'docs', 'style', 'refactor', 'test', 'build', 'ci']) {
      expect(deriveBump(`${type}: a subject`), type).toBe('none');
      expect(deriveBump(`${type}(scope): a subject`), `${type} scoped`).toBe('none');
    }
  });

  it('maps a "!" before the colon to a major bump, on any type', () => {
    expect(deriveBump('feat!: drop the v1 storage key')).toBe('major');
    expect(deriveBump('fix!: change the worker protocol')).toBe('major');
    // BR-101: even a type that alone produces no release.
    expect(deriveBump('chore!: remove the legacy entry point')).toBe('major');
    expect(deriveBump('feat(editor)!: drop the v1 storage key')).toBe('major');
  });

  it('maps a BREAKING CHANGE: footer to a major bump', () => {
    const message = [
      'refactor: split runtime.ts',
      '',
      'The worker protocol is renumbered.',
      '',
      'BREAKING CHANGE: the v1 message envelope is gone.',
    ].join('\n');
    expect(deriveBump(message)).toBe('major');
  });

  it('accepts the hyphenated BREAKING-CHANGE: spelling', () => {
    expect(deriveBump('docs: retitle\n\nBREAKING-CHANGE: the anchor moved.')).toBe('major');
  });

  it('does not read a breaking footer out of the subject line alone', () => {
    // The token must be a footer in the body, not prose in the subject.
    expect(deriveBump('docs: explain the BREAKING CHANGE: policy')).toBe('none');
  });

  it('accepts exactly the eleven types the grammar lists', () => {
    expect(TYPES).toEqual([
      'feat',
      'fix',
      'perf',
      'revert',
      'chore',
      'docs',
      'style',
      'refactor',
      'test',
      'build',
      'ci',
    ]);
    for (const type of TYPES) {
      expect(parseCommit(`${type}: a subject`), type).not.toBeNull();
    }
  });
});

describe('A-1 / FR-117: an unrecognized subject yields no release, not an error', () => {
  it.each([
    ['Fixes', 'no type at all'],
    ['feature: x', 'a type outside the accepted set'],
    ['Feat: x', 'a capitalised type'],
    ['feat x', 'no colon'],
    ['feat:x', 'no space after the colon'],
    ['feat: ', 'an empty subject'],
    ['feat(): x', 'an empty scope'],
    ['', 'an empty message'],
  ])('%s (%s) produces none', (message) => {
    expect(() => deriveBump(message)).not.toThrow();
    expect(deriveBump(message)).toBe('none');
    expect(deriveVersion(message, ['v1.2.3']).version).toBeNull();
  });

  it('treats a null or undefined message as none', () => {
    expect(deriveBump(null)).toBe('none');
    expect(deriveBump(undefined)).toBe('none');
  });
});

describe('BR-101: a breaking change bumps major, including before 1.0', () => {
  it('takes 0.1.0 to 1.0.0 on feat!', () => {
    expect(deriveVersion('feat!: replace the storage key', ['v0.1.0']).version).toBe('1.0.0');
  });

  it('resets minor and patch on a major bump', () => {
    expect(applyBump('0.9.7', 'major')).toBe('1.0.0');
    expect(applyBump('1.4.2', 'major')).toBe('2.0.0');
  });

  it('resets patch but not major on a minor bump', () => {
    expect(applyBump('1.4.2', 'minor')).toBe('1.5.0');
  });
});

describe('BR-102: git tags are the version source of truth', () => {
  it('falls back to 0.1.0 when no vX.Y.Z tag exists', () => {
    expect(highestVersion([])).toBe(BOOTSTRAP_VERSION);
    expect(BOOTSTRAP_VERSION).toBe('0.1.0');
    expect(highestVersion('')).toBe('0.1.0');
  });

  it('compares tag components numerically, not lexically', () => {
    // A lexical sort puts v0.9.0 above v0.10.0, which is the bug this guards.
    expect(highestVersion(['v0.9.0', 'v0.10.0'])).toBe('0.10.0');
    expect(highestVersion(['v0.10.0', 'v0.9.0'])).toBe('0.10.0');
    expect(highestVersion(['v1.0.0', 'v0.99.99'])).toBe('1.0.0');
    expect(highestVersion(['v1.2.9', 'v1.2.10'])).toBe('1.2.10');
    expect(highestVersion(['v2.0.0', 'v10.0.0', 'v9.9.9'])).toBe('10.0.0');
  });

  it('ignores tags that are not a plain vX.Y.Z', () => {
    expect(highestVersion(['v1.0.0', 'v2.0.0-rc.1', 'nightly', 'release-3'])).toBe('1.0.0');
  });

  it('accepts a whitespace-separated tag list, as `git tag --list` prints it', () => {
    expect(highestVersion('v0.1.0\nv0.2.0\nv0.10.0\n')).toBe('0.10.0');
  });

  it('never reads package.json: a drifted mirror does not change the result', () => {
    // VC-133: the tag is v1.0.0 while package.json says 9.9.9.
    const derived = deriveVersion('fix: restore the stderr prefix', ['v1.0.0']);
    expect(derived.baseVersion).toBe('1.0.0');
    expect(derived.version).toBe('1.0.1');
  });
});

describe('parseVersion', () => {
  it('accepts a tag with or without its leading v', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
  });

  it('rejects anything that is not three numeric components', () => {
    for (const value of ['v1.2', 'v1.2.3.4', 'v1.2.x', 'main', '', null, undefined]) {
      expect(parseVersion(value), String(value)).toBeNull();
    }
  });
});

describe('parseCommit', () => {
  it('reports the scope when the subject carries one', () => {
    expect(parseCommit('feat(editor)!: drop the key')).toEqual({
      type: 'feat',
      scope: 'editor',
      breaking: true,
    });
  });

  it('reports a null scope when the subject carries none', () => {
    expect(parseCommit('fix: a subject')).toEqual({
      type: 'fix',
      scope: null,
      breaking: false,
    });
  });

  it('tolerates CRLF line endings in the body', () => {
    expect(parseCommit('fix: a\r\n\r\nBREAKING CHANGE: b\r\n')?.breaking).toBe(true);
  });
});

/**
 * The release VCs, each stated as its tag state plus its merge subject, so a
 * failure here names the criterion it breaks.
 */
describe('the release verification criteria, at unit level', () => {
  it.each([
    ['VC-124', ['v0.1.0'], 'feat: add a run-history panel', '0.2.0'],
    ['VC-125', ['v0.2.0'], 'fix: restore the stderr prefix', '0.2.1'],
    ['VC-126', ['v0.2.1'], 'feat!: replace the pyplay.program.v1 key', '1.0.0'],
    [
      'VC-127',
      ['v1.0.0'],
      'refactor: split runtime.ts\n\nBREAKING CHANGE: the worker protocol is renumbered.',
      '2.0.0',
    ],
    ['VC-133', ['v1.0.0'], 'fix: restore the prefix', '1.0.1'],
    ['VC-134', [], 'feat: first feature', '0.2.0'],
  ])('%s: %o + %s -> %s', (_vc, tags, message, expected) => {
    expect(deriveVersion(message, tags).version).toBe(expected);
  });

  it('VC-128: docs: expand CONTRIBUTING produces no release', () => {
    const derived = deriveVersion('docs: expand CONTRIBUTING', ['v1.0.0']);
    expect(derived.bump).toBe('none');
    expect(derived.version).toBeNull();
    // The base version is still reported, so the workflow can log it.
    expect(derived.baseVersion).toBe('1.0.0');
  });
});
