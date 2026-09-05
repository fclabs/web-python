/**
 * BR-801: build-time About metadata injected by Vite `define` as
 * `__PYPLAY_BUILD_META__`. Readable synchronously with no I/O — the running
 * page never fetches version/branch/commit/built from the network.
 */

export type BuildMeta = {
  version: string;
  branch: string;
  commit: string;
  built: string;
};

declare const __PYPLAY_BUILD_META__: BuildMeta;

/** The four About field values baked into this bundle. */
export const buildMeta: BuildMeta = __PYPLAY_BUILD_META__;

/**
 * Keep the injected object in the live module graph. Without a top-level
 * side effect, Rollup drops an otherwise-unused import and the four strings
 * never reach `dist/` (BR-801). About UI (later) reads `buildMeta` directly;
 * this global is not part of the visitor-facing contract.
 */
(
  globalThis as typeof globalThis & { __pyplayBuildMeta?: BuildMeta }
).__pyplayBuildMeta = buildMeta;
