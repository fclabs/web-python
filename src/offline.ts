/**
 * Offline precache and cross-origin isolation, main-thread half
 * (FR-051 – FR-053, FR-065, BR-002, BR-009, NFR-012).
 *
 * There is exactly **one** service worker (BR-002). This module registers it,
 * waits for it to activate, and then verifies that the Cache Storage bucket
 * `pyplay-assets-v<build>` really holds every URL in the build's precache
 * manifest before reporting `Offline ready`. Anything that goes wrong on that
 * path — no service-worker support, no Cache Storage, a manifest asset that
 * does not return 200, a rejected registration — degrades the offline feature
 * alone: the page keeps editing, running, formatting and autosaving while
 * online (FR-052, BR-009).
 */

/** Where the build writes its manifest and its worker, relative to the base. */
export const PRECACHE_MANIFEST_URL = 'precache-manifest.json';
export const SERVICE_WORKER_URL = 'sw.js';

/** Spec: *Data & Interfaces* — Cache Storage bucket name. */
export function cacheBucketName(build: string): string {
  return `pyplay-assets-v${build}`;
}

/** `{ build, urls }` as emitted by `scripts/precache.mjs`. */
export interface PrecacheManifest {
  build: string;
  urls: string[];
}

export interface OfflineHandlers {
  /** FR-065: precache is in progress. */
  onCaching(): void;
  /** FR-051: every manifest URL is in the bucket. */
  onReady(): void;
  /** FR-052: offline operation is unavailable; everything else still works. */
  onUnavailable(): void;
  /** FR-053: a newer deployment's worker is installed and waiting. */
  onUpdateAvailable(): void;
}

/** How long to wait for the worker to install and activate before giving up. */
const ACTIVATION_TIMEOUT_MS = 60_000;

function base(): string {
  const configured = import.meta.env?.BASE_URL ?? '/';
  return configured.endsWith('/') ? configured : `${configured}/`;
}

async function fetchManifest(scope: string): Promise<PrecacheManifest> {
  const response = await fetch(`${scope}${PRECACHE_MANIFEST_URL}`);
  if (!response.ok) throw new Error(`Precache manifest ${response.status}`);
  const manifest = (await response.json()) as PrecacheManifest;
  if (typeof manifest.build !== 'string' || !Array.isArray(manifest.urls)) {
    throw new Error('Malformed precache manifest');
  }
  return manifest;
}

/**
 * FR-053: announce a worker that has installed but is waiting behind the one
 * controlling this session. The current session is never interrupted — the
 * notice is the whole of the update flow until the visitor reloads.
 */
function watchForUpdate(registration: ServiceWorkerRegistration, announce: () => void): void {
  let announced = false;
  const fire = (): void => {
    if (announced) return;
    announced = true;
    announce();
  };
  const waitingNow = (): void => {
    if (registration.waiting && navigator.serviceWorker.controller) fire();
  };

  waitingNow();
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // `installed` with an existing controller is precisely "a newer
      // deployment has been fetched and is waiting to activate".
      if (installing.state === 'installed' && navigator.serviceWorker.controller) fire();
    });
  });
}

/** Resolve once the registration has an active worker; reject if it dies. */
function activated(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active) return Promise.resolve();
  const pending = registration.installing ?? registration.waiting;
  if (!pending) return Promise.reject(new Error('No service worker to activate'));
  const worker: ServiceWorker = pending;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.removeEventListener('statechange', onState);
      reject(new Error('Service worker activation timed out'));
    }, ACTIVATION_TIMEOUT_MS);
    function onState(): void {
      if (worker.state === 'activated') {
        clearTimeout(timer);
        worker.removeEventListener('statechange', onState);
        resolve();
      } else if (worker.state === 'redundant') {
        clearTimeout(timer);
        worker.removeEventListener('statechange', onState);
        // The commonest cause is `cache.addAll` rejecting on a non-200
        // manifest asset, which is FR-052 exactly.
        reject(new Error('Service worker install failed'));
      }
    }
    worker.addEventListener('statechange', onState);
  });
}

/** FR-051: the bucket must hold an entry for *every* manifest URL. */
async function verifyPrecache(manifest: PrecacheManifest): Promise<void> {
  const name = cacheBucketName(manifest.build);
  if (!(await caches.has(name))) throw new Error(`Missing cache bucket ${name}`);
  const cache = await caches.open(name);
  for (const url of manifest.urls) {
    if (!(await cache.match(url))) throw new Error(`Not precached: ${url}`);
  }
}

/**
 * Register the worker, precache, and report the resulting FR-065 state.
 *
 * When the page is not cross-origin isolated and the freshly installed worker
 * has just taken control, the page is reloaded once so the worker's injected
 * COOP/COEP headers apply — the "one extra load cycle on first visit" that
 * BR-002 and *Deployment* accept as the cost of the header shim.
 */
export async function setupOffline(handlers: OfflineHandlers): Promise<void> {
  handlers.onCaching();
  try {
    if (!('serviceWorker' in navigator) || typeof caches === 'undefined') {
      throw new Error('Service workers or Cache Storage unavailable');
    }
    const scope = base();
    const manifest = await fetchManifest(scope);
    const wasControlled = navigator.serviceWorker.controller !== null;

    const existing = await navigator.serviceWorker.getRegistration(scope);
    let registration: ServiceWorkerRegistration;
    if (existing) {
      registration = existing;
      // Fire-and-forget: an update check must never fail the precache state,
      // least of all when the visitor is offline (NFR-012).
      void existing.update().catch(() => undefined);
    } else {
      registration = await navigator.serviceWorker.register(`${scope}${SERVICE_WORKER_URL}`, {
        scope,
      });
    }

    watchForUpdate(registration, handlers.onUpdateAvailable);
    await activated(registration);
    await verifyPrecache(manifest);
    handlers.onReady();

    if (!self.crossOriginIsolated && !wasControlled && navigator.serviceWorker.controller) {
      window.location.reload();
    }
  } catch {
    handlers.onUnavailable();
  }
}
