import { describe, expect, it } from 'vitest';
import {
  PRECACHE_MANIFEST_URL,
  SERVICE_WORKER_URL,
  cacheBucketName,
} from '../../src/offline';
import {
  STATUS_CACHING,
  STATUS_OFFLINE_READY,
  STATUS_OFFLINE_UNAVAILABLE,
  UPDATE_AVAILABLE,
} from '../../src/format';

describe('offline precache identifiers (Data & Interfaces, Deployment)', () => {
  it('names the Cache Storage bucket `pyplay-assets-v<build>`', () => {
    expect(cacheBucketName('3c70c751e0ad')).toBe('pyplay-assets-v3c70c751e0ad');
  });

  it('keeps the manifest and the single service worker at the deployment root', () => {
    expect(PRECACHE_MANIFEST_URL).toBe('precache-manifest.json');
    expect(SERVICE_WORKER_URL).toBe('sw.js');
  });
});

describe('offline status strings (FR-051 – FR-053, FR-065)', () => {
  it('uses the spec texts byte for byte', () => {
    expect(STATUS_CACHING).toBe('Caching for offline…');
    expect(STATUS_OFFLINE_READY).toBe('Offline ready');
    expect(STATUS_OFFLINE_UNAVAILABLE).toBe('Offline unavailable');
    expect(UPDATE_AVAILABLE).toBe('A new version is available — reload to update');
  });
});
