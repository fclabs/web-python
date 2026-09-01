/**
 * Shared precache plumbing (spec: *Deployment* — "Offline precache manifest").
 *
 * One place decides three things, so the build, the dev-time tooling and the
 * deployment-simulation server can never disagree:
 *
 *   1. which URLs belong in the precache manifest,
 *   2. the `<build>` token of the Cache Storage bucket `pyplay-assets-v<build>`,
 *   3. the bytes of the single service worker that owns both cross-origin
 *      isolation (BR-002) and that bucket (FR-051).
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The service-worker script's URL, relative to the deployment root. */
export const SW_FILE = 'sw.js';
/** The precache manifest's URL, relative to the deployment root. */
export const MANIFEST_FILE = 'precache-manifest.json';

/**
 * Files that live in the build output but are not part of the Run loop, so
 * they never enter the manifest: host configuration, and the manifest's own
 * two companions, which are added explicitly and in a fixed position.
 */
const EXCLUDED = new Set(['_headers', MANIFEST_FILE, SW_FILE, 'index.html']);

/** Every file under `dir`, as root-relative POSIX paths. */
function walk(dir, root = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, root));
    else out.push(relative(root, full).split(sep).join(posix.sep));
  }
  return out;
}

/**
 * The manifest URL list for a built site rooted at `outDir` and served from
 * `base`: page shell, application scripts and styles, all self-hosted Pyodide
 * runtime and stdlib assets, the Ruff WASM bundle, the manifest itself and the
 * service-worker script (*Deployment*).
 */
export function collectPrecacheUrls(outDir, base = '/') {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const files = walk(outDir)
    .filter((file) => !EXCLUDED.has(file))
    .sort();
  // The page shell is cached under the navigation URL the visitor actually
  // requests, not under `index.html`.
  return [prefix, ...files.map((file) => prefix + file), prefix + MANIFEST_FILE, prefix + SW_FILE];
}

/**
 * The `<build>` token. Derived from the manifest itself, so a deployment whose
 * assets are unchanged keeps its bucket, and any change to any fingerprinted
 * asset name produces a new bucket and therefore a new service-worker script.
 */
export function computeBuild(urls) {
  return createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 12);
}

/** `{ build, urls }` — the JSON written to `precache-manifest.json`. */
export function buildManifest(outDir, base = '/') {
  const urls = collectPrecacheUrls(outDir, base);
  return { build: computeBuild(urls), urls };
}

/**
 * The single service worker (BR-002: never two), with its build token, its
 * manifest and its scope baked in.
 */
export function renderServiceWorker(manifest, base = '/') {
  const template = readFileSync(join(here, 'sw-template.js'), 'utf8');
  return template
    .replace('__PYPLAY_BUILD__', JSON.stringify(manifest.build))
    .replace('__PYPLAY_MANIFEST__', JSON.stringify(manifest.urls))
    .replace('__PYPLAY_BASE__', JSON.stringify(base.endsWith('/') ? base : `${base}/`));
}
