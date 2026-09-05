/**
 * About build-metadata formatters (spec 08-about-button: FR-812–FR-817,
 * BR-802, BR-803, BR-807; VC-809–VC-813, VC-819, VC-825).
 *
 * Pure helpers only — the Vite shell-out path is covered by a dry build that
 * greps the emitted bundle for the injected strings (BR-801).
 */
import { describe, expect, it } from 'vitest';
import {
  collectBuildMetadata,
  formatBuilt,
  formatVersion,
  resolveBranch,
  shortSha,
  UNKNOWN,
} from '../../scripts/build-metadata.mjs';
import {
  ABOUT_BRANCH_LABEL,
  ABOUT_BUILT_LABEL,
  ABOUT_CLOSE_LABEL,
  ABOUT_COMMIT_LABEL,
  ABOUT_GLYPH,
  ABOUT_LABEL,
  ABOUT_VERSION_LABEL,
  UNKNOWN as FORMAT_UNKNOWN,
} from '../../src/format';

const SAMPLE_SHA = 'abcdef0123456789deadbeefcafebabe01234567';

describe('VC-809 (FR-812, FR-815): HEAD exactly at a version tag', () => {
  it('shows stripped tag as Version and 7-hex Commit', () => {
    const meta = collectBuildMetadata({
      tags: ['v1.2.3'],
      headSha: SAMPLE_SHA,
      headExactVersionTag: 'v1.2.3',
    });
    expect(meta.version).toBe('1.2.3');
    expect(meta.commit).toBe('abcdef0');
  });
});

describe('VC-810 (FR-813, FR-815): off-tag with highest tag and known SHA', () => {
  it('shows {highest}+{shortsha}', () => {
    const meta = collectBuildMetadata({
      tags: ['v1.2.3', 'v0.9.0'],
      headSha: SAMPLE_SHA,
      headExactVersionTag: null,
    });
    expect(meta.version).toBe('1.2.3+abcdef0');
    expect(meta.commit).toBe('abcdef0');
  });
});

describe('VC-811 (FR-814, FR-815): no version tags, known SHA', () => {
  it('shows bootstrap 0.1.0+{shortsha}', () => {
    const meta = collectBuildMetadata({
      tags: [],
      headSha: SAMPLE_SHA,
      headExactVersionTag: null,
    });
    expect(meta.version).toBe('0.1.0+abcdef0');
    expect(meta.commit).toBe('abcdef0');
  });
});

describe('VC-812 (FR-815–FR-817, BR-802, BR-803): all inputs missing', () => {
  it('yields unknown for every field', () => {
    const meta = collectBuildMetadata({});
    expect(meta.version).toBe('unknown');
    expect(meta.branch).toBe('unknown');
    expect(meta.commit).toBe('unknown');
    expect(meta.built).toBe('unknown');
  });

  it('Commit is never a URL shape (BR-803)', () => {
    const meta = collectBuildMetadata({});
    expect(meta.commit).toBe(UNKNOWN);
    expect(meta.commit).not.toMatch(/^https?:\/\//);
    expect(meta.commit).not.toContain('github.com');
    expect(meta.commit).not.toContain('/');
  });
});

describe('VC-813 (FR-816, FR-817): branch and Built when known', () => {
  it('passes branch and Built through exactly', () => {
    const meta = collectBuildMetadata({
      gitBranch: 'main',
      builtAt: '2026-09-05T19:09:35Z',
    });
    expect(meta.branch).toBe('main');
    expect(meta.built).toBe('2026-09-05T19:09:35Z');
  });
});

describe('VC-825 (FR-813, BR-802): tags exist but SHA unresolved', () => {
  it('shows {highest}+unknown', () => {
    expect(
      formatVersion({
        tags: ['v1.2.3'],
        headSha: null,
        headExactVersionTag: null,
      }),
    ).toBe('1.2.3+unknown');
    expect(shortSha(null)).toBe('unknown');
  });
});

describe('VC-819 (BR-807): format.ts exports the About strings', () => {
  it('exports glyph, labels, Close, and unknown exactly as the spec table', () => {
    expect(ABOUT_GLYPH).toBe('i');
    expect(ABOUT_LABEL).toBe('About');
    expect(ABOUT_VERSION_LABEL).toBe('Version');
    expect(ABOUT_BRANCH_LABEL).toBe('Branch');
    expect(ABOUT_COMMIT_LABEL).toBe('Commit');
    expect(ABOUT_BUILT_LABEL).toBe('Built');
    expect(ABOUT_CLOSE_LABEL).toBe('Close');
    expect(FORMAT_UNKNOWN).toBe('unknown');
  });
});

describe('shortSha / formatBuilt / resolveBranch edge cases', () => {
  it('lowercases and truncates a full SHA', () => {
    expect(shortSha('ABCDEF0123456789')).toBe('abcdef0');
  });

  it('rejects non-hex and too-short values', () => {
    expect(shortSha('zzzzzzz')).toBe(UNKNOWN);
    expect(shortSha('abc')).toBe(UNKNOWN);
    expect(shortSha('')).toBe(UNKNOWN);
    expect(shortSha(undefined)).toBe(UNKNOWN);
  });

  it('formats Date inputs to second-precision Z', () => {
    expect(formatBuilt(new Date('2026-09-05T19:09:35.123Z'))).toBe(
      '2026-09-05T19:09:35Z',
    );
    expect(formatBuilt(null)).toBe(UNKNOWN);
    expect(formatBuilt('not-a-date')).toBe(UNKNOWN);
  });

  it('prefers git branch over env, and skips detached HEAD', () => {
    expect(resolveBranch({ gitBranch: 'feature/x', envBranch: 'main' })).toBe(
      'feature/x',
    );
    expect(resolveBranch({ gitBranch: 'HEAD', envBranch: 'deploy-preview' })).toBe(
      'deploy-preview',
    );
    expect(resolveBranch({ gitBranch: null, envBranch: null })).toBe(UNKNOWN);
  });
});
