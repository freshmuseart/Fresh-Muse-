/**
 * The site's render entry — turns a route path into a complete HTML document.
 *
 * Bundled for Node by scripts/render-bundle.mjs and used by both:
 *   - scripts/build-static.mjs (production: writes dist/)
 *   - scripts/dev-render.mjs   (development: serves pages on demand)
 */
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Layout, type PageAssets } from '../layouts/Layout';
import { listRoutes } from '../lib/routes';
import { getArticles } from '../lib/articles';
import { categories } from '../data/categories';
import { Home } from '../pages/Home';
import { About } from '../pages/About';
import { Contact } from '../pages/Contact';
import { Resources } from '../pages/Resources';
import { PrivacyPolicy } from '../pages/PrivacyPolicy';
import { AffiliateDisclosure } from '../pages/AffiliateDisclosure';
import { NotFound } from '../pages/NotFound';
import { ArticlesIndex } from '../pages/ArticlesIndex';
import { Shop } from '../pages/Shop';
import { ArticlePage } from '../pages/ArticlePage';
import { CategoryPage } from '../pages/CategoryPage';
import { CommandCenter } from '../pages/CommandCenter';

export { listRoutes };

export interface RenderOptions {
  /** Studio environment: renders the live Command Center panel. */
  dev?: boolean;
  /** Stylesheet + script URLs to link from the document head. */
  assets?: PageAssets;
}

const DEV_ASSETS: PageAssets = { css: [], js: '/src/entrypoints/client.tsx' };

export function renderRoute(route: string, options: RenderOptions = {}): string {
  const assets = options.assets ?? DEV_ASSETS;
  const dev = options.dev ?? false;

  let title: string | undefined;
  let description: string | undefined;
  let content: ReactNode;

  if (route === '/') {
    content = <Home />;
  } else if (route === '/about/') {
    title = 'About';
    description =
      'Fresh Muse is an independent art and creative culture platform — part publication, part gallery, part field guide for living with art.';
    content = <About />;
  } else if (route === '/contact/') {
    title = 'Contact';
    description = 'Get in touch with Fresh Muse — pitches, corrections, collaborations and quiet notes.';
    content = <Contact />;
  } else if (route === '/resources/') {
    title = 'Resources';
    description =
      'Tools, references and practical guidance for artists, collectors and curious readers — curated by Fresh Muse.';
    content = <Resources />;
  } else if (route === '/privacy-policy/') {
    title = 'Privacy Policy';
    description = 'How Fresh Muse handles your data — a plain-language privacy policy.';
    content = <PrivacyPolicy />;
  } else if (route === '/affiliate-disclosure/') {
    title = 'Affiliate Disclosure';
    description = 'How Fresh Muse uses affiliate links — full transparency.';
    content = <AffiliateDisclosure />;
  } else if (route === '/articles/') {
    title = 'All Writing';
    description =
      'Every piece in the Fresh Muse journal — overlooked art, interiors, artists, collectible objects and art history.';
    content = <ArticlesIndex />;
  } else if (route === '/shop/') {
    title = 'Collections';
    description =
      'Curated collections and moodboards from Fresh Muse — art, editions and objects worth living with, with links to the retailers that carry them.';
    content = <Shop />;
  } else if (route === '/command-center/') {
    title = 'Command Center';
    description = 'Describe a change in plain English and watch the Fresh Muse site adapt.';
    content = <CommandCenter dev={dev} />;
  } else if (route === '/404/') {
    title = 'Not Found';
    description = 'This room of the gallery is empty.';
    content = <NotFound />;
  } else {
    const article = getArticles().find((a) => `/articles/${a.id}/` === route);
    if (article) {
      title = article.data.title;
      description = article.data.description;
      content = <ArticlePage entry={article} />;
    } else {
      const category = categories.find((c) => `/${c.slug}/` === route);
      if (category) {
        title = category.title;
        description = category.tagline;
        content = <CategoryPage category={category} />;
      } else {
        // Unknown route → the 404 room.
        title = 'Not Found';
        description = 'This room of the gallery is empty.';
        content = <NotFound />;
      }
    }
  }

  const markup = renderToStaticMarkup(
    <Layout title={title} description={description} path={route} assets={assets}>
      {content}
    </Layout>,
  );
  return `<!doctype html>${markup}`;
}
