/**
 * Derive the release version from a commit message and the repository's tags
 * (spec 02-ci: FR-116, FR-117, BR-100, BR-101, BR-102).
 *
 * The bump comes from the commit *subject* alone, and the base version comes
 * from the highest `vX.Y.Z` tag — never from `package.json`, which FR-118
 * maintains as a mirror (BR-102). Everything below the CLI at the bottom is
 * pure: no git, no filesystem, no environment, so every row of BR-100's table
 * is verifiable by a unit test rather than by performing a real merge.
 *
 * Usage (the release workflow's `publish` job):
 *   git log -1 --format=%B | node scripts/derive-version.mjs --tags "$(git tag --list)"
 * Prints the derived version (e.g. `0.2.0`) on stdout, or nothing at all when
 * the commit type produces no release.
 */

/** The eleven accepted types (spec, "Conventional Commits grammar"). */
export const TYPES = [
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
];

/** BR-102: the version when no `vX.Y.Z` tag exists. */
export const BOOTSTRAP_VERSION = '0.1.0';

/** `<type>[(<scope>)][!]: <subject>` */
const SUBJECT = new RegExp(
  '^(' +
    TYPES.join('|') +
    ')' + // type
    '(\\(([^)]+)\\))?' + // optional non-empty scope
    '(!)?' + // optional breaking marker
    ': ' + // separator
    '(?=.*\\S)(.+)$', // non-empty subject
);

/** BR-100: which types bump which component. */
const BUMP_BY_TYPE = {
  feat: 'minor',
  fix: 'patch',
  perf: 'patch',
  revert: 'patch',
  chore: 'none',
  docs: 'none',
  style: 'none',
  refactor: 'none',
  test: 'none',
  build: 'none',
  ci: 'none',
};

/**
 * A `BREAKING CHANGE:` footer anywhere in the body signals a major bump, as
 * does the `!` marker. Conventional Commits also permits the hyphenated
 * `BREAKING-CHANGE:` spelling as a synonym.
 */
const BREAKING_FOOTER = /^[ \t]*BREAKING[ -]CHANGE[ \t]*:/im;

/**
 * Parse a commit message into its Conventional Commits parts.
 * An unrecognized subject is not an error (A-1, FR-117): it yields `null`,
 * which `deriveBump` maps to *none*.
 */
export function parseCommit(message) {
  const text = String(message ?? '').replace(/\r\n/g, '\n');
  const [subject = '', ...rest] = text.split('\n');
  const match = SUBJECT.exec(subject.trim());
  if (match === null) return null;
  const [, type, , scope, bang] = match;
  return {
    type,
    scope: scope ?? null,
    breaking: bang === '!' || BREAKING_FOOTER.test(rest.join('\n')),
  };
}

/**
 * BR-100 / BR-101: the bump a commit message produces — `'major'`, `'minor'`,
 * `'patch'` or `'none'`. A breaking marker wins over the type's own mapping,
 * including from a `0.x.y` version and including on a type that alone would
 * produce no release (BR-101).
 */
export function deriveBump(message) {
  const commit = parseCommit(message);
  if (commit === null) return 'none';
  if (commit.breaking) return 'major';
  return BUMP_BY_TYPE[commit.type] ?? 'none';
}

/** Parse `v1.2.3` / `1.2.3` into `[1, 2, 3]`, or `null` if it is not one. */
export function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value ?? '').trim());
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * BR-102: the highest `vX.Y.Z` tag, compared **numerically per component** so
 * `v0.10.0` outranks `v0.9.0` — a lexical sort gets that backwards. Tags that
 * are not plain `vX.Y.Z` (release candidates, unrelated labels) are ignored.
 * Returns `BOOTSTRAP_VERSION` when no such tag exists.
 */
export function highestVersion(tags) {
  const list = Array.isArray(tags) ? tags : String(tags ?? '').split(/\s+/);
  const parsed = list
    .map((tag) => parseVersion(tag))
    .filter((version) => version !== null);
  if (parsed.length === 0) return BOOTSTRAP_VERSION;
  parsed.sort(([aMaj, aMin, aPat], [bMaj, bMin, bPat]) =>
    bMaj - aMaj || bMin - aMin || bPat - aPat,
  );
  return parsed[0].join('.');
}

/** Apply a bump to a base version. Returns `null` for *none*. */
export function applyBump(baseVersion, bump) {
  const parsed = parseVersion(baseVersion);
  if (parsed === null) throw new Error(`not a version: ${baseVersion}`);
  const [major, minor, patch] = parsed;
  switch (bump) {
    // BR-101: major always resets minor and patch, even from 0.x.
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return null;
  }
}

/**
 * FR-116: the whole derivation. Returns the target version and the bump that
 * produced it; `version` is `null` when the commit produces no release
 * (FR-117).
 */
export function deriveVersion(message, tags) {
  const bump = deriveBump(message);
  const baseVersion = highestVersion(tags);
  return { bump, baseVersion, version: applyBump(baseVersion, bump) };
}

/* -------------------------------------------------------------------------- */

/** True when this module was run as a script rather than imported. */
const isMain = (() => {
  if (process.argv[1] === undefined) return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const at = argv.indexOf(name);
    return at === -1 ? undefined : argv[at + 1];
  };

  const tags = flag('--tags') ?? '';
  const messageFlag = flag('--message');
  const message =
    messageFlag ??
    (process.stdin.isTTY === true
      ? ''
      : await new Promise((resolve) => {
          let buffer = '';
          process.stdin.setEncoding('utf8');
          process.stdin.on('data', (chunk) => {
            buffer += chunk;
          });
          process.stdin.on('end', () => resolve(buffer));
        }));

  const { bump, baseVersion, version } = deriveVersion(message, tags);
  const subject = String(message).split('\n')[0].trim();

  if (version === null) {
    // FR-117: an explicit, successful "no release".
    console.error(`commit type produces no release: ${JSON.stringify(subject)}`);
    console.error(`base version ${baseVersion} left unchanged`);
  } else {
    console.error(`subject: ${JSON.stringify(subject)}`);
    console.error(`bump: ${bump}  base: ${baseVersion}  ->  ${version}`);
    // stdout carries the version alone, so the workflow can capture it.
    console.log(version);
  }
}
