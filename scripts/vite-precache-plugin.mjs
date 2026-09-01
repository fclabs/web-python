/**
 * Emits the two deployment artefacts of *Deployment* into the build output:
 *
 *   - `precache-manifest.json` — `{ build, urls }`, listing every URL the Run
 *     loop needs (FR-051);
 *   - `sw.js` — the single service worker (BR-002), with that manifest and the
 *     `pyplay-assets-v<build>` bucket name baked in.
 *
 * Both are written in `closeBundle`, after Vite has copied `public/` into the
 * output, so the vendored Pyodide and Ruff assets are part of the manifest.
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildManifest, renderServiceWorker, MANIFEST_FILE, SW_FILE } from './precache.mjs';

export function precachePlugin() {
  let outDir = 'dist';
  let base = '/';
  let isBuild = false;

  return {
    name: 'pyplay-precache',
    apply: () => true,
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      base = config.base ?? '/';
      isBuild = config.command === 'build';
    },
    closeBundle() {
      if (!isBuild) return;
      const manifest = buildManifest(outDir, base);
      writeFileSync(join(outDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
      writeFileSync(join(outDir, SW_FILE), renderServiceWorker(manifest, base));
      console.log(
        `precache manifest: build ${manifest.build}, ${manifest.urls.length} URLs -> ${SW_FILE}`,
      );
    },
  };
}
