# DECISIONS — Minimal Diagnostics Under Input

Append-only. Each entry is locked unless a later entry explicitly supersedes it.

## D-01 — `maxDiagHeight` formula (Iteration 1)

**Choice:**

```ts
Math.max(
  0,
  Math.floor(
    Math.min(
      rightColumnHeight * DIAG_HEIGHT_MAX_RATIO,
      rightColumnHeight - (consoleMin ?? DIAG_CONSOLE_MIN),
    ),
  ),
)
```

(`consoleMin` defaults to `DIAG_CONSOLE_MIN` via the parameter default.)

**Why:** FR-908 requires both caps (≤ 40 % of right-column height, console ≥ 80 px)
with “whichever bound is hit first wins.” Taking the min of the two ceilings does
that. `Math.floor` keeps the result an integer CSS-px height consistent with
canonical storage strings. `Math.max(0, …)` stops a tiny column (console floor
larger than the column) from producing a negative max.

**Supersedes:** nothing.

## D-02 — Header-only CSS fallback when `--diagnostics-height` unset (Iteration 2)

**Choice:** Vertical diagnostics track is
`var(--diagnostics-height, auto)`. When the custom property is unset, the track
is `auto`. `.panel--diagnostics` is a column flex container; `.panel-title` is
`flex: 0 0 auto`; `.diagnostics-list` / `.diagnostics-empty` are
`flex: 1 1 0; min-height: 0; overflow: auto` so they contribute no intrinsic
height. Bottom padding is moved onto the title (`padding-bottom: 0` on the
panel) so a collapsed body sits flush with the client edge. Panel
`overflow: hidden` clips paint. When bootstrap (or later the controller) sets
`--diagnostics-height` to a definite `Npx`, the track is that size and the
flex body fills leftover space.

**Why:** FR-901 / FR-910 require a non-`fr` default that is content-derived
header-only without JS measurement on first paint; the flex-basis-0 pattern
keeps list/empty in the document (BR-901) while sizing the track to the title
row + padding.

**Supersedes:** nothing.

## D-03 — Vertical grid tracks and `diagsep` area (Iteration 2)

**Choice:** Under `#app[data-layout='vertical']` at ≥ 900 px, right-column rows
are:

`minmax(80px, 1fr)` (console) → `8px` (`diagsep`) → `auto` (stdin) →
`var(--diagnostics-height, auto)` (diag).

`grid-template-areas` include `diagsep` between `console` and `stdin` in all
four variants (plain, symbols, files, both). `#diag-resizer` has
`grid-area: diagsep`. Visibility: `.diag-resizer { display: none }` by default;
`display: block` only under `#app[data-layout='vertical']` inside the same
`min-width: 900px` block (no `hidden` attribute).

**Why:** FR-903 places the separator between console and stdin visually;
FR-913 keeps document order with the control after the editor. NFR-901 needs
≥ 8 px hit height. CSS-only hide satisfies FR-906 visibility until Iteration 3
adds `setInert()`.

**Supersedes:** nothing.
