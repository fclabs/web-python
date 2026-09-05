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

## D-003: Custom overlay modal (not native `<dialog>`)  (Iteration 2)

**Context**: Spec requires distinct `#about-backdrop` and `#about-dialog` with FR-806 backdrop dismiss, FR-808 focus trap, and FR-819 swallow of chrome activations under the modal.

**Decision**: Markup lives in `index.html` (start `hidden`). Behaviour in `src/about.ts` via `bindAboutControl(btn)`. Custom fixed overlay + sibling backdrop — not `HTMLDialogElement` / `showModal()`.

**Rejected**: Native `<dialog>` — its UA backdrop is not the `#about-backdrop` element VC-804 clicks, and mixing `::backdrop` with an explicit id complicates FR-819 vs FR-806 (geometric click on dimmed chrome dismisses; synthetic activation of `#btn-run` must not dismiss).

**Consequences**: Iteration 3+ keep calling `bindAboutControl`; do not switch to `<dialog>` without rewriting e2e that target `#about-backdrop`. Capture-phase document listener swallows non-backdrop chrome clicks while open.

## D-004: VC-812 coverage split (units + real-build e2e)  (Iteration 3)

**Context**: VC-812 requires all-`unknown` when git/host inputs are missing, and `#about-commit` with no `a[href]`. A production build on this machine has real git metadata, so e2e cannot force all-`unknown` without a test-double injection path.

**Decision**: Keep formatter + jsdom field-mount coverage of all-`unknown` in `tests/unit/build-metadata.test.ts`. Playwright `VC-812` asserts non-empty fields and plain-text commit on the real build. No query-flag / stub module for e2e.

**Rejected**: Runtime query flag or stub module to force `unknown` in Playwright — would add production surface area for a case already proven by pure units and the same `textContent` assignment path `about.ts` uses.

**Consequences**: Iteration 4+ must not drop the unit DOM mount case when claiming VC-812; the e2e title alone is not sufficient for all-`unknown`.

## D-005: `--about-backdrop` palette tokens for NFR-803  (Iteration 4)

**Context**: VC-815 measures backdrop distinction as the composited `#about-backdrop` `backgroundColor` against the page `--bg`. A single `color-mix(in srgb, var(--fg) 40%, transparent)` failed light (2.85:1) and collapsed in dark (~1.07:1) because mixing toward `transparent` darkens toward black.

**Decision**: Per-palette `--about-backdrop`: light uses 50% black alpha (scrim darkens white ≥ 3:1); dark uses 42% white alpha (scrim *lightens* the near-black page ≥ 3:1). `.about-backdrop { background: var(--about-backdrop); }`.

**Rejected**: Nesting the dialog inside the backdrop solely to measure dialog-vs-scrim adjacency — would change click-target geometry for FR-806/FR-819 without fixing the dark-mode scrim-vs-page measurement the audit actually samples.

**Consequences**: Iteration 5 docs should mention the dual-token scrim if discussing About chrome; do not “simplify” back to one `var(--fg)` mix.

## D-006: VC-817 matrix deferred on this host  (Iteration 4)

**Context**: NFR-806 / VC-817 requires VC-802/804/805/806 on eight pinned browsers. This worktree’s Playwright reports no launchable engine for edge-141/140, firefox-145/144, safari-26.1/26.0 (NFR-011).

**Decision**: Record VC-817 as **deferred** to maintainer `MATRIX=1` local runs. Chromium coverage of those four VCs remains green and is the CI stand-in.

**Rejected**: Marking VC-817 PASS from Chromium-only results — plan forbids claiming matrix PASS without the eight projects or an explicit deferral note.

**Consequences**: Iteration 5 / Final Verification may still cite Chromium; full matrix remains a local maintainer gate per `docs/architecture.md` browser-matrix notes.
