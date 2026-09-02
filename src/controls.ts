/**
 * Inert-but-focusable controls (FR-049 vs FR-054 / FR-058).
 *
 * FR-049 asks that `Tab` from page load reach *every* control — Run, Stop,
 * Clear console, Copy code, Format, the editor, the stdin field, Send EOF and
 * the diagnostics entries — each showing a visible focus indicator. FR-054 and
 * FR-058 ask that Stop and Format be "visibly disabled" and "non-activatable
 * by pointer or keyboard" whenever they do not apply.
 *
 * A natively `disabled` control satisfies the second pair and violates the
 * first: the browser removes it from the tab order outright. So none of the
 * conditionally-inert controls use the `disabled` attribute. They use
 * `aria-disabled="true"` plus an explicit `tabindex="0"`, which keeps them
 * focusable and announced as disabled, and every activation path — click,
 * `Enter`, `Space`, `Ctrl/Cmd+Enter`, `Shift+Alt+F`, `Ctrl+D` — is guarded by
 * {@link isInert} in its handler. The stdin field additionally carries
 * `readonly`, so FR-032's "does not accept text" holds while it stays
 * reachable.
 *
 * `aria-disabled` is also what Playwright's `toBeDisabled()` / `toBeEnabled()`
 * report, so the existing inertness criteria (VC-064, VC-070) read unchanged.
 */

/**
 * The controls that are conditionally inert rather than natively disabled.
 *
 * spec-04 FR-415 applies the same treatment to a `role="radiogroup"` element,
 * which is a `<div>`, so the parameter type is the general one. The behaviour
 * is unchanged: the `readonly` branch below is guarded by an `instanceof`
 * that only the stdin field satisfies.
 */
export type InertControl = HTMLElement;

/**
 * Mark a control inert or live. Writes only on an actual change, so a
 * `MutationObserver` watching `aria-disabled` sees one record per transition.
 */
export function setInert(el: InertControl, inert: boolean): void {
  const next = inert ? 'true' : 'false';
  if (el.getAttribute('aria-disabled') !== next) el.setAttribute('aria-disabled', next);
  // FR-032: an inert text field must not accept text. `readonly` refuses it
  // while — unlike `disabled` — leaving the field in the tab order (FR-049).
  if (el instanceof HTMLInputElement && el.readOnly !== inert) el.readOnly = inert;
}

/** Whether the control is currently inert, i.e. every activation must no-op. */
export function isInert(el: InertControl): boolean {
  return el.getAttribute('aria-disabled') === 'true';
}
