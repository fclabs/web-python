/* eslint-disable */
/**
 * The **single** same-origin service worker (BR-002, *Deployment*).
 *
 * It does both of the two jobs the spec insists must never be split across two
 * workers:
 *
 *   1. **Cross-origin isolation** — it injects
 *      `Cross-Origin-Opener-Policy: same-origin` and
 *      `Cross-Origin-Embedder-Policy: require-corp` on same-origin HTML
 *      navigations, so `SharedArrayBuffer` is available on hosts that cannot
 *      set response headers (a `coi-serviceworker`-style shim).
 *   2. **Offline precache** — on install it fills the Cache Storage bucket
 *      `pyplay-assets-v<build>` with exactly the URLs of the build's precache
 *      manifest (FR-051) and, on activation, deletes every older
 *      `pyplay-assets-*` bucket.
 *
 * Generated at build time from `scripts/sw-template.js`; the three constants
 * below are substituted by `scripts/precache.mjs`.
 */
const BUILD = __PYPLAY_BUILD__;
const MANIFEST = __PYPLAY_MANIFEST__;
const BASE = __PYPLAY_BASE__;

/** Spec: *Data & Interfaces* — Cache Storage, `pyplay-assets-v<build>`. */
const CACHE = `pyplay-assets-v${BUILD}`;
const CACHE_PREFIX = 'pyplay-assets-';

const COI_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        // `reload` so a precache never inherits a stale HTTP-cached body. Any
        // non-200 rejects the whole install, which is the failure the page
        // turns into `Offline unavailable` (FR-052).
        await cache.addAll(MANIFEST.map((url) => new Request(url, { cache: 'reload' })));
      } catch (error) {
        // Never leave a half-filled bucket behind under this build's name: it
        // could not serve a Run loop, and Data & Interfaces expects the origin
        // to hold the current bucket or nothing.
        await caches.delete(CACHE);
        throw error;
      }

      // FR-053: a worker installed over an existing one must **wait**, so the
      // open session keeps running the old version until the visitor reloads.
      // On a first install there is no session to protect and the page is very
      // likely still waiting for cross-origin isolation, so take over at once.
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Re-issue a response with the isolation headers attached. */
function withIsolation(response) {
  if (!response || response.status === 0 || response.type === 'opaque') return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(COI_HEADERS)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Cache first, network second. Cache Storage is the only reason the page works
 * with the network disconnected (NFR-012); the network fallback is what keeps
 * a failed or partial precache from breaking anything online (FR-052, BR-009).
 */
async function serve(request) {
  const cache = await caches.open(CACHE);
  const navigation = request.mode === 'navigate';
  // `ignoreVary`: hosts routinely send `Vary: Origin` (vite preview does), and
  // the precache requests carry no `Origin` header, so honouring Vary would
  // miss every entry the worker itself stored.
  // `ignoreSearch`: no manifest URL carries a query string, and the page adds
  // one deliberately when it respawns the Python worker (see
  // `PyodideRuntime.spawn`), which must still be served from the cache offline.
  const cached = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
  if (cached) return navigation ? withIsolation(cached) : cached;

  if (navigation) {
    // Any in-scope navigation is this single page (BR-001: one static shell).
    const shell = await cache.match(BASE, { ignoreVary: true });
    try {
      return withIsolation(await fetch(request));
    } catch (error) {
      if (shell) return withIsolation(shell);
      throw error;
    }
  }
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE)) return;
  event.respondWith(serve(request));
});
