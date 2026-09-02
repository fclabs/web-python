import { defineConfig } from 'vite';
// @ts-expect-error — plain-JS build plugin, deliberately outside the TS project.
import { precachePlugin } from './scripts/vite-precache-plugin.mjs';

/**
 * Cross-origin isolation headers (BR-002 / Deployment).
 * Applied to both the dev server and the preview server so development and
 * the verification suite run under the same isolation the deployment needs.
 */
const coiHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [precachePlugin()],
  server: {
    headers: coiHeaders,
    // Leading dot allows any subdomain — ngrok URLs change on every tunnel.
    allowedHosts: ['.ngrok-free.app', '.ngrok.io'],
  },
  preview: { headers: coiHeaders },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
