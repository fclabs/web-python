/**
 * Types for `build-metadata.mjs`, so unit tests under `tsconfig.json` can
 * import the module. Implementation stays plain ESM for Vite / Node.
 */

export declare const UNKNOWN: 'unknown';

export interface BuildMetaFields {
  version: string;
  branch: string;
  commit: string;
  built: string;
}

export interface FormatVersionInput {
  tags: readonly string[] | string | null | undefined;
  headSha: string | null | undefined;
  headExactVersionTag: string | null | undefined;
}

export interface ResolveBranchInput {
  gitBranch: string | null | undefined;
  envBranch: string | null | undefined;
}

export interface CollectBuildMetadataInput {
  tags?: readonly string[] | string | null;
  headSha?: string | null;
  headExactVersionTag?: string | null;
  gitBranch?: string | null;
  envBranch?: string | null;
  builtAt?: string | Date | null;
}

export declare function shortSha(fullSha: string | null | undefined): string;
export declare function formatBuilt(
  isoOrDate: string | Date | null | undefined,
): string;
export declare function formatVersion(inputs: FormatVersionInput): string;
export declare function resolveBranch(inputs: ResolveBranchInput): string;
export declare function collectBuildMetadata(
  inputs?: CollectBuildMetadataInput,
): BuildMetaFields;
export declare function readBuildMetadata(options?: {
  cwd?: string;
}): BuildMetaFields;
