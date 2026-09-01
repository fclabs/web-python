/**
 * Vendor the Ruff WASM lint/format engine into `public/ruff/` so it is served
 * from this site's own origin (BR-001: no CDN at runtime). Vite copies
 * `public/` verbatim into `dist/`, so the build output stays self-contained.
 *
 * Run automatically by `npm run dev` and `npm run build`.
 */
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', '@astral-sh', 'ruff-wasm-web');
const to = join(root, 'public', 'ruff');

/** The whole web target: the ES-module glue plus the WASM binary. */
export const RUFF_ASSETS = ['ruff_wasm.js', 'ruff_wasm_bg.wasm'];

const version = JSON.parse(readFileSync(join(from, 'package.json'), 'utf8')).version;
if (!version.startsWith('0.14.')) {
  throw new Error(
    `Expected @astral-sh/ruff-wasm-web 0.14.x (spec: Reference implementation choices), found ${version}`,
  );
}

mkdirSync(to, { recursive: true });
let bytes = 0;
for (const name of RUFF_ASSETS) {
  const src = join(from, name);
  copyFileSync(src, join(to, name));
  bytes += statSync(src).size;
}
console.log(`vendored Ruff ${version}: ${RUFF_ASSETS.length} files, ${(bytes / 1e6).toFixed(1)} MB`);
