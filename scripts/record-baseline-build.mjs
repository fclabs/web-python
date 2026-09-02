/**
 * Record the shape and compressed size of a built `dist/`, so a later build
 * can be diffed against it (spec-03 NFR-305, VC-326).
 *
 * Usage:
 *   git stash / git worktree add ... <baseline commit>
 *   npm run build
 *   node scripts/record-baseline-build.mjs dist tests/e2e/baseline-build.json 8df7fa5
 *
 * The committed record under `tests/e2e/` is the one `perf.spec.ts` compares
 * against; regenerate it only when the spec pins a new baseline commit.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = process.argv[2];
const out = process.argv[3];
const commit = process.argv[4];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

/**
 * VC-326 allows exactly two filenames to change: the main JS chunk and the
 * main CSS file, which Vite content-hashes. Every other emitted name —
 * including the worker chunk — must match literally.
 */
const unhash = (url) => url.replace(/^\/assets\/index-[A-Za-z0-9_-]+\.(js|css)$/, '/assets/index-HASH.$1');

const files = walk(dist).map((f) => `/${relative(dist, f)}`).sort();
const manifest = JSON.parse(readFileSync(join(dist, 'precache-manifest.json'), 'utf8'));

/** NFR-305 measures the cold load: every precached URL, plus the shell. */
let gzippedTotal = 0;
for (const url of [...manifest.urls, '/index.html']) {
  if (url === '/') continue; // the shell is counted once, as /index.html
  gzippedTotal += gzipSync(readFileSync(join(dist, url.replace(/^\//, ''))), { level: 9 }).length;
}

const digest = (path) => createHash('sha256').update(readFileSync(join(dist, path))).digest('hex');
const vendored = files.filter((f) => f.startsWith('/pyodide/') || f.startsWith('/ruff/'));

writeFileSync(
  out,
  `${JSON.stringify(
    {
      commit,
      files: files.map(unhash),
      manifestUrls: manifest.urls.map(unhash),
      manifestUrlCount: manifest.urls.length,
      cacheNameScheme: 'pyplay-assets-v${BUILD}',
      vendored: Object.fromEntries(vendored.map((f) => [f, digest(f.slice(1))])),
      gzippedTotal,
    },
    null,
    2,
  )}\n`,
);
console.log(`recorded ${files.length} files, ${(gzippedTotal / 1024 / 1024).toFixed(2)} MiB gzipped`);
