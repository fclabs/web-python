# Implementation Plan: User-Selectable Light / Dark Color Mode

**Spec**: [`specs/05-dark-mode.md`](./05-dark-mode.md) (v1.1.0)
**Parent**: [`specs/01-static-python-web-frozen.md`](./01-static-python-web-frozen.md) (SHIPPED)
**Sibling**: [`specs/03-vertical-pane.md`](./03-vertical-pane.md) (SHIPPED)
**Source issue**: [fclabs/web-python#3](https://github.com/fclabs/web-python/issues/3)
**Review status**: `/review-spec` returned NEEDS WORK at v1.0.0 / v1.0.1 while
OQ-501 was open; all `[MUST]` / `[SHOULD]` / `[COULD]` review action items were
folded into v1.1.0 (before-first-paint, baseline `0a4194f`, `color-scheme`).
Open Questions is empty. This plan implements the spec as written.

We add a cycling toolbar color-mode control (☀ / ☽ / `S`) that forces Light,
forces Dark, or keeps System (OS preference sampled once per page load). The
choice paints chrome before first paint via an inline bootstrap, drives
CodeMirror's `EditorView.darkTheme`, and persists under `pyplay.theme.v1`.

---

## Ground rules for every iteration

1. **Gate** — do not start iteration N+1 until every success criterion of
   iteration N has been verified.
2. **Tests green** — each iteration leaves its own tests passing. The full
   regression suite runs once, at *Final Verification*.
3. **Commit** — each iteration ends with exactly one git commit of all its
   changes, using the stated commit message.
4. **Docs last** — all documentation ships in Iteration 4.
5. **No orphaned state** — if an iteration is abandoned mid-way, `npm run build`
   must still succeed and every previously passing test must still pass.

### Implementation decisions the spec does not fix (flagged, not assumed silently)

- **Bootstrap vs module duplication.** FR-515 requires a render-blocking inline
  `<script>` in `index.html` that must not wait on the Vite module. This plan
  keeps that script **self-contained** (read key, validate, set `data-theme`,
  optionally set a `data-effective` or rely on CSS for System). The module in
  `src/theme.ts` re-reads the same key with the same validation rules and owns
  cycling, persistence, control chrome, and editor updates. The two copies of
  the three-value allow-list are kept identical by a unit test that asserts the
  allow-list constant matches what the bootstrap string embeds (or by generating
  nothing — a one-line comment in both places citing BR-501 is enough if the
  vitest check proves the module's parser accepts only those three strings).
- **CSS selection.** Replace sole reliance on
  `@media (prefers-color-scheme: dark)` with:
  - `[data-theme="light"]` → light tokens + `color-scheme: light`
  - `[data-theme="dark"]` → dark tokens + `color-scheme: dark`
  - `[data-theme="system"]` → nest the existing dark token block under
    `@media (prefers-color-scheme: dark)`, light otherwise; set
    `color-scheme: light dark` only if needed, but FR-516 requires the *used*
    `color-scheme` to be the effective palette — so for System this plan sets
    `color-scheme` from the bootstrap/module via
    `document.documentElement.style.colorScheme = effective` (or a
    `data-effective="light|dark"` attribute that CSS maps to `color-scheme`).
  Token **values** stay byte-identical to today's light / dark sets (A-501).
- **Editor API.** Remove the `matchMedia` `change` listener from
  `src/editor.ts` (BR-502 / VC-509). Expose `setEditorColorScheme(view,
  effective: 'light' | 'dark')` that reconfigures the existing `colorScheme`
  compartment. `createEditor` takes an initial `effective` from the theme
  module instead of reading `matchMedia` itself.
- **Parent privacy / sibling storage asserts.** Spec-01's VC-058 /
  `tests/e2e/privacy.spec.ts` and spec-03's VC-320 currently require
  `localStorage` keys `=== ['pyplay.program.v1']`. Iteration 2 amends those
  asserts to allow `pyplay.theme.v1` when present (parent persisted-state
  amendment + BR-501), without weakening “no cookies / no IndexedDB / no
  session storage”.
- **New files.** `src/theme.ts` (preference parse/cycle/apply, editor hookup
  helper), `tests/unit/theme.test.ts`, `tests/e2e/theme.spec.ts`. Strings in
  `src/format.ts`. Bootstrap stays inline in `index.html`. CSS stays in
  `src/styles.css`.

---

## Iteration 1: Bootstrap, CSS selection, theme module, editor decoupling

**Goal**: First paint and CodeMirror already follow a resolved preference
(default System or a pre-seeded `pyplay.theme.v1`) with no live OS listener.
No toolbar control yet.

**Scope**:
- `index.html`: render-blocking inline bootstrap in `<head>` **before** any
  stylesheet link that paints chrome colours (FR-515, BR-505, A-506). It:
  - reads `localStorage['pyplay.theme.v1']` inside try/catch;
  - accepts only exact `light` | `dark` | `system`, else treats as `system`
    (FR-505, FR-507 load path);
  - sets `document.documentElement.dataset.theme` to that preference
    (FR-514);
  - samples `matchMedia('(prefers-color-scheme: dark)')` **once** and sets the
    effective `color-scheme` (FR-516, BR-502, BR-506) — does **not** register a
    `change` listener.
- `src/styles.css`: retarget palette application per the CSS decision above;
  keep token values unchanged (A-501). Ensure forced Light under OS dark and
  forced Dark under OS light paint the correct `--bg` (FR-508).
- `src/theme.ts`: `THEME_KEY`, `ThemePreference`, `parsePreference`,
  `effectivePalette(preference, osDarkSample)`, `readOsDarkOnce()`,
  `applyDocumentTheme(preference)` (sets `data-theme` + `color-scheme`),
  `loadPreference()` / `savePreference()` using `getLocalStorage()` from
  `src/storage.ts` (BR-501, BR-504). Capture the OS sample once at module init
  and reuse it for mid-session cycles onto `system` (A-504, BR-502).
- `src/editor.ts`: delete the `matchMedia` change listener; take initial
  effective palette from the caller; export `setEditorColorScheme` (BR-502,
  BR-503).
- `src/main.ts`: on boot, `loadPreference()` → `applyDocumentTheme` (idempotent
  with bootstrap) → pass effective into `createEditor`.
- `tests/unit/theme.test.ts`: allow-list parsing, cycle order
  `light → dark → system → light`, effective-palette resolution, invalid →
  `system`.
- First slice of `tests/e2e/theme.spec.ts` for load-time behaviour (no button
  asserts yet).

**Success criteria**:
- `npx vitest run tests/unit/theme.test.ts` passes — parse / cycle / effective
  resolution (**BR-501**, **BR-503**, data half of **FR-502** / **FR-507**).
- `npx playwright test --grep "VC-504|VC-505|VC-507|VC-521|VC-522|VC-509"`
  passes — **VC-504** (absent key → System under each OS), **VC-505** (stored
  light/dark override OS; `data-theme` set), **VC-507** (forced wins),
  **VC-521** (first paint / bootstrap before module — assert `data-theme` and
  `--bg` / body background without waiting on the control), **VC-522**
  (`colorScheme` matches effective), **VC-509** (no
  `prefers-color-scheme` `change` / `addListener` left in the shipped editor or
  theme module that updates chrome/editor).
- `npm run build` succeeds; existing `npx playwright test --grep "VC-051|VC-071"`
  still pass when Playwright drives OS `colorScheme` light/dark with preference
  left at System (parent path unchanged for System).

**Commit message**: `feat: resolve color mode before paint and drop live OS sync`

---

## Iteration 2: Toolbar control, cycle, persistence, tab order

**Goal**: Visitors can cycle Light → Dark → System from a toolbar icon button;
the choice persists and updates chrome + editor immediately.

**Scope**:
- `index.html`: `#btn-theme` as last toolbar control, immediately after
  `#btn-symbols` (FR-501). Empty or placeholder glyph; module fills it. Not
  routed through `setInert()` (same posture as Symbols).
- `src/format.ts`: `THEME_LABELS`, `formatThemeAccessibleName(label)`, glyphs
  `☀` / `☽` / `S` quoted from *Mode table* / *User-visible strings* (FR-503,
  FR-504).
- `src/theme.ts`: wire the button — on click / activation advance preference
  (FR-502), `applyDocumentTheme`, `setEditorColorScheme`, `savePreference`
  (FR-512), refresh glyph / `title` / `aria-label` (FR-503, FR-504).
- Minimal `#btn-theme` CSS: ≥ 32 × 32 px hit area (NFR-504), visible focus ring
  (FR-513), no adjacent visible mode-name text.
- Amend `tests/e2e/privacy.spec.ts` (VC-058) and `tests/e2e/symbols.spec.ts`
  (VC-320) so allowed `localStorage` keys are `pyplay.program.v1` and,
  optionally, `pyplay.theme.v1` — never any other key (parent / sibling
  amendments).
- Amend `tests/e2e/presentation.spec.ts` / symbols tab-order tests that assert
  “Symbols is last” or enumerate toolbar stops (**VC-052**, sibling **VC-301** /
  **VC-315**) to expect `#btn-theme` after Symbols.
- Extend `tests/e2e/theme.spec.ts` for control + cycle + persistence.

**Success criteria**:
- `npx playwright test --grep "VC-501|VC-502|VC-503|VC-511|VC-512|VC-517|VC-518|VC-519"`
  passes — **VC-501** (placement), **VC-502** (full cycle + storage),
  **VC-503** (glyph / title / accessible name), **VC-511** (tab after Symbols,
  focus ring, Enter/Space), **VC-512** (`data-theme` + `colorScheme` after
  each cycle), **VC-517** (only theme key added; program key untouched),
  **VC-518** (chrome `--bg` agrees with editor dark flag), **VC-519** (Symbols
  still opens; theme follows it).
- `npx playwright test --grep "VC-301|VC-315|VC-052"` passes under the sibling /
  parent amendments (Symbols no longer last; theme in tab order).
- `npx playwright test tests/e2e/privacy.spec.ts` passes with the two-key
  allow-list.

**Commit message**: `feat: add cycling toolbar control for light/dark/system`

---

## Iteration 3: Failure paths, frozen System sample, editor integrity

**Goal**: Storage failures stay silent; System ignores live OS flips; cycling
never mutates the editor buffer.

**Scope**:
- Harden `savePreference` / button handler for throw / quota (FR-507 write
  path, BR-504): UI still advances; no notice.
- E2E coverage for corrupt values (`""`, `Light`, JSON), read throw, write
  throw mid-cycle (**VC-506**).
- E2E: load System under OS light, flip emulated scheme without reload →
  chrome/editor stay light; reload under dark → dark (**VC-508**). Reinforce
  **VC-509** if Iteration 1 left any gap.
- E2E: non-empty doc, mid-buffer caret, undo depth ≥ 1, cycle three ways →
  doc / caret / undo / scroll unchanged; editor dark flag tracks effective
  (**VC-510**, FR-511).
- Confirm bootstrap and module never show a theme notice (grep notices /
  assert `#notices` empty on theme paths).

**Success criteria**:
- `npx playwright test --grep "VC-506|VC-508|VC-509|VC-510"` passes.
- Manually spot-check: with DevTools → Sensors / prefers-color-scheme, on
  System, flipping OS does nothing until reload (documents VC-508 for the
  implementer; automated Playwright emulation is the gate).

**Commit message**: `fix: keep theme resilient and System load-scoped`

---

## Iteration 4: Budgets, contrast, matrix, documentation

**Goal**: Prove NFR budgets and contrast under forced overrides; ship docs;
mark the spec SHIPPED.

**Scope**:
- Extend contrast sampling (`tests/e2e/presentation.spec.ts` /
  `npm run audit:contrast`) for forced Light under OS dark and forced Dark
  under OS light, including `#btn-theme` glyph and focus ring (**VC-514**,
  NFR-502, NFR-503; amends parent VC-051 / VC-071).
- Layout check at 375 × 667 for `#btn-theme` (**VC-515**, NFR-504).
- Perf + bundle delta vs commit **`0a4194f`** (**VC-513**, NFR-501, NFR-505,
  BR-505) — mirror the measurement approach used for spec-03's VC-323 / VC-326
  (app payload only; Pyodide/Ruff by digest).
- Matrix subset (**VC-516**, NFR-506): VC-502, VC-505, VC-507, VC-508, VC-510,
  VC-511 on each pinned engine via `npm run test:matrix` (or a dedicated grep
  list in `tests/e2e/matrix.spec.ts`).
- Full regression (**VC-520**).
- **Documentation** (this iteration only):
  - `README.md`: one line that visitors can force light/dark or follow system;
    mention `pyplay.theme.v1`.
  - `docs/architecture.md`: short *Color mode* section — bootstrap vs module,
    `data-theme` vs `color-scheme` (BR-506), load-scoped System (BR-502),
    editor compartment driven by effective palette.
  - `docs/deployment.md`: explicit no-op for headers / worker / assets
    (BR-505).
  - `CONTRIBUTING.md` (if it lists persisted keys or toolbar controls): add
    `pyplay.theme.v1` and `#btn-theme`.
  - `specs/05-dark-mode.md`: Status → **SHIPPED**, add *Verification record*
    mirroring spec-03's table (which test file covers which VCs).
  - Update sibling note in `specs/03-vertical-pane.md` only if that repo
    convention requires a cross-link; otherwise the amendments live in
    spec-05 and the amended tests are enough.

**Success criteria**:
- `npm run audit:contrast` passes for System-driven and forced-opposite
  palettes — **VC-514**.
- `npx playwright test --grep "VC-515"` passes — **VC-515**.
- `npm run audit:perf` passes — **VC-513** (≤ 100 ms switch, ≤ 4 KB gzipped vs
  `0a4194f`, zero new assets / requests).
- `npm run test:matrix` passes for the VC-516 subset — **VC-516**.
- `npm test && npm run audit:perf && npm run audit:contrast` passes —
  **VC-520**.
- Every doc listed in scope is updated in this commit; no earlier commit
  contains a partial version of any of them.

**Commit message**: `feat: verify color-mode budgets and document the control`

---

## Final Verification

Cross-check every requirement in the spec.

| Requirement | VC(s) | Iteration | Verification |
|---|---|---|---|
| FR-501 | VC-501 | 2 | `--grep "VC-501"`: `#btn-theme` last, after Symbols |
| FR-502 | VC-502 | 2 | `--grep "VC-502"`: cycle light→dark→system→light + chrome/editor |
| FR-503 | VC-503 | 2 | `--grep "VC-503"`: glyphs ☀ / ☽ / `S` only |
| FR-504 | VC-503 | 2 | `--grep "VC-503"`: `title` + `Color mode: <label>` |
| FR-505 | VC-504, VC-521 | 1 | absent key → System; first paint under OS dark |
| FR-506 | VC-505, VC-521 | 1 | stored preference restored; first paint |
| FR-507 | VC-506 | 3 | corrupt/read fail → System; write fail still cycles UI |
| FR-508 | VC-507 | 1 | forced overrides opposite OS |
| FR-509 | VC-504, VC-508 | 1, 3 | System resolves from load-time OS sample |
| FR-510 | VC-508, VC-509 | 1, 3 | no live update; no change listener |
| FR-511 | VC-510 | 3 | editor doc/caret/undo/scroll preserved |
| FR-512 | VC-502, VC-517 | 2 | canonical `pyplay.theme.v1` only |
| FR-513 | VC-511 | 2 | tab after Symbols; Enter/Space; focus ring |
| FR-514 | VC-512, VC-505 | 1, 2 | `data-theme` mirrors preference |
| FR-515 | VC-521, VC-505 | 1 | bootstrap before first paint |
| FR-516 | VC-512, VC-522 | 1, 2 | `color-scheme` = effective |
| BR-501 | VC-502, VC-517 | 2 | only three canonical strings / one key |
| BR-502 | VC-508, VC-509 | 1, 3 | load-scoped OS sample |
| BR-503 | VC-507, VC-518 | 1, 2 | chrome and editor share effective |
| BR-504 | VC-506, VC-517 | 3 | silent persistence failure |
| BR-505 | VC-513 | 4 | no new assets; inline bootstrap only |
| BR-506 | VC-512, VC-522 | 1, 2 | preference attr vs effective `color-scheme` |
| NFR-501 | VC-513 | 4 | `audit:perf` ≤ 100 ms |
| NFR-502 | VC-514 | 4 | text contrast ≥ 4.5:1 forced + System |
| NFR-503 | VC-514 | 4 | non-text ≥ 3:1 forced + System |
| NFR-504 | VC-515 | 4 | 375 px; hit ≥ 32 × 32 |
| NFR-505 | VC-513 | 4 | ≤ 4 KB gzipped vs `0a4194f` |
| NFR-506 | VC-516 | 4 | matrix subset on 8 engines |
| VC-519 (sibling) | VC-519 | 2 | Symbols still works; theme after it |
| VC-520 (regression) | VC-520 | 4 | full `npm test` + audits |
| VC-051 / VC-071 (parent) | VC-514 | 4 | forced-opposite sampling |
| VC-052 (parent) | VC-511 | 2 | tab order includes `#btn-theme` |
| VC-058 (parent privacy) | — | 2 | allow-list gains `pyplay.theme.v1` |
| VC-301 / VC-315 (sibling) | VC-519 + amended greps | 2 | Symbols no longer last |

**Final acceptance test**:

```bash
npm run build
npx vitest run
npx playwright test                 # VC-5xx + amended parent/sibling suites
npm run audit:contrast              # VC-514 and parent VC-051 / VC-071
npm run audit:perf                  # VC-513 vs baseline 0a4194f
npm run test:matrix                 # VC-516 subset
```

No manual device check is required beyond what Playwright covers; A-505
(glyph legibility) is discharged by VC-503 + VC-515 on the matrix browsers.
