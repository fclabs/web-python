/**
 * About dialog build metadata (spec 08-about-button: FR-812–FR-817, BR-801,
 * BR-802). Pure formatters turn git/host inputs into the four field strings;
 * `readBuildMetadata` shells out only at Vite config load time.
 *
 * Version semver order reuses `highestVersion` / `BOOTSTRAP_VERSION` from
 * `derive-version.mjs` (BR-102) — do not fork that ordering here.
 */

import { execSync } from 'node:child_process';
import {
  BOOTSTRAP_VERSION,
  highestVersion,
  parseVersion,
} from './derive-version.mjs';

/** BR-802: per-field fallback when a build-time input is missing. */
export const UNKNOWN = 'unknown';

/**
 * FR-815: first 7 lowercase hex characters of HEAD, or `unknown`.
 * Never produces a URL shape (BR-803).
 */
export function shortSha(fullSha) {
  if (fullSha == null) return UNKNOWN;
  const normalized = String(fullSha).trim().toLowerCase();
  if (!/^[0-9a-f]{7,}$/.test(normalized)) return UNKNOWN;
  return normalized.slice(0, 7);
}

/**
 * FR-817: ISO 8601 UTC with second precision ending in `Z`, or `unknown`.
 */
export function formatBuilt(isoOrDate) {
  if (isoOrDate == null || isoOrDate === '') return UNKNOWN;
  const date =
    isoOrDate instanceof Date ? isoOrDate : new Date(String(isoOrDate));
  if (Number.isNaN(date.getTime())) return UNKNOWN;
  // Drop sub-second fraction so the string ends in `…Z` at second precision.
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Parseable `vX.Y.Z` / `X.Y.Z` tags from a list or whitespace-separated string. */
function versionTags(tags) {
  if (tags == null) return [];
  const list = Array.isArray(tags) ? tags : String(tags).split(/\s+/);
  return list.filter((tag) => parseVersion(tag) !== null);
}

/**
 * FR-812 / FR-813 / FR-814 / BR-802: Version field string.
 *
 * @param {{
 *   tags: readonly string[] | string | null | undefined,
 *   headSha: string | null | undefined,
 *   headExactVersionTag: string | null | undefined,
 * }} inputs
 */
export function formatVersion({ tags, headSha, headExactVersionTag }) {
  // FR-812: HEAD is exactly a `vX.Y.Z` tag → strip the `v`, no `+` suffix.
  if (headExactVersionTag != null && headExactVersionTag !== '') {
    const exact = parseVersion(headExactVersionTag);
    if (exact !== null) return exact.join('.');
  }

  const commit = shortSha(headSha);
  const tagged = versionTags(tags);

  if (tagged.length > 0) {
    // FR-813 / VC-825: `{highest}+{shaPart}` (shaPart may be `unknown`).
    return `${highestVersion(tagged)}+${commit}`;
  }

  if (commit !== UNKNOWN) {
    // FR-814: no version tags → bootstrap base + short SHA.
    return `${BOOTSTRAP_VERSION}+${commit}`;
  }

  // BR-802: neither tags nor SHA.
  return UNKNOWN;
}

/**
 * FR-816: git branch name, else host env branch, else `unknown`.
 * A git detached HEAD reports as the literal `HEAD` and is treated as missing
 * so Netlify `BRANCH` / `HEAD` can supply the name.
 *
 * @param {{
 *   gitBranch: string | null | undefined,
 *   envBranch: string | null | undefined,
 * }} inputs
 */
export function resolveBranch({ gitBranch, envBranch }) {
  const fromGit =
    typeof gitBranch === 'string' ? gitBranch.trim() : '';
  if (fromGit !== '' && fromGit !== 'HEAD') return fromGit;

  const fromEnv =
    typeof envBranch === 'string' ? envBranch.trim() : '';
  if (fromEnv !== '') return fromEnv;

  return UNKNOWN;
}

/**
 * Compose the four About field strings (FR-812–FR-817, BR-802).
 *
 * @param {{
 *   tags?: readonly string[] | string | null,
 *   headSha?: string | null,
 *   headExactVersionTag?: string | null,
 *   gitBranch?: string | null,
 *   envBranch?: string | null,
 *   builtAt?: string | Date | null,
 * }} [inputs]
 * @returns {{ version: string, branch: string, commit: string, built: string }}
 */
export function collectBuildMetadata(inputs = {}) {
  const {
    tags = null,
    headSha = null,
    headExactVersionTag = null,
    gitBranch = null,
    envBranch = null,
    builtAt = null,
  } = inputs;

  return {
    version: formatVersion({ tags, headSha, headExactVersionTag }),
    branch: resolveBranch({ gitBranch, envBranch }),
    commit: shortSha(headSha),
    built: formatBuilt(builtAt),
  };
}

/** Run a git subcommand; return trimmed stdout or `null` on any failure. */
function tryGit(args, cwd) {
  try {
    return execSync(`git ${args}`, {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Build-time collector used by Vite (BR-801). Shells out / reads env only
 * here; on any failure the corresponding input is `null` so formatters yield
 * `unknown` (BR-802). Never throws — a missing git must not fail the build.
 *
 * @param {{ cwd?: string }} [options]
 * @returns {{ version: string, branch: string, commit: string, built: string }}
 */
export function readBuildMetadata(options = {}) {
  const cwd = options.cwd;
  const headSha = tryGit('rev-parse HEAD', cwd);

  const tagsRaw = tryGit("tag --list 'v*'", cwd);
  const tags = tagsRaw === null ? null : tagsRaw.split(/\n/).filter(Boolean);

  let headExactVersionTag = null;
  if (headSha !== null) {
    const pointsAt = tryGit('tag --points-at HEAD', cwd);
    if (pointsAt !== null) {
      for (const tag of pointsAt.split(/\n/)) {
        if (parseVersion(tag) !== null) {
          headExactVersionTag = tag;
          break;
        }
      }
    }
  }

  const gitBranch = tryGit('rev-parse --abbrev-ref HEAD', cwd);
  // Netlify (and similar): BRANCH preferred, HEAD as the alternate env name.
  const envBranch = process.env.BRANCH || process.env.HEAD || null;

  return collectBuildMetadata({
    tags,
    headSha,
    headExactVersionTag,
    gitBranch,
    envBranch,
    builtAt: new Date(),
  });
}
