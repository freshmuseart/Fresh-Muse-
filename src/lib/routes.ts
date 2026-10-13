/**
 * The site's route table — every page the static build writes to dist/.
 * Paths carry a trailing slash (directory format), matching the URLs the
 * sitemap and canonical tags publish.
 */
import { categories } from '../data/categories';
import { getArticles } from './articles';

export function listRoutes(): string[] {
  return [
    '/',
    '/about/',
    '/contact/',
    '/resources/',
    '/privacy-policy/',
    '/affiliate-disclosure/',
    '/articles/',
    '/shop/',
    '/exhibition/',
    ...categories.map((c) => `/${c.slug}/`),
    ...getArticles().map((a) => `/articles/${a.id}/`),
    '/command-center/',
    '/404/',
  ];
}
