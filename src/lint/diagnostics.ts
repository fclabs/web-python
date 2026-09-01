/**
 * The `Diagnostic` shape of *Data & Interfaces* and the pure mapping from what
 * Ruff-WASM reports onto it. Kept free of DOM and of the engine itself so the
 * mapping is unit-testable (plan, Iteration 6).
 */

export type Severity = 'error' | 'warning';

export interface Position {
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
}

export interface Diagnostic {
  /** e.g. `F821`, `E501`. */
  code: string;
  /** Human-readable, no trailing period. */
  message: string;
  severity: Severity;
  start: Position;
  /** Exclusive. */
  end: Position;
}

/** The subset of Ruff's WASM `Diagnostic` this page consumes. */
export interface RuffDiagnostic {
  code: string | null;
  message: string;
  start_location: { row: number; column: number };
  end_location: { row: number; column: number };
}

/**
 * FR-041: Ruff reports parse failures as diagnostics carrying this code (older
 * builds report a null code), and they are always error-severity.
 */
export const SYNTAX_ERROR_CODE = 'invalid-syntax';

/**
 * FR-041 / VC-061: severity is `error` for anything that means the program is
 * broken as written — a parse failure, Ruff's `E9` syntax/IO family, and the
 * `F82x` undefined-name family, whose subject cannot exist at run time.
 * Everything else in Ruff's default selection is style or hygiene advice, so
 * it is a `warning`. Neither severity gates Run (FR-042, BR-006).
 */
export function severityFor(code: string): Severity {
  if (code === SYNTAX_ERROR_CODE) return 'error';
  if (/^E9\d*$/.test(code)) return 'error';
  if (/^F82\d$/.test(code)) return 'error';
  return 'warning';
}

const clampIndex = (n: number): number => (Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1);

/** Map one raw Ruff diagnostic onto the spec's `Diagnostic`. */
export function mapRuffDiagnostic(raw: RuffDiagnostic): Diagnostic {
  const code = raw.code ?? SYNTAX_ERROR_CODE;
  return {
    code,
    // The spec's shape says "no trailing period"; Ruff already complies, but a
    // rule message that ends in one would otherwise reach the panel verbatim.
    message: raw.message.replace(/\.+$/, ''),
    severity: severityFor(code),
    start: { line: clampIndex(raw.start_location.row), column: clampIndex(raw.start_location.column) },
    end: { line: clampIndex(raw.end_location.row), column: clampIndex(raw.end_location.column) },
  };
}

/** FR-038: ordered by line, then column. Stable for equal positions. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (a, b) => a.start.line - b.start.line || a.start.column - b.start.column,
  );
}

/** FR-035: a whole lint pass, mapped and ordered — it replaces the previous one. */
export function mapRuffDiagnostics(raw: readonly RuffDiagnostic[]): Diagnostic[] {
  return sortDiagnostics(raw.map(mapRuffDiagnostic));
}

/** FR-038: `line:col · code · message`. */
export function formatDiagnosticEntry(d: Diagnostic): string {
  return `${d.start.line}:${d.start.column} · ${d.code} · ${d.message}`;
}

/** FR-037: `F821 · Undefined name 'foo'`. */
export function formatDiagnosticTooltip(d: Diagnostic): string {
  return `${d.code} · ${d.message}`;
}
