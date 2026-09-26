# Iteration 3 — the stdin target and the insertion-target outline

Goal: make the stdin field a live target while a read is pending, track the
last-focused target, and outline the resolved target while the pane holds
focus (FR-1605, FR-1606, FR-1608, FR-1610, NFR-1603).

## What changed

### `src/main.ts`

- `import { insertIntoField } from './insert';` — the module's first importer
  since Iteration 1.
- `const symbolPaneEl = need('symbol-pane')` hoisted out of the `SymbolPane`
  construction, so `main.ts` can answer "does the pane hold focus" without the
  pane exposing a predicate (BR-1601, BR-1604).
- `onInsert`'s `'stdin'` branch: restore `stdinCaret` when the field is
  unfocused (D-08), then `insertIntoField(stdinInput, value)`. No `focus()`, no
  synthetic `input` event, nothing else on the page written to.
- Three new `boot()`-scoped `let`s: `lastFocusedTarget` (written **only** by
  the `focusin` listener), `stdinCaret` (D-08) and `lockedTarget` (the
  resolution the last `syncControls()` pass locked against).
- `resolveInsertTarget()` completed (table below).
- `syncControls()` records `lockedTarget`, calls `symbolPane.setLocked(...)` as
  before, and now also calls `syncInsertTargetOutline()`.
- After the `#stdin-input` / `#btn-eof` declarations: `markInsertTarget()`,
  `paneHoldsFocus()`, `syncInsertTargetOutline()`, and the two document-level
  listeners (`focusin`, `focusout`).
- `stdinPending()` and `stdinIdle()` each end with `syncControls()`
  (`DECISIONS.md` **D-06**); `stdinIdle()` also clears `stdinCaret`.

### `src/styles.css`

Two rules, immediately after `.symbol[data-state='inserted']`.

### `tests/e2e/symbols.spec.ts`

Imports `failures` / `measureContrast` from `./contrast`. A new spec-16
section at the end of the file with `ECHO_READ`, `insertTargetElements()`,
`focusSymbol()` and five tests: VC-1607, VC-1608, VC-1609 (×2 palettes, plus a
stdin-field variant) and VC-1613's remaining leg. The Iteration-2 section
header no longer says the stdin legs are pending.

Nothing else was touched. No legacy clipboard-era test was edited, skipped or
deleted.

## Hands off

### The final `resolveInsertTarget()` behaviour

```ts
const stdinLive  = !isInert(stdinInput);            // FR-029 / FR-032
const editorLive = !running && active !== null && bytes !== null && isText(bytes);
if (lastFocusedTarget === 'stdin' && stdinLive) return 'stdin';
if (editorLive) return 'editor';
return null;
```

| last focused | stdin live (read pending) | editor live | resolves to |
|---|---|---|---|
| *(neither yet)* → `editor` | no | yes | `editor` |
| *(neither yet)* → `editor` | no | no | `null` |
| `editor` | no | yes | `editor` |
| `editor` | yes | yes | **`editor`** — the last-focused target wins |
| `editor` | yes | no | **`null`** — see `DECISIONS.md` **D-07** |
| `stdin` | yes | yes | **`stdin`** — the last-focused target wins |
| `stdin` | yes | no | `stdin` (a run blocked on `input()`; the normal case) |
| `stdin` | no | yes | `editor` (the field is idle, so the fallback takes it) |
| `stdin` | no | no | `null` |

**When both are live the last-focused one wins**; before either has been
focused the record is `'editor'`, so a fresh load resolves to the editor.
`null` locks every character button through `setLocked` (FR-1607).

`lastFocusedTarget` is written only when the `focusin` target is
`view.contentDOM` or inside it, or is `stdinInput` itself. A toolbar control, a
symbol button, the console, the Files tree — anything else leaves it unchanged
(FR-1605). The listener dismisses nothing (FR-1610).

### Where `data-insert-target` is added and removed

`src/main.ts` is the only writer. Both paths go through

```ts
function markInsertTarget(target: 'editor' | 'stdin' | null): void {
  view.contentDOM.toggleAttribute('data-insert-target', target === 'editor');
  stdinInput.toggleAttribute('data-insert-target', target === 'stdin');
}
```

so two targets at once is unrepresentable. It is set (to `resolveInsertTarget()`)
whenever `paneHoldsFocus(document.activeElement)` — i.e. `symbolPane.isOpen`
**and** `#symbol-pane` contains the active element — and cleared otherwise:

| trigger | effect |
|---|---|
| `document` `focusin` | records the target, then `syncControls()` when the resolution changed (D-06), otherwise `syncInsertTargetOutline()` alone |
| `document` `focusout` whose `relatedTarget` is outside the pane | `markInsertTarget(null)` (focus has not moved yet, so `document.activeElement` is not consulted) |
| `syncControls()` (every control pass, including `stdinPending()` / `stdinIdle()`) | re-derives it from the current resolution |

The attribute value is the empty string; only its presence is meaningful. The
pane closing (toggle or `Escape`) moves focus to `#btn-symbols`, which is
outside `#symbol-pane`, so the `focusin` pass clears it.

### The CSS selectors that paint it — Iteration 4's contrast assertions

`src/styles.css`, directly after `.symbol[data-state='inserted']`:

```css
.cm-editor .cm-content[data-insert-target],
.stdin-input[data-insert-target] {
  outline: 2px dashed var(--focus);
  outline-offset: -2px;
}

.cm-editor:not(.cm-focused):has(.cm-content[data-insert-target]) .cm-cursor {
  display: block;
}
```

- The measurable property is **`outlineColor`** on
  `.cm-content[data-insert-target]` and on `#stdin-input[data-insert-target]`.
  The token is `--focus` (`#0b5bd3` light, `#8ab6ff` dark) — the same one
  NFR-013's focus ring uses, so it clears 3:1 in both palettes; VC-1609
  measures it with `measureContrast` / `failures(…, 3)` in both.
- To put an element into that state from a test: open the pane and focus a
  character button (`symbolButton(page, '#').focus()`). The stdin variant
  additionally needs a program blocked on `input()`.
- The caret rule exists because `@codemirror/view`'s base theme sets
  `.cm-cursor { display: none }` unless the view has `.cm-focused`. The cursor
  layer draws its markers regardless of focus, so re-showing it is enough.
  `:has()` is used rather than a sibling combinator so the rule does not depend
  on the order of `.cm-content` and `.cm-cursorLayer` inside `.cm-scroller`.

### `submitStdin()` needs no synthetic event

Confirmed unchanged: `submitStdin()` reads `const text = stdinInput.value;`
directly, so `setRangeText` alone is enough for the worker to receive what the
pane inserted. `insertIntoField` dispatches no `input` event and never calls
`focus()`; VC-1607 proves the round trip by asserting the program's stdout.

## Success criteria

Every command was run from the worktree root, with `PW_PORT_BASE=4273` for
Playwright. Nothing was relaxed, skipped or loosened.

| Criterion | Command | Result |
|---|---|---|
| Build | `npm run build` | **PASS** — exit 0 (`tsc --noEmit` clean) |
| Unit | `npm run test:unit` | **PASS** — 27 files, 346 tests, exit 0 |
| Pane suite | `PW_PORT_BASE=4273 npx playwright test --project=chromium tests/e2e/symbols.spec.ts` | **PASS for this iteration** — `12 failed, 37 passed`, and the 12 are exactly the documented baseline: the 11 clipboard-era tests (VC-307, VC-308, VC-309, VC-310, VC-311, VC-312, VC-328, VC-314, VC-316, VC-317, VC-320) plus pre-existing `symbols.spec.ts:891` VC-315. VC-1607, VC-1608, VC-1609 (×3) and VC-1613's new leg pass, and every Iteration-2 test (VC-1601 – VC-1606, VC-1610 – VC-1613) still passes. |
| FR-1610 / BR-1601 | `grep -n "focusin\|focusout\|data-insert-target" src/symbol-pane.ts` | **PASS** — no output (exit 1) |
| Contrast gate | `PW_PORT_BASE=4273 npm run audit:contrast` | **FAIL — none of it ours.** `8 failed, 3 passed`; all eight fail at `presentation.spec.ts:210`, `expect(#symbol-status).toHaveText('Copied "')`, which is Iteration 4's migration. The new outline is measured at ≥ 3:1 in both palettes by VC-1609 and passes. No threshold was touched. |
| Legacy tests untouched | `git diff --stat tests/` | **PASS** — `tests/e2e/symbols.spec.ts` gains an import line and a new section at the end; no existing test body changed. |

### Two defects found and fixed inside this iteration

1. **The Files tree stopped taking clicks.** The `focusin` listener originally
   called `syncControls()` unconditionally, and `syncControls()` calls
   `filePane.setEditingLocked()`, which re-renders the whole file list — so the
   button under the pointer was replaced between pointer-down and click and
   VC-1606's binary-file leg could not select `blob.bin`. Fixed with
   `lockedTarget`: `focusin` re-runs the full pass only when the resolution
   actually changed, and otherwise updates the outline alone.
2. **Five stdin insertions accumulated in reverse** (`...%|#_`). Chromium
   discards an unfocused field's programmatically set selection at the next
   pointer-down. `DECISIONS.md` **D-08** has the measurement and the fix
   (`stdinCaret` in `src/main.ts`; `src/insert.ts` untouched).

## Notes for Iteration 4

- **The contrast samplers to add**, if it wants the outline in
  `presentation.spec.ts` as well as in VC-1609: the two selectors above with
  `prop: 'outlineColor'`. They only resolve while the pane is open **and** a
  character button holds focus, which the existing `paintEverySurface()` does
  not do — it would need one extra `focus()` before the sample.
- **VC-317** ("copying while a read is pending injects nothing into stdin") is
  now contradicted by FR-1606 as well as by the string it asserts: a pending
  read *is* a live target and the pane deliberately writes into the field.
  Iteration 4 should retire or invert it, not repair it.
- **VC-1606**'s "a running program with no pending read locks every button"
  still holds and still passes; the lock is now re-derived on focus changes and
  on every stdin transition (D-06).
- `DECISIONS.md` **D-07** records a reachable state FR-1607's enumeration does
  not cover (editor focused during a pending read → the pane locks). No
  criterion exercises it; Iteration 5 owns the spec text.
