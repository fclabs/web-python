# Python Playground (`pyplay`)

A **static**, backend-free web page where a visitor writes a single-file Python
program, runs it, watches `stdout`/`stderr` stream into a console, types input
into the running program, copies the program to the clipboard, and gets inline
Ruff lint diagnostics plus one-click PEP 8 formatting.

Everything runs in the visitor's own browser:

| Concern | How |
|---|---|
| Python | [Pyodide](https://pyodide.org) 0.28.x — CPython 3.13 compiled to WebAssembly — inside a dedicated Web Worker, self-hosted from this site's own origin |
| Editor | CodeMirror 6 with `@codemirror/lang-python` |
| Lint + format | `@astral-sh/ruff-wasm-web` 0.14.x, self-hosted, default rule selection |
| Blocking `input()` | A `SharedArrayBuffer` + `Atomics.wait` channel between the page and the worker |
| Offline + isolation | A **single** service worker that both injects COOP/COEP and precaches every asset the Run loop needs |
| Build | Vite → a directory of static files (`dist/`) deployable to any static host |

There is **no server**. The site issues no request to any origin but its own,
and the visitor's source code is never transmitted anywhere — it lives in the
editor, the Web Worker, and `localStorage` on this origin (`pyplay.program.v1`).

- Specification: [`specs/01-static-python-web.md`](specs/01-static-python-web.md)
- Implementation plan: [`specs/01-static-python-web-plan.md`](specs/01-static-python-web-plan.md)
- Deploying it: [`docs/deployment.md`](docs/deployment.md)
- How it works inside: [`docs/architecture.md`](docs/architecture.md)
- Working on it: [`CONTRIBUTING.md`](CONTRIBUTING.md)

---

## Requirements

- Node.js 20 or newer, and npm.
- A browser with `WebAssembly`, `SharedArrayBuffer`, `Atomics.wait`, Web
  Workers, service workers and the async Clipboard API. The pinned baseline is
  Chrome 141/140, Edge 141/140, Firefox 145/144 and Safari 26.1/26.0.

## Running it locally

```bash
npm ci
npm run dev            # http://localhost:5173
```

`npm run dev` first vendors Pyodide and Ruff out of `node_modules` into
`public/pyodide/` and `public/ruff/` (they are git-ignored, so this step is
required on a fresh clone), then starts Vite.

### The dev server must be cross-origin isolated

Blocking `input()` needs `SharedArrayBuffer`, which browsers only expose to a
**cross-origin isolated** document. `vite.config.ts` therefore sends, on both
the dev server and the preview server:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

If you serve the build with anything else, make sure it sends those two headers
(or registers the shipped service worker at `/` — see
[`docs/deployment.md`](docs/deployment.md)). Without them the page loads, the
editor, Format and Copy code all work, and a permanent banner explains that
Python cannot run there — which is the intended, explicit degradation, not a
bug.

## Building

```bash
npm run build          # vendor assets, type-check, then emit dist/
npm run preview        # serve dist/ with the isolation headers, port 4173
```

`dist/` is the whole deployable site: `index.html`, hashed JS/CSS, the vendored
`pyodide/` and `ruff/` directories, `_headers` (host configuration),
`precache-manifest.json` and `sw.js`. Nothing in it needs a runtime.

The build also prints the precache manifest summary, e.g.

```
precache manifest: build ea81789389d2, 13 URLs -> sw.js
```

## Testing

See [`CONTRIBUTING.md`](CONTRIBUTING.md#running-the-test-suites) for the full
story. The short version:

```bash
npx vitest run         # unit tests (pure logic, jsdom)
npx playwright test    # browser verification criteria against the built dist/
npm run audit:perf     # VC-053 performance thresholds + the 15 MB budget
npm run audit:contrast # VC-051 / VC-071 contrast, light and dark
npm run test:matrix    # VC-055, the pinned browser matrix
```

## Keyboard

| Key | Action |
|---|---|
| `Ctrl`/`Cmd` + `Enter` | Run (from the editor) |
| `Shift` + `Alt` + `F` | Format (from the editor) |
| `Enter` in the input field | Submit a line to the running program |
| `Ctrl` + `D` in the input field | Send EOF |
| `Tab` | Move to the next control — including Run, Stop, Clear console, Copy code, Format, the editor, the input field, Send EOF and the diagnostics entries |

`Tab` is deliberately **not** bound to indentation inside the editor: that
would trap the tab sequence and break keyboard traversal of the page.
