# DECISIONS — About control

Append-only. One entry per non-obvious choice.

## D-001: Vite `define` for `__PYPLAY_BUILD_META__`  (Iteration 1)

**Context**: BR-801 requires build-time injection readable synchronously from `src/` with no runtime I/O. Plan allowed either Vite `define` or a generated `.ts` module.

**Decision**: Call `readBuildMetadata()` once when `vite.config.ts` loads; inject via `define: { __PYPLAY_BUILD_META__: JSON.stringify(...) }`. App code imports `buildMeta` from `src/build-meta.ts`, which assigns the object to `globalThis.__pyplayBuildMeta` so Rollup cannot tree-shake the literals before About UI exists. `src/main.ts` side-effect-imports `./build-meta`.

**Rejected**: Generated `src/build-meta.generated.ts` Vite plugin — more moving parts for the same observable; `define` already matches other baked constants in the ecosystem and keeps a single collector entrypoint.

**Consequences**: Iteration 2 must import `buildMeta` from `src/build-meta.ts` (not re-read git). The `globalThis` retain may be removed once the dialog reads all four fields (side effect then comes from DOM writes). Constant name `__PYPLAY_BUILD_META__` is fixed for this feature.

## D-002: NFR-805 branch-point SHA  (Iteration 1)

**Context**: VC-814 / NFR-805 measure gzipped app-payload delta against the tip before About code lands.

**Decision**: Branch-point SHA is `e569b8119e6ce797d49930fddcfb9fbec5fbd578` (`git rev-parse HEAD` immediately before Iteration 1 code changes).

**Rejected**: Using merge-base with `main` instead of the worktree tip — plan says record HEAD at start of Iteration 1.

**Consequences**: Iteration 4 must compare against this SHA; do not move the threshold without a dedicated commit.
