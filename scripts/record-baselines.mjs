/**
 * Build a pinned baseline commit and record what the suite measures against it
 * — the build's shape and compressed size (`record-baseline-build.mjs`) and,
 * optionally, its rendered geometry (`record-baseline-geometry.mjs`).
 *
 * Both records are environment-dependent, in ways that make a record committed
 * from one machine wrong on another:
 *
 *   - `gzipSync` is only as reproducible as the zlib Node was linked against.
 *     Node 26 ships stock zlib on darwin and zlib-ng on linux, and even the
 *     two linux arches disagree — `98ee032` measures 147 492 B of app payload
 *     on linux-arm64 and 147 490 B on linux-x64.
 *   - The panel column's height is a text metric. The same build puts the
 *     stacked column's top at 82 px on a GitHub `ubuntu-latest` runner and at
 *     84 px in the Playwright Linux image, because their installed fonts
 *     differ. Nothing about the product moved between those two numbers.
 *
 * So CI records its own baselines on the runner that will do the comparing,
 * and the committed records under `tests/e2e/` are the fallback for a local
 * run on the environment they name. See `.github/workflows/pr.yml` and
 * CONTRIBUTING.md ("Re-recording the pinned baselines").
 *
 * Usage:
 *   node scripts/record-baselines.mjs 384cb70 --geometry "$RUNNER_TEMP/geometry.json"
 *   node scripts/record-baselines.mjs 98ee032 --build    "$RUNNER_TEMP/build.json"
 *
 * `--keep` leaves the worktree in place for inspection.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const [commit, ...rest] = process.argv.slice(2);
const options = { build: undefined, geometry: undefined, port: '4873', keep: false };
for (let i = 0; i < rest.length; i++) {
  const flag = rest[i];
  if (flag === '--keep') options.keep = true;
  else if (flag === '--build' || flag === '--geometry' || flag === '--port')
    options[flag.slice(2)] = rest[++i];
  else usage(`unknown argument "${flag}"`);
}
if (!commit || (!options.build && !options.geometry)) {
  usage('a commit and at least one of --build / --geometry are required');
}

function usage(message) {
  console.error(`record-baselines.mjs: ${message}`);
  console.error('usage: record-baselines.mjs <commit> [--build out.json] [--geometry out.json]');
  console.error('                            [--port 4873] [--keep]');
  process.exit(2);
}

/** Run to completion in `cwd`, inheriting stdio; a non-zero exit is fatal. */
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    console.error(`record-baselines.mjs: ${command} ${args.join(' ')} exited ${result.status}`);
    process.exit(1);
  }
}

// `git worktree add` insists on creating the directory itself, so the mkdtemp
// call makes only the parent.
const scratch = mkdtempSync(join(tmpdir(), 'pyplay-baseline-'));
const worktree = join(scratch, commit);
let preview;

try {
  // `--detach`: the baseline is never a branch, and a named one would collide
  // with a second run of this script in another checkout of the same repo.
  run('git', ['worktree', 'add', '--detach', worktree, commit], repoRoot);
  run('npm', ['ci', '--no-audit', '--no-fund'], worktree);
  run('npm', ['run', 'build'], worktree);

  if (options.build) {
    run(
      'node',
      [
        join(repoRoot, 'scripts', 'record-baseline-build.mjs'),
        'dist',
        resolve(options.build),
        commit,
      ],
      worktree,
    );
  }

  if (options.geometry) {
    /*
     * `vite preview` is what must serve it: the COOP/COEP headers of BR-002
     * keep `#coi-banner` hidden, and a visible banner would add a full-width
     * row and shift every panel below it. The port sits outside the suite's
     * own 4173-4175 block so a recording cannot serve, or be served by, the
     * build under test.
     */
    preview = spawn('npx', ['vite', 'preview', '--port', options.port, '--strictPort'], {
      cwd: worktree,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    const baseUrl = `http://localhost:${options.port}`;
    await waitForServer(baseUrl);
    run(
      'node',
      [
        join(repoRoot, 'scripts', 'record-baseline-geometry.mjs'),
        baseUrl,
        resolve(options.geometry),
        commit,
      ],
      worktree,
    );
  }
} finally {
  preview?.kill();
  if (!options.keep) {
    run('git', ['worktree', 'remove', '--force', worktree], repoRoot);
    rmSync(scratch, { force: true, recursive: true });
  } else {
    console.log(`record-baselines.mjs: worktree kept at ${worktree}`);
  }
}

/** Poll until the preview server answers, or give up loudly. */
async function waitForServer(baseUrl, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      /* Not listening yet. */
    }
    if (Date.now() > deadline) {
      console.error(`record-baselines.mjs: ${baseUrl} never answered within ${timeoutMs} ms`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}
