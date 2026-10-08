/**
 * Base-path aware URL helper.
 *
 * The site may be served from a sub-path on GitHub Pages
 * (e.g. /Fresh-Muse-/), so every internal link goes through this function.
 * Use it like:  href={url('/about')}
 */
export function url(path: string): string {
  const raw = import.meta.env.BASE_URL ?? '/';
  const base = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  if (path === '/') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
