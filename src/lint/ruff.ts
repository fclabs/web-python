/**
 * The self-hosted Ruff-WASM lint/format engine (spec: *Reference
 * implementation choices* — `@astral-sh/ruff-wasm-web` 0.14.x, default rule
 * selection and default formatter settings).
 *
 * The engine is vendored into `public/ruff/` by `scripts/vendor-ruff.mjs` and
 * pulled in at run time from this site's own origin (BR-001). It is imported
 * dynamically so that a missing or broken asset degrades the linter alone —
 * editing and Run keep working (FR-046, BR-009).
 */
import { mapRuffDiagnostics, type Diagnostic, type RuffDiagnostic } from './diagnostics';

/** Where the vendored engine is served from (BR-001: own origin). */
export const RUFF_MODULE_URL = 'ruff/ruff_wasm.js';
export const RUFF_WASM_URL = 'ruff/ruff_wasm_bg.wasm';

export interface RuffEngine {
  /** FR-035 / FR-041: one complete lint pass, ordered by line then column. */
  check(code: string): Diagnostic[];
  /**
   * FR-043: a PEP 8-conformant reformatting of the same program.
   * Throws when the program does not parse (FR-045).
   */
  format(code: string): string;
  version: string;
}

/** The slice of the wasm-bindgen glue module this page uses. */
interface RuffModule {
  default: (input: { module_or_path: string }) => Promise<unknown>;
  Workspace: {
    new (settings: unknown, encoding: number): {
      check(code: string): RuffDiagnostic[];
      format(code: string): string;
    };
    defaultSettings(): unknown;
    version(): string;
  };
  PositionEncoding: { Utf16: number };
}

const base = (): string => {
  const configured = import.meta.env?.BASE_URL ?? '/';
  return configured.endsWith('/') ? configured : `${configured}/`;
};

/**
 * Load and initialise the engine. Rejects when the asset cannot be fetched or
 * compiled, which is the FR-046 / FR-058 degradation path.
 */
export async function loadRuff(): Promise<RuffEngine> {
  const module = (await import(/* @vite-ignore */ `${base()}${RUFF_MODULE_URL}`)) as RuffModule;
  await module.default({ module_or_path: `${base()}${RUFF_WASM_URL}` });

  // `defaultSettings()` is exactly the spec's "default rule selection and
  // default formatter settings"; nothing here overrides it.
  const workspace = new module.Workspace(
    module.Workspace.defaultSettings(),
    // Columns arrive as UTF-16 code units, matching JavaScript string offsets
    // and therefore CodeMirror's own document positions.
    module.PositionEncoding.Utf16,
  );

  return {
    check: (code) => mapRuffDiagnostics(workspace.check(code)),
    format: (code) => workspace.format(code),
    version: module.Workspace.version(),
  };
}
