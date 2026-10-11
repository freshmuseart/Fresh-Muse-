import type { ReactNode } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { site } from '../data/site';
import { url } from '../utils/url';

/**
 * Document shell — the React port of the old BaseLayout.astro.
 *
 * Produces the complete HTML document for every page: head metadata
 * (canonical, Open Graph, favicon, sitemap), the skip link, masthead,
 * main content and footer. Stylesheets and the client script are supplied
 * by the caller (the static build injects the hashed Vite assets; the dev
 * server points at /src/entrypoints/client.tsx).
 */
export interface PageAssets {
  css: string[];
  js: string;
}

export function Layout({
  title,
  description = site.description,
  path,
  assets,
  children,
}: {
  title?: string;
  description?: string;
  /** Route path with trailing slash, e.g. '/about/' */
  path: string;
  assets: PageAssets;
  children: ReactNode;
}) {
  const pageTitle = title ? `${title} — ${site.name}` : `${site.name} — ${site.tagline}`;
  const canonical = new URL(path, process.env.SITE_URL ?? 'https://freshmuse.freebuff.app');
  const ogImage = new URL(url('/og.png'), canonical).href;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{pageTitle}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical.href} />
        <meta name="theme-color" content="#04060d" />
        <meta property="og:site_name" content={site.name} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonical.href} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={`${site.name} — abstract night-wind artwork`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImage} />
        <link rel="icon" type="image/svg+xml" href={url('/favicon.svg')} />
        <link rel="sitemap" href={url('/sitemap-index.xml')} />
        {assets.css.map((href) => (
          <link rel="stylesheet" key={href} href={href} />
        ))}
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header path={path} />
        <main id="main">{children}</main>
        <Footer />
        <script type="module" src={assets.js}></script>
      </body>
    </html>
  );
}
