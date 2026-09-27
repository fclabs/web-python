# Iteration 4 — migrating the suite and clearing the audit gates

Goal: bring spec-03's surviving criteria, the rewritten ones and the
matrix / perf / presentation suites onto the insertion behaviour, and pass every
required gate (NFR-1601 – NFR-1604).

No `src/` file was touched. Everything below is tests and documentation.

## 1. Criteria — rewritten, retired, folded, re-run

### Rewritten, keeping the id

| VC | Was | Is now | File |
|---|---|---|---|
| **VC-307** | every value lands on the clipboard, and the editor never moves | *the editor moves exactly once per activation, for all 29 values* — `view.dispatch` is wrapped in the page and only document-changing dispatches are counted, so the lint pass (which dispatches diagnostics, never a change) cannot inflate it. One per activation, 29 times, with the caret after each value. | `tests/e2e/symbols.spec.ts` |
| **VC-308** | the copied `**` pastes as exactly two characters | *`**` inserts as exactly two characters, in one undo step* — `Inserted **`, document `x = 1**`, caret at 7, one `Ctrl/Cmd+Z` removes the pair. | `tests/e2e/symbols.spec.ts` |
| **VC-316** | copying mid-run interrupts neither the run nor its output | *a mid-run activation is inert unless a read is pending, and interrupts nothing either way* — folded onto **VC-1606** (no pending read → every button `aria-disabled`, no `disabled`, forced click / `Enter` / `Space` all no-ops) and **VC-1607** (pending read → the activation inserts into the field, Run stays disabled, Stop stays enabled, the same read is answered). Renamed `VC-316 / VC-1606, VC-1607`. | `tests/e2e/symbols.spec.ts` |
| **VC-317** | copying while a read is pending injects nothing into stdin | **inverted** — *an activation while a read is pending reaches the field, not the run.* See `DECISIONS.md` **D-09**. | `tests/e2e/symbols.spec.ts` |
| **VC-320** | opening and copying persists nothing | *inserting persists nothing of the pane's* — the workspace key legitimately changes through FR-1611's autosave; everything else is byte-identical and no key outside the allowed three appears. See **D-10**. | `tests/e2e/symbols.spec.ts` |
| **VC-323** | the pane is painted and **copies** within 100 ms | waits for `Inserted #` instead of `Copied #`; also cited against NFR-1601. | `tests/e2e/perf.spec.ts` |
| **VC-324** | matrix subset with the copy/paste and clipboard-denial legs | insertion legs: `**` inserts two characters and one undo removes them; mid-run every button is inert and a forced activation is a no-op; after the run `{` inserts and `#notices` is empty. The Chromium `clipboard-write` grant, the `context` and `browserName` fixtures and the denial stub are gone — insertion needs no permission (NFR-1604). | `tests/e2e/matrix.spec.ts` |
| **VC-051 / VC-071 / VC-514 / VC-322** | `Copied "`, `data-state="copied"` | `Inserted #`, `data-state="inserted"`, plus the two new `data-insert-target` outline samples. See **D-11**. | `tests/e2e/presentation.spec.ts` |

### Folded and deleted

- spec-03's **VC-314** (Enter/Space *copy* the focused character) is folded into
  **VC-1604**, which already asserts that pointer, `Enter` and `Space` produce
  an identical document, caret and `Inserted V`. A comment where it stood says
  so — without naming the retired id, which the success-criteria grep forbids.

### Retired, deleted outright

**VC-309**, **VC-310**, **VC-311**, **VC-312**, **VC-328**, **VC-333**, and
VC-327's clipboard leg. The `copiedButtons()` and `denyClipboard()` helpers went
with them. VC-333 passed (insertion is synchronous, so there is no in-flight
write to close over) and was still deleted, as the spec directs.

VC-327's surviving legs are unchanged: `PANE_OPEN=1` still runs the spec-01
suites with the pane open, and the comment in `tests/e2e/helpers.ts` now cites
BR-1601 and records that an *open* pane still changes nothing on its own,
because only an activation inserts.

```
$ grep -rn "VC-309\|VC-310\|VC-311\|VC-312\|VC-314\|VC-328\|VC-333" tests/
(no output)                                                              PASS
```

### Re-run unchanged, and green

VC-301 – VC-306, VC-313, VC-318, VC-319, VC-321, VC-322, VC-325, VC-326,
VC-329 – VC-332, A-305, and spec-01's VC-050 – VC-052 — all pass except
**VC-052** and **VC-315**, which fail on macOS only for the reason in §4 and
pass on the CI runner.

### Added

- **VC-1614** (FR-1601, FR-311, NFR-1603) — three tests in
  `tests/e2e/symbols.spec.ts`, where the geometry assertions already live: the
  core insertion plus ≥ 32 × 32 px hit areas in the seeded `horizontal` and
  `vertical` layouts at 1280 px, and at 701 px, 699 px and 375 px, each with
  `documentElement.scrollWidth` ≤ the viewport.
- **VC-1615** (NFR-1601) — a `longtask` observer across 29 insertions into a
  5 103-character all-comment program (no diagnostic, no fold, no syntax error,
  so what is timed is the insertion). Measured: **slowest activation → document
  change 0.1 ms, longest main-thread task 0 ms**, both against a 100 ms budget.

## 2. Commands and results

Every command was run from the worktree root with `PW_PORT_BASE=4273`. Nothing
was relaxed, skipped or loosened.

| Criterion | Command | Result |
|---|---|---|
| Build | `npm run build` | **PASS** — exit 0, `tsc --noEmit` clean |
| Unit | `npm run test:unit` | **PASS** — 27 files, 346 tests, exit 0 |
| Full suite | `PW_PORT_BASE=4273 npx playwright test --project=chromium` | **`339 passed, 6 failed, 2 skipped`** — every one of the six is pre-existing and local-only (§4). Zero failures attributable to this spec. |
| Pane suite | `PW_PORT_BASE=4273 npx playwright test --project=chromium tests/e2e/symbols.spec.ts` | **`45 passed, 1 failed`** — the one is VC-315 (§4). |
| Perf gate (NFR-1602) | `PW_PORT_BASE=4273 npm run audit:perf` | **`9 passed, 1 failed, 1 skipped`** — VC-323 and VC-326, which are what discharge NFR-1602, both pass; the failure is VC-814 (§4). |
| Contrast gate (NFR-1603) | `PW_PORT_BASE=4273 npm run audit:contrast` | **PASS** — `11 passed`, exit 0, including the two new `data-insert-target` outline samples in both palettes and both forced themes. |
| Matrix (NFR-1604) | `PW_PORT_BASE=4273 MATRIX=1 npm run test:matrix` | **`6 passed, 2 failed, 24 skipped`** — VC-324 passes on both launchable engines; the two failures are VC-432, proven pre-existing (§3). |
| Retired-VC grep | `grep -rn "VC-309\|VC-310\|VC-311\|VC-312\|VC-314\|VC-328\|VC-333" tests/` | **PASS** — no output |

### NFR-1602 — the payload, before and after

| Build | entry JS | gzipped entry JS | whole app, gzipped¹ |
|---|---|---|---|
| Iteration 1 baseline | 478.64 kB | 160.40 kB | — |
| Iteration 2 | 478.88 kB | 160.45 kB | — |
| Branch point `376d8dc`, rebuilt | 478.59 kB | 160.37 kB | **172 193 B** |
| This iteration (HEAD) | 479.70 kB | 160.75 kB | **172 590 B** |

¹ every precached first-party URL plus `/index.html`, gzipped at level 9 —
the number VC-814 and NFR-805 use.

**The whole spec adds 397 B gzipped**, against NFR-1602's 1 KB ceiling. No new
runtime asset, no new request, no new precache URL (still 13) and no new storage
key: VC-326 and VC-053 both pass unchanged.

## 3. NFR-1604 — the pinned matrix

`PW_PORT_BASE=4273 MATRIX=1 npm run test:matrix`

Result: **`6 passed, 2 failed, 24 skipped`** (58.6 s → 40.2 s).

```
[NFR-011] no engine available for: edge-141, edge-140, firefox-145, firefox-144,
          safari-26.1, safari-26.0 — those projects skip, so a matrix run cannot
          report a pass for them.
```

| Project | Engine | VC-324 | VC-432 |
|---|---|---|---|
| `chrome-141` | Chrome stable channel | **PASS** | FAIL — pre-existing, see below |
| `chrome-140` | bundled Chromium | **PASS** | FAIL — pre-existing, see below |
| `edge-141`, `edge-140` | **no launchable engine here** | skipped — *not* a pass | skipped |
| `firefox-145`, `firefox-144` | **no launchable engine here** | skipped — *not* a pass | skipped |
| `safari-26.1`, `safari-26.0` | **no launchable engine here** | skipped — *not* a pass | skipped |

**VC-324 passes on both engines that can be launched on this machine**, which is
what NFR-1604 asks of the migrated criterion. Six of the eight pinned projects
have no launchable engine here (this run was on macOS; the plan predicted two
unlaunchable on Linux) and are recorded as *skipped*, never as passes.

**VC-432 (NFR-406, the spec-04 layout control) fails on both, and is not this
spec's.** It asserts FR-409's 50–65 % editor-column band and measures 0.4533 at
`Desktop Chrome`'s 1280 × 720 viewport. Proven pre-existing: the same
`--grep "VC-432" --project=chrome-140` run against a **rebuilt `376d8dc` dist**,
served from a throwaway worktree, produces the identical `0.4533475079113924`.
Nothing spec-16 changed can move a panel width — the whole `src/styles.css`
delta is an `outline` on `[data-insert-target]`, a `.cm-cursor { display:
block }` rule and the `copied` → `inserted` state rename.

One VC-324 defect was found and fixed inside this iteration: the mid-run
forced-activation leg asserted `#symbol-status` was *empty*, but FR-1609's
2 000 ms window from the `**` insertion two legs earlier is often still open.
It now asserts the forced activation left the region **unchanged**, which is
what FR-1607 actually claims.

## 4. The six pre-existing failures — verdicts

Investigated as directed. **None was fixed, because none is a regression**, and
each verdict is evidenced rather than asserted. `DECISIONS.md` **D-12** carries
the reasoning; `docs/ci.md` carries it for the next reader.

| Test | Verdict | Evidence |
|---|---|---|
| `completion.spec.ts:47` VC-608 / VC-1103 | **Environmental (macOS)** | These five are the only tests in the suite that press `Control+m` (`grep -rn "Control+m" tests/e2e/` — exactly 6 hits in 4 files). `@codemirror/commands`, `dist/index.js:1816`: `{ key: "Ctrl-m", mac: "Shift-Alt-m", run: toggleTabFocusMode }`. On macOS the `mac` binding wins, tab-focus mode is never entered, and `Tab` indents (spec-11) instead of moving focus. A probe against the built site: eight `Tab` presses leave `document.activeElement` on `.cm-content` and insert four spaces. CI run `35538295273` on `main` at the branch point `376d8dc` shows `✓` for all five. |
| `layout.spec.ts:991` VC-431 | **Environmental (macOS)** | ” |
| `layout.spec.ts:1272` VC-407 | **Environmental (macOS)** | ” |
| `presentation.spec.ts:783` VC-052 | **Environmental (macOS)** | ” |
| `symbols.spec.ts:718` VC-315 | **Environmental (macOS)** | ” |
| `perf.spec.ts:755` VC-814 | **Environmental *and* a stale budget — pre-existing, not ours** | It skips on the runner (`baseline-build-about.json` records no app size for the runner's compressor) and runs here, where `darwin-arm64 zlib 1.2.12` is recorded. It measures the **whole app** against the spec-08 branch point `e569b81` (162 773 B) with a 4 096 B budget. Measured: HEAD 172 590 B (delta 9 817 B); the **unmodified branch point `376d8dc`, rebuilt in a throwaway worktree, is 172 193 B (delta 9 420 B)** — already 2.3× the budget before this branch existed. Spec-16 contributes 397 B of the 9 817. Moving that budget needs its own commit with its own numbers; it is not this spec's to move. |

## 5. Documentation

The expected-count line was badly stale (`94 passed, 1 skipped` for a suite of
347). It is now written in three places, with the true figures:

- `CLAUDE.md` — the *Pull requests and releases* paragraph.
- `docs/ci.md` — *The skipped tests, and the five that only fail locally*
  (formerly *The one skipped test*), which now also names the six local
  failures and why each is not a threshold to relax.
- `docs/ci.md` — the local-timings table.

## 6. Hands off to Iteration 5

- **The expected-count figure**: the suite is **347 tests**; the runner reads
  **`342 passed, 5 skipped`** (derived: 347 less VC-059 and the four
  baseline-gated skips that run `35538295273` shows skipping on the runner,
  with every other test observed green either locally or on that run); macOS
  reads **`339 passed, 6 failed, 2 skipped`**. Written in `CLAUDE.md` and in
  `docs/ci.md` twice.
- **Rewritten**: VC-307, VC-308, VC-316, **VC-317** (inverted — the spec's
  *Existing criteria* list still has it under "re-run unchanged, VC-317 –
  VC-322" and must be corrected), VC-320, VC-323, VC-324, and
  presentation's VC-051 / VC-071 / VC-322 / VC-514 samplers.
- **Folded**: VC-314 → VC-1604; VC-316 → VC-1606 / VC-1607.
- **Retired and deleted**: VC-309, VC-310, VC-311, VC-312, VC-328, VC-333,
  VC-327's clipboard leg.
- **Payload for the architecture note**: 172 193 B → 172 590 B gzipped,
  **+397 B**, inside NFR-1602's 1 KB ceiling; entry bundle 160.37 kB → 160.75 kB
  gzipped; 13 precache URLs, unchanged.
- **VC-1616** is Iteration 5's and is untouched here: `src/format.ts` still has
  to lose nothing (it already exports neither `formatSymbolCopied` nor
  `SYMBOL_COPY_FAILED`, removed in Iteration 2), and
  `specs/03-vertical-pane-frozen.md` is still unamended.
- **D-09, D-10, D-11, D-12** are this iteration's decisions. D-09 needs a spec
  edit; D-12 needs nothing but not to be re-investigated.
