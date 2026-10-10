import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { commandApiPlugin } from './command-center/dev-server.mjs';
import { devRenderPlugin } from './scripts/dev-render.mjs';

// ---------------------------------------------------------------------------
// GitHub Pages configuration
//
// When deployed with the included GitHub Actions workflow, BASE_PATH and
// SITE_URL are injected automatically from the repository name/owner, so this
// works even if the repository is renamed.
//
// For local development the default below (site root) is used.
// If you attach a custom domain later, set SITE_URL to your domain and
// BASE_PATH to "/".
// ---------------------------------------------------------------------------
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    // Dev-only Command Center API at /api/command (studio environment).
    // configureServer never runs at build time; production stays pure static.
    commandApiPlugin(),
    // Dev-only: renders every page route on demand from the React source,
    // so `vite` alone gives a fully working local site.
    devRenderPlugin(),
  ],
  build: {
    manifest: true,
    outDir: 'dist',
  },
});
