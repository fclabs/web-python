# Iteration 3 — State preservation, side-effect proof, budgets, storage surface

Branch `feat/editor-font-size`. Commits: baseline re-pin `8329112` (`test(perf): re-pin the About gzip baseline to 424e43c`) then
Iteration 3 (`test(editor): prove font size changes keep editor state and stay within budgets`; SHA: `git log -1`).

## Criteria results
1. PASS - `npm run build && npx playwright test tests/e2e/fontsize.spec.ts`: 36 passed (VC-1308, 1310, 1318, 1319, 1325, 1326, 1321 x2 + It. 2).
2. PASS - `npm run audit:perf`: 7 passed, 1 skipped (VC-1206, no darwin baseline; pre-existing). VC-814 green after the pin move.
   gzip first-party delta vs 424e43c: +1461 B (VC-814 output; 169,273 vs 167,816-167,819 by my own script) <= 2048. Precache URLs 13 = 13.
   Latency (VC-1319): 13.3-23.9 ms over 24/12/20/16/14, no long task.
3. PASS - `npm run audit:contrast`: 10 passed incl. VC-1321 light + dark (button, border, focus ring, menu border, items unchecked /
   focused+checked / checked idle, item focus ring, check mark).
4. PASS - privacy + persistence + editor + lint specs: 26 passed, 1 skipped (VC-1206, pre-existing).
5. PASS - `npx tsc --noEmit`; `npm run test:unit` 309 passed.
6. PASS - no threshold or tolerance relaxed. Baseline re-pinned (not relaxed): `baseline-build-about.json` -> 424e43c, 167816 B; threshold 4096 B.

## Files
Added: this record. Changed: `tests/e2e/fontsize.spec.ts` (+7 VCs), `tests/e2e/privacy.spec.ts` (documented key set), `package.json`
(audit:contrast grep), `specs/13-editor-font-size.md` (VC-1325 wording), CONTEXT/DECISIONS. Separate commit: `baseline-build-about.json`,
`CONTRIBUTING.md` pin table. Production code: none.

## Deviations
- VC-1325 reworded (D-007). VC-814 pin moved (D-008). Both user decisions.
- VC-1308 asserts line 80 first visible before and visible after (it was also first visible after, 3 runs).

## Gotchas
- Off-screen line heights are estimates: converge scrollTop over several frames before asserting "first visible line".
- `record-baselines.mjs --keep` leaves a worktree; remove with `git worktree remove --force`.
- Stale references to `e569b81` remain only in frozen spec-06's history line (intentional).

## For the next iteration
- Docs must state: CSS-variable mechanism, no measure/scroll code needed (D-006), storage surface now six things, pin table in
  CONTRIBUTING.md already updated. Run `MATRIX=1 npm run test:matrix -- --grep "VC-13"`; write VC-1324 as its own test.
- Judge internal vs documented: D-001/D-006/D-009 internal; D-002..D-005, D-007, D-008 touch docs or the spec.
