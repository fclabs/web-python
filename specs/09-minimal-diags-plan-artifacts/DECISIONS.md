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
