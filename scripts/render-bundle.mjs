/**
 * Bundles the site's render module (src/build/render.tsx) for Node.
 *
 * The same bundle powers:
 *   - the static production build (scripts/build-static.mjs)
 *   - the dev server's on-demand page rendering (scripts/dev-render.mjs)
 *
 * esbuild is a transitive dependency of Vite and is also used directly here;
 * it turns the React page components into plain string-producing functions.
 */
import { build as esbuild } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

/**
 * @param {{ base: string, outDir?: string }} options
 * @returns {Promise<{ renderRoute: (route: string, opts?: object) => string, listRoutes: () => string[] }>}
 */
export async function bundleRenderer({ base, outDir = '.vite-static' }) {
  const result = await esbuild({
    entryPoints: [path.join(ROOT, 'src/build/render.tsx')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    jsx: 'automatic',
    jsxImportSource: 'react',
    sourcemap: 'inline',
    // react-dom's CJS server build requires Node builtins (util, etc.);
    // give the ESM bundle a real `require` for those.
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
    logLevel: 'silent',
    define: {
      // The url() helper and panel code read the base path from Vite's env;
      // bake it in at bundle time so the Node-side bundle matches the client.
      'import.meta.env.BASE_URL': JSON.stringify(base),
    },
  });

  if (result.errors.length > 0) {
    const text = result.errors.map((e) => JSON.stringify(e)).join('\n');
    throw new Error(`Could not bundle the render module:\n${text}`);
  }

  const outFile = path.join(ROOT, outDir, `render-${Date.now()}-${Math.floor(Math.random() * 1e6)}.mjs`);
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, result.outputFiles[0].text);
  return import(`${pathToFileURL(outFile).href}?t=${Date.now()}`);
}
