/**
 * A private copy of the build, served with the deployment's own headers, plus
 * one control endpoint that publishes a *second* deployment over it.
 *
 * It exists so VC-063 (FR-053) can be automated: load the page, publish a new
 * build, reload once, and observe the waiting worker's update notice while the
 * open session keeps running programs. It serves out of `dist-deploy/` so the
 * `dist/` the rest of the suite is running against is never disturbed.
 */
import { cpSync, existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, renderServiceWorker, MANIFEST_FILE, SW_FILE } from './precache.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'dist');
const served = join(root, 'dist-deploy');
const port = Number(process.argv[2] ?? 4175);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
};

// Playwright starts this alongside the build; wait for the build output.
for (let i = 0; i < 480 && !existsSync(join(source, 'index.html')); i++) {
  await new Promise((resolve) => setTimeout(resolve, 500));
}
rmSync(served, { recursive: true, force: true });
cpSync(source, served, { recursive: true });

/**
 * Publish a new deployment: re-fingerprint the application bundle, then
 * regenerate the precache manifest and the service worker over it. The build
 * token changes, so `sw.js` differs byte for byte and the browser's update
 * check installs a second worker that must wait (FR-053).
 */
async function publishNewBuild() {
  const assets = join(served, 'assets');
  const entry = readdirSync(assets).find((name) => name.startsWith('index-') && name.endsWith('.js'));
  if (!entry) throw new Error('no application bundle to re-fingerprint');
  const next = `index-${Math.random().toString(36).slice(2, 10)}.js`;
  renameSync(join(assets, entry), join(assets, next));

  const indexPath = join(served, 'index.html');
  await writeFile(indexPath, readFileSync(indexPath, 'utf8').split(entry).join(next));

  const manifest = buildManifest(served, '/');
  await writeFile(join(served, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(served, SW_FILE), renderServiceWorker(manifest, '/'));
  return manifest.build;
}

const NEVER_STALE = new Set(['/index.html', '/sw.js', `/${MANIFEST_FILE}`, '/']);

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/__deploy') {
    try {
      const build = await publishNewBuild();
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ build }));
    } catch (error) {
      res.writeHead(500).end(String(error));
    }
    return;
  }

  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(served, rel);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(served, 'index.html');
  }
  try {
    await stat(file);
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    // BR-002 / Deployment: cross-origin isolation on every response.
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cache-Control': NEVER_STALE.has(url.pathname) ? 'no-cache' : 'public, max-age=31536000',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`deploy-simulation server on http://localhost:${port}`));
