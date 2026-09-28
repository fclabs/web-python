/**
 * FR-1606: the stdin half of insert-at-caret.
 *
 * Kept out of `src/editor.ts` so it pulls in no `@codemirror/*` module, and out
 * of `src/main.ts` — the entry point is not unit-testable — so the
 * `setRangeText` offsets can be verified without a browser (VC-1606).
 * `src/main.ts` composes this with `insertAtCaret` from `src/editor.ts`.
 */

/**
 * FR-1606: insert `value` over the field's current selection and leave the
 * caret immediately after it. A field that has never been focused reports
 * `null` offsets, which resolve to the end of the value.
 *
 * No synthetic `input` event is dispatched — `submitStdin()` reads
 * `#stdin-input.value` directly — and focus is never moved (FR-1610), which is
 * what lets several characters be inserted in a row from the pane.
 */
export function insertIntoField(field: HTMLInputElement, value: string): void {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.setRangeText(value, start, end, 'end');
}
