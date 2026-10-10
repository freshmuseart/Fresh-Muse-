/**
 * Dev-only Vite plugin — serves every site route as prerendered HTML,
 * rendered on demand from the React page components in src/.
 *
 * Together with the Command Center API plugin this makes plain `vite dev`
 * a fully working studio environment: pages render exactly like the
 * production build, and edits to TSX/markdown are picked up on reload
 * (the render bundle is rebuilt whenever anything under src/ changes).
 *
 * Production builds never ship this plugin — it only exists inside
 * configureServer.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleRenderer } from './render-bundle.mjs';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const PUBLIC_DIR = path.join(ROOT, 'public');

/** Requests Vite itself must handle. */
const VITE_OWNED = /^\/(@|node_modules|src\/|favicon\.svg$|og\.png$|api\/)/;

const SCAN_DIRS = ['src'];

/** Newest mtime under src/ (pages, components, styles, articles). */
async function newestSourceMtime() {
  let newest = 0;
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        const s = await stat(full).catch(() => null);
        if (s && s.mtimeMs > newest) newest = s.mtimeMs;
      }
    }
  }
  for (const dir of SCAN_DIRS) await walk(path.join(ROOT, dir));
  return newest;
}

/** '/about' | '/about/' → '/about/'; unknown paths fall through to the 404 page. */
function normalizeRoute(url, routes) {
  let pathname = url.replace(/\/+$/, '');
  if (pathname === '') pathname = '/';
  const withSlash = pathname === '/' ? '/' : `${pathname}/`;
  if (routes.has(withSlash)) return withSlash;
  return '/404/';
}

export function devRenderPlugin() {
  const base = process.env.BASE_PATH ?? '/';
  let renderer = null;
  let sourceStamp = 0;

  async function getRenderer() {
    const stamp = await newestSourceMtime();
    if (!renderer || stamp > sourceStamp) {
      renderer = await bundleRenderer({ base });
      sourceStamp = stamp;
    }
    return renderer;
  }

  return {
    name: 'fresh-muse-dev-render',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET') return next();
        const url = (req.url || '/').split('?')[0];
        if (VITE_OWNED.test(url)) return next();
        // Anything with a file extension belongs to Vite or public/.
        if (path.extname(url) !== '' && !url.endsWith('/')) return next();
        // Directory indexes published from public/ (e.g. /admin/) are static
        // files — serve them instead of rendering a site route for the path.
        if (url !== '/') {
          const dirIndex = path.normalize(path.join(PUBLIC_DIR, url, 'index.html'));
          if (dirIndex.startsWith(PUBLIC_DIR + path.sep) && existsSync(dirIndex)) {
            const html = await readFile(dirIndex, 'utf8');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
            return;
          }
        }

        try {
          const mod = await getRenderer();
          const route = normalizeRoute(url, new Set(mod.listRoutes()));
          const html = mod.renderRoute(route, { dev: true });
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (err) {
          next(err);
        }
      });
    },
  };
}
