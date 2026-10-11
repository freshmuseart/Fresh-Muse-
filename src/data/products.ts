/**
 * Fresh Muse — curated-item categories.
 *
 * NON-PROGRAMMER NOTE: to add a category:
 *   1. add a block below with a unique lowercase `slug` and a `label`
 *   2. add the SAME pair to the "Curated Items" collection in
 *      public/admin/config.yml (that is where the dashboard's dropdown comes
 *      from — the two lists must stay in step)
 * Nothing else needs to change: every item that uses the slug is labelled
 * with it on /shop/.
 */

export interface ProductCategory {
  /** Used in product frontmatter, e.g. "prints-editions" */
  slug: string;
  /** Shown on cards and in the dashboard dropdown */
  label: string;
}

export const productCategories: ProductCategory[] = [
  { slug: 'prints-editions', label: 'Prints & Editions' },
  { slug: 'books-zines', label: 'Books & Zines' },
  { slug: 'objects', label: 'Objects' },
  { slug: 'digital', label: 'Digital Downloads' },
];

export function getProductCategory(slug: string): ProductCategory | undefined {
  return productCategories.find((c) => c.slug === slug);
}
