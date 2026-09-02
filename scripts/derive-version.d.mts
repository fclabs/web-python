/**
 * Types for `derive-version.mjs`, so `tests/unit/derive-version.test.ts` — which
 * `tsconfig.json` type-checks — can import the module. The implementation stays
 * plain ESM because the release workflow runs it with bare `node`, without a
 * build or a loader.
 */

export type Bump = 'major' | 'minor' | 'patch' | 'none';

export interface ParsedCommit {
  type: string;
  scope: string | null;
  breaking: boolean;
}

export interface DerivedVersion {
  bump: Bump;
  baseVersion: string;
  /** `null` when the commit produces no release (FR-117). */
  version: string | null;
}

export declare const TYPES: string[];
export declare const BOOTSTRAP_VERSION: string;

export declare function parseCommit(message: string | null | undefined): ParsedCommit | null;
export declare function deriveBump(message: string | null | undefined): Bump;
export declare function parseVersion(
  value: string | null | undefined,
): [number, number, number] | null;
export declare function highestVersion(tags: readonly string[] | string | null | undefined): string;
export declare function applyBump(baseVersion: string, bump: Bump): string | null;
export declare function deriveVersion(
  message: string | null | undefined,
  tags: readonly string[] | string | null | undefined,
): DerivedVersion;
