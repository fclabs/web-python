# Frozen: Continuous Integration, PR Artifacts and Semver Releases

Source: `specs/02-ci.md` (v1.1)
Status: IMPLEMENTED — not yet merged to `main`; no `/verify-spec` run recorded at freeze time
Frozen: 2026-09-02
PR / commit: branch `fedecasta-ai/ci-implementation`, commits `8e68f1b` … `496519f`
Parent: `specs/01-static-python-web-frozen.md`

## Purpose

Spec 01 shipped a static Python playground whose correctness rests entirely on
its own test suite — 30-odd Vitest units, 16 Playwright e2e specs, a contrast
audit and a performance audit — and today every one of those runs only on a
maintainer's laptop, by hand, if remembered. This spec defines the automation
that makes the suite the gate: a pipeline that runs it on every pull request
and refuses the merge on failure, publishes the built site as a downloadable
artifact stamped with the PR number so a reviewer can try the real build, and
on merge to `main` derives a Semantic Versioning bump from the merge commit,
tags it, and cuts a GitHub Release with the built site attached. The
beneficiaries are the maintainer (regressions caught before merge, releases
cut without manual steps) and reviewers (a real build to click, per PR).

## What it does

### PR pipeline (`.github/workflows/pr.yml`)

- Runs on pull requests targeting `main` — `opened`, `synchronize`, `reopened` and
  `edited` (a title change alone re-runs it), drafts included — against the merge result.
- Prepares deterministically: checkout, Node.js 26.x, `npm ci` from the committed lockfile,
  Playwright `chromium` with system deps; no unpinned resolution.
- Gates the merge on five checks, each failing the run on non-zero exit: `tsc --noEmit`,
  `npm run test:unit`, the Playwright `chromium` project (every e2e spec except
  `matrix.spec.ts`), `npm run audit:contrast`, and `npm run audit:perf` with its
  measurements printed to the job log.
- Validates the PR **title** against the Conventional Commits grammar, failing with a
  message naming the accepted types.
- Uploads, only when all gates pass, one artifact per PR holding the built-site tarball;
  a new push replaces the previous one, so exactly one exists per open PR, retained 14 days.
- Uploads `playwright-report/` and `test-results/` (traces included) as a separate 7-day
  artifact when the browser gate or either audit fails, and nothing when the run passes.
- Cancels a superseded in-progress run so only the newest reports a status.
- Runs the full gate and uploads the artifact for fork PRs, with a read-only token and no
  repository secrets.
- Does **not** run `npm run test:matrix`.

### Release pipeline (`.github/workflows/release.yml`)

- Runs on every push to `main` (squash merge or direct push), re-runs the whole gate against
  the pushed commit, and publishes nothing unless it passes.
- Derives the semver bump from that commit's message alone, applied to the current version
  taken from git tags.
- When the bump is *none*: concludes successfully with no tag, commit or Release, logging
  that the commit type produces no release.
- Otherwise writes the version to `package.json` and `package-lock.json`, pushes one commit
  `chore(release): vX.Y.Z [skip ci]` containing only those two files, creates the annotated
  tag `vX.Y.Z` on it, and publishes a non-draft, non-prerelease Release `vX.Y.Z` with
  GitHub's generated notes since the previous tag.
- Attaches exactly one asset, `pyplay-X.Y.Z.tar.gz`, built in the same run from the same
  commit the gate passed on.
- Is idempotent: a run whose derived version is already tagged changes nothing and succeeds.
- Serializes concurrent release runs rather than cancelling them, and recovers from a stale
  base by re-reading the tag, re-deriving from **its own** triggering commit, and retrying
  the push at most 3 times before failing with no tag and no Release.

## Public interfaces / data

### Files this spec adds

| Path | Contents |
|---|---|
| `.github/workflows/pr.yml` | The PR pipeline (FR-100 – FR-112, FR-123) |
| `.github/workflows/release.yml` | The release pipeline (FR-114 – FR-122) |
| `.nvmrc` | `26`, the Node.js major both workflows and local development use |

No existing file changes except `package.json` / `package-lock.json`
`version`, written by FR-118.

### Conventional Commits grammar (FR-111, BR-100)

```
<type>[(<scope>)][!]: <subject>
```

- `type` ∈ { `feat`, `fix`, `perf`, `revert`, `chore`, `docs`, `style`,
  `refactor`, `test`, `build`, `ci` }
- `scope` — optional, non-empty, no `)`
- `!` — optional breaking marker
- `subject` — non-empty after the `: `

A breaking change is signalled by `!` or by a `BREAKING CHANGE:` footer line in
the commit body.

### The bump mapping (BR-100)

| Commit | Bump |
|---|---|
| `feat: …` / `feat(scope): …` | minor |
| `fix: …` / `perf: …` / `revert: …` | patch |
| any type with `!` before the colon, or a `BREAKING CHANGE:` footer | major |
| `chore:` `docs:` `style:` `refactor:` `test:` `build:` `ci:` | none |

### Artifact and tag naming

| Thing | Grammar | Example |
|---|---|---|
| PR artifact / tarball | `pyplay-<base-version>-pr.<pr-number>+<short-sha>` | `pyplay-0.1.0-pr.42+a1b2c3d` |
| Failure diagnostics artifact | `playwright-report-pr.<pr-number>` | `playwright-report-pr.42` |
| Tag | `v<X>.<Y>.<Z>` | `v0.2.0` |
| Release name | `v<X>.<Y>.<Z>` | `v0.2.0` |
| Release asset | `pyplay-<X>.<Y>.<Z>.tar.gz` | `pyplay-0.2.0.tar.gz` |

- `base-version` — `package.json`'s `version` at the head commit; the PR name
  is a semver-legal prerelease + build-metadata string, so it sorts below the
  release it precedes.
- `pr-number` — the pull request number, decimal, no padding.
- `short-sha` — the first 7 characters of the head commit SHA.

### Tarball layout

Both tarballs extract to the *contents* of `dist/`, not a wrapping directory:

```
index.html
sw.js
precache-manifest.json
_headers
assets/…
pyodide/…
ruff/…
```

### Pipeline inputs

| Input | Source | Used by |
|---|---|---|
| `github.event.pull_request.title` | GitHub event | FR-111 |
| `github.event.pull_request.number` | GitHub event | FR-107, FR-109 |
| `github.sha` | GitHub context | FR-107 short SHA |
| Pushed commit message | `git log -1 --format=%B` | FR-116 |
| Highest `vX.Y.Z` tag | `git tag --list --merged main` | BR-102 |
| `GITHUB_TOKEN` | GitHub-provided | FR-118 – FR-122 |
| `CI=true` | Runner default | Playwright `retries: 2`, `forbidOnly` |

No repository secret beyond the GitHub-provided `GITHUB_TOKEN` is required by
either workflow.

### Required checks for merge protection (FR-112)

`pr-title`, `typecheck`, `unit`, `e2e-chromium`, `audit-contrast`,
`audit-perf`, `artifact`.

## Key decisions

- **Git tags, not `package.json`, are the version's source of truth** (BR-102): one authority
  prevents two runs disagreeing about the base and lets a failed release recover by re-running.
  `package.json`'s `version` is a mirror, never an input. With no tag, the base is `0.1.0`.
- **Breaking always bumps major, even below 1.0** (BR-101): the usual "breaking → minor while
  0.x" rule makes the version stop carrying breakage information exactly when this playground's
  persisted-state and worker-protocol contracts are most likely to break.
- **Spec-01 thresholds are never relaxed for CI** (BR-104): a threshold that moves to match the
  hardware measures the hardware. The only permitted responses to a hardware-induced failure are
  faster/larger runners or a real fix — never a CI-only tolerance or a skipped assertion.
- **A skipped test is never reported as a pass** (BR-105): a green check covering nothing is
  worse than a documented gap, so an unavailable engine puts the criterion out of CI scope.
- **PR runs get no secrets and no write scope** (BR-106): PR code is untrusted by construction.
  Both workflows declare an explicit top-level `permissions:` block — the PR workflow's exactly
  `contents: read`, the release workflow's exactly `contents: write`. `pull_request_target` is
  prohibited outright, being the one trigger that grants what this rule forbids.
- **The published artifact is the tested build** (BR-107): produced in the same run, from the
  same commit, as the gate that passed — never rebuilt later or promoted from a PR run.
- **Third-party actions pinned by 40-char SHA** (BR-108): a moving `@v4` is a mutable dependency
  with write access to the release pipeline.
- **Two independent loop guards** (BR-103): the version commit is pushed with `GITHUB_TOKEN`
  *and* carries `[skip ci]`.
- **Release runs serialize, PR runs cancel** (FR-124): a cancelled PR run loses only a status;
  an interrupted release run can leave a tag without a Release.
- **The PR trigger includes `edited`** (FR-100): the gated title can change without a push, and
  without it a malformed title leaves a red check no contributor can refresh.

## Known limits (still true at freeze)

- **PR gate ≤ 20 min** wall clock warm-cache, trigger to final status; every job declares
  `timeout-minutes` ≤ 30. **Release ≤ 25 min** from push to published Release.
- **Install ≤ 150 s** (`npm ci` + Playwright `chromium`) *only on a run hitting both the
  lockfile-keyed npm cache and the browser cache*. A miss (dependency change, or 7-day
  eviction) is bounded only by the 20-minute budget. Both caches are required, not optional.
- **Artifacts ≤ 30 MB compressed** each — `dist/` is ~22 MB uncompressed, dominated by the
  13 MB vendored Pyodide and 11 MB vendored Ruff.
- **Verdict stability**: Playwright's `retries: 2` under `CI` is the only retry mechanism; no
  gate step is wrapped in a retry loop and `continue-on-error` appears on no gate step.
- **`audit-perf` is the most fragile check.** Its thresholds (shell interactive ≤ 2.0 s, cold
  runtime ready ≤ 10.0 s, warm ≤ 2.5 s) were measured on a maintainer's laptop against
  loopback; a GitHub-hosted `ubuntu-latest` runner has substantially less CPU and booting
  13 MB of Pyodide WASM is CPU-bound. It stays required anyway — a performance gate that does
  not gate is not a gate.

### Prerequisites this spec does not itself create

- **Squash merge only**, commit message defaulted to the PR title, merge commits and rebase
  merges disabled — otherwise the validated title is not what the bump reads. Direct pushes
  still work; an unrecognized type produces no release.
- **Branch protection on `main`** is configured through repository settings by a maintainer.
- **`GITHUB_TOKEN` with `contents: write` must be permitted to push to `main`** (exempt from,
  or allowed to bypass, the checks it just ran). A hard prerequisite: if settings forbid it,
  the pipeline fails loudly at its third rejected push rather than releasing without the mirror.
- GitHub-hosted `ubuntu-latest`, default free-tier concurrency, no self-hosted runner.
  Node.js 26.x local and CI, with no `engines` field declared.
- `dist/` is reproducible from `package-lock.json` alone — the vendoring scripts copy from
  `node_modules/`, so no build step downloads from a CDN.

## Deliberately excluded

- **The browser matrix** (`test:matrix`): two of its eight pinned projects (`edge-141`,
  `edge-140`) have no launchable engine on a GitHub Linux runner and would report `skipped`.
  It stays a local/manual criterion and CI makes no eight-browser claim.
- **Deployment.** Netlify continues to build and deploy from its own git integration via
  `netlify.toml`; no CI job deploys anything, no Netlify credentials exist in this
  repository, and no PR preview URLs are produced.
- Spec-01's long-running and manual criteria (`RUN_LONG=1`, network disconnection, manual
  second deployment, the greyscale check); coverage measurement and thresholds; a maintained
  `CHANGELOG.md` (notes live on the Release); dependency update automation, container and npm
  publishing (the package is `"private": true`), and signed releases.
- Any change to the application source, to spec-01's thresholds, or to the test suite's
  contents. This spec runs the suite; it does not alter it.
