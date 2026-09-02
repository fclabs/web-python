# Deploying the Python Playground

`npm run build` produces `dist/`, a directory of static files. Copy it to any
static file host that can do the two things below. Nothing else is required:
there is no server, no database, no environment variable and no build step at
the host beyond serving files.

This document is self-contained — following it alone is enough to deploy the
build correctly.

---

## 0. What is in `dist/`

```
dist/
  index.html                  the page shell
  assets/index-<hash>.js      the application bundle
  assets/index-<hash>.css     the styles
  assets/pyodide.worker-<hash>.js
  pyodide/                    pyodide.js, pyodide.asm.js, pyodide.asm.wasm,
                              python_stdlib.zip, pyodide-lock.json
  ruff/                       ruff_wasm.js, ruff_wasm_bg.wasm
  precache-manifest.json      { build, urls } — every URL the Run loop needs
  sw.js                       the single service worker
  _headers                    host configuration for Netlify / Cloudflare Pages
```

`netlify.toml` in the repository root carries the same configuration in
Netlify's own format. Both are generated to agree with this document; if you
deploy elsewhere, translate the rules below into your host's syntax.

---

## 1. Response headers

### Cross-origin isolation (required)

Serve **every HTML response** for the playground — at minimum `index.html`, and
in practice every navigation that can land on it — with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These two headers are what make `SharedArrayBuffer` available, and
`SharedArrayBuffer` + `Atomics.wait` is the only way to suspend the WebAssembly
interpreter on a value the main thread produces later — i.e. the only way
`input()` can block. Without them the page still loads and the editor, Format
and Copy code still work, but Python is disabled behind a permanent banner and
the status bar reads `Python unavailable`. That is the designed degradation,
not a failure to fix at runtime.

Serving the headers on *all* responses (as `_headers` and `netlify.toml` do) is
simplest and harmless.

### Caching

```
index.html               Cache-Control: no-cache
sw.js                    Cache-Control: no-cache
precache-manifest.json   Cache-Control: no-cache
assets/*                 Cache-Control: public, max-age=31536000, immutable
pyodide/*                Cache-Control: public, max-age=31536000, immutable
ruff/*                   Cache-Control: public, max-age=31536000, immutable
```

`index.html` and `sw.js` **must not** be served stale: a visitor whose browser
holds an old `sw.js` never learns a new deployment exists, and the
"A new version is available — reload to update" notice never appears. The
fingerprinted assets under `assets/`, `pyodide/` and `ruff/` change name
whenever their contents change, so they can be cached forever.

### WASM MIME type

```
*.wasm                   Content-Type: application/wasm
```

Serving WebAssembly as `application/octet-stream` makes compilation fail in
Safari. Treat a wrong `Content-Type` on `.wasm` as a deployment error, not a
browser quirk. Verify it after deploying:

```bash
curl -sI https://<your-host>/pyodide/pyodide.asm.wasm | grep -i content-type
curl -sI https://<your-host>/ruff/ruff_wasm_bg.wasm   | grep -i content-type
```

### Compression

Enable **gzip or Brotli** for all text and WebAssembly assets. The 15 MB
cold-load budget assumes compressed transfer; uncompressed, the build is about
23 MB and the cold-load time target will not be met either.

Measured on the current build:

| | Raw | gzip | Brotli |
|---|---|---|---|
| Whole Run loop | 23.5 MB | 8.8 MB | 7.3 MB |

The two large items are `pyodide/pyodide.asm.wasm` (8.6 MB raw) and
`ruff/ruff_wasm_bg.wasm` (10.7 MB raw); `python_stdlib.zip` is already
compressed and will not shrink further.

---

## 2. The header-injection fallback

If your host **cannot** set response headers, the shipped service worker does
it instead. It is a `coi-serviceworker`-style shim: it intercepts same-origin
HTML navigations and re-issues the response with COOP/COEP attached.

To use it:

1. Deploy `sw.js` at the **site root**, so its scope is `/`. The page
   registers it with `navigator.serviceWorker.register('/sw.js', { scope: '/' })`.
2. Make sure `sw.js` is served with `Content-Type: text/javascript` and
   `Cache-Control: no-cache`.
3. Nothing else. The page registers the worker before it boots the Python
   runtime, and reloads once so the worker can take control.

**Accepted cost:** the visitor's very first load performs one extra navigation
cycle while the worker installs and claims the page.

There is exactly **one** service worker. Do not add a second one for offline
caching — the same script does both jobs, and two workers at the same scope
would fight over which one controls the page.

---

## 3. Offline precaching

`precache-manifest.json` is emitted at build time and looks like:

```json
{
  "build": "ea81789389d2",
  "urls": [
    "/",
    "/assets/index-<hash>.css",
    "/assets/index-<hash>.js",
    "/assets/pyodide.worker-<hash>.js",
    "/pyodide/pyodide-lock.json",
    "/pyodide/pyodide.asm.js",
    "/pyodide/pyodide.asm.wasm",
    "/pyodide/pyodide.js",
    "/pyodide/python_stdlib.zip",
    "/ruff/ruff_wasm.js",
    "/ruff/ruff_wasm_bg.wasm",
    "/precache-manifest.json",
    "/sw.js"
  ]
}
```

Those URLs are *everything* the Run loop needs: the page shell, the application
scripts and styles, all self-hosted Pyodide runtime and stdlib assets, the Ruff
WASM bundle, the manifest and the service-worker script itself.

On install, the service worker fills the Cache Storage bucket
`pyplay-assets-v<build>` with exactly those URLs; on activation it deletes every
older `pyplay-assets-*` bucket. `<build>` is a hash of the manifest, so a
deployment whose assets are unchanged keeps its bucket and a deployment that
changes any fingerprinted file gets a new one — which also changes `sw.js` byte
for byte and is what triggers the browser's update check.

The status bar reports the outcome:

| Status | Meaning |
|---|---|
| `Caching for offline…` | the runtime is ready and precaching is still running |
| `Offline ready` | every manifest URL is in the bucket; the page works with the network disconnected |
| `Offline unavailable` | precaching failed (service workers disabled, storage quota exhausted, or an asset returned a non-200) — everything else keeps working while online |

A non-200 on any manifest URL aborts the whole install and the half-filled
bucket is deleted, so the origin is never left with a bucket that cannot serve
a Run loop. If you see `Offline unavailable` on a fresh deployment, one of the
manifest URLs is 404ing or 500ing — check that `pyodide/` and `ruff/` were
uploaded in full.

### Verifying a deployment

1. Load the page. The console shows one `Python 3.13.x ready` line.
2. The status bar settles on `Offline ready`.
3. In DevTools → Application → Cache Storage there is exactly one bucket,
   `pyplay-assets-v<build>`, whose entry count matches `urls.length`.
4. Run the starter program: it must prompt for input, accept a line, and print.
5. Disconnect the network and reload: the runtime still reaches ready and the
   whole Run/output/input loop still works.

---

## 4. Updating a deployment

Upload the new `dist/` over the old one, keeping the caching rules above. On the
next visit:

- the browser refetches `sw.js` (it is `no-cache`), sees new bytes, and installs
  the new worker;
- the new worker **waits** — the open session keeps running the old version
  uninterrupted;
- the page shows `A new version is available — reload to update`;
- on the visitor's next reload the new worker activates and deletes the old
  cache bucket.

Never serve `sw.js` or `index.html` from a long-lived cache, or this chain
breaks at the first link.

---

## 5. Hosts that cannot satisfy cross-origin isolation

If a host offers **neither** custom response headers **nor** service-worker
registration at `/`, the playground cannot run Python there. There is no
workaround: `SharedArrayBuffer` is gated on isolation by every supported
browser.

Deploy elsewhere. If someone tries anyway, the expected visitor experience is:

- a permanent, non-dismissible banner reading
  *"This page must be served with cross-origin isolation enabled (see
  Deployment). Python cannot run here."*;
- the status bar reading `Python unavailable`;
- Run disabled, while editing, formatting and copying all still work.

The banner sits in the normal document flow and overlays nothing.

---

## 6. Checklist

- [ ] `dist/` uploaded whole, including `pyodide/` and `ruff/`.
- [ ] `Cross-Origin-Opener-Policy: same-origin` on HTML responses.
- [ ] `Cross-Origin-Embedder-Policy: require-corp` on HTML responses.
- [ ] — or — `sw.js` reachable at `/sw.js` with root scope, if headers are impossible.
- [ ] `.wasm` served as `application/wasm`.
- [ ] gzip or Brotli enabled.
- [ ] `index.html`, `sw.js`, `precache-manifest.json` are `no-cache`.
- [ ] `assets/`, `pyodide/`, `ruff/` are immutable and long-cached.
- [ ] Status bar reaches `Offline ready` on a fresh load.
- [ ] Reload with the network off still runs a program end to end.
