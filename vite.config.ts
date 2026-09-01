import { defineConfig } from 'vite';

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
  server: { headers: coiHeaders },
  preview: { headers: coiHeaders },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
