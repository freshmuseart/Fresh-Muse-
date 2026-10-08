// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { commandApiPlugin } from './command-center/dev-server.mjs';

// ---------------------------------------------------------------------------
// GitHub Pages configuration
//
// When deployed with the included GitHub Actions workflow, BASE_PATH and
// SITE_URL are injected automatically from the repository name/owner, so this
// works even if the repository is renamed.
//
// For local development the defaults below (site root) are used.
// If you attach a custom domain later, set SITE_URL to your domain and
// BASE_PATH to "/".
// ---------------------------------------------------------------------------
const site = process.env.SITE_URL ?? 'https://freshmuseart.github.io';
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  integrations: [
    sitemap({
      // The Command Center is a studio tool, not public site content.
      filter: (page) => !page.includes('/command-center'),
    }),
  ],
  vite: {
    // Dev-only (configureServer never runs at build time): serves the
    // Command Center API at /api/command inside the studio environment.
    plugins: [commandApiPlugin()],
  },
});
