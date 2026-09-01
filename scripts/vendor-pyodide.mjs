/**
 * Vendor the Pyodide runtime into `public/pyodide/` so it is served from this
 * site's own origin (BR-001, BR-003: no CDN at runtime). Vite copies
 * `public/` verbatim into `dist/`, so the build output is self-contained.
 *
 * Run automatically by `npm run dev` and `npm run build`.
 */
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'pyodide');
const to = join(root, 'public', 'pyodide');

/** Everything the Run loop needs for a stdlib-only interpreter. */
export const PYODIDE_ASSETS = [
  'pyodide.js',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

const version = JSON.parse(readFileSync(join(from, 'package.json'), 'utf8')).version;
if (!version.startsWith('0.28.')) {
  throw new Error(`Expected Pyodide 0.28.x (spec: Reference implementation choices), found ${version}`);
}

mkdirSync(to, { recursive: true });
let bytes = 0;
for (const name of PYODIDE_ASSETS) {
  const src = join(from, name);
  copyFileSync(src, join(to, name));
  bytes += statSync(src).size;
}
console.log(`vendored Pyodide ${version}: ${PYODIDE_ASSETS.length} files, ${(bytes / 1e6).toFixed(1)} MB`);
