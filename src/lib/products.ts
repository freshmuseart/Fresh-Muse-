/**
 * Product collection loader — the shop's stock list.
 *
 * Reads the markdown files in src/content/products/ at render time, exactly
 * like the article loader. Products are edited from the dashboard at /admin/
 * (Decap CMS → Products) and committed to this repository by the CMS.
 *
 * A product is public ONLY when `published: true` AND every required field is
 * present — an incomplete product fails the build loudly instead of shipping
 * a broken card. Node-side only: never shipped to the browser.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter';

const PRODUCTS_DIR = path.resolve(process.cwd(), 'src/content/products');

export interface ProductData {
  title: string;
  /** Short blurb shown on the card */
  description: string;
  /** Displayed exactly as written, e.g. "$18", "€24", "Free" */
  price: string;
  /** Must match a slug in src/data/products.ts */
  category: string;
  /** Public image path (e.g. /images/products/…), or '' for generated art */
  image: string;
  /** External checkout link (Payhip / Gumroad). Payments never happen here. */
  checkoutUrl: string;
}

export interface Product {
  /** File name without .md — also used as the art seed */
  id: string;
  data: ProductData;
  /** Raw markdown body (optional long description) */
  body: string;
}

const REQUIRED = ['title', 'description', 'price', 'category', 'checkout_url'] as const;

let cache: Product[] | null = null;

function load(): Product[] {
  if (!existsSync(PRODUCTS_DIR)) return [];

  const files = readdirSync(PRODUCTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const products: Product[] = [];
  for (const file of files) {
    const source = readFileSync(path.join(PRODUCTS_DIR, file), 'utf8');
    const { data, body } = parseFrontmatter(source);

    if (data.published !== 'true') continue; // drafts never reach the site

    const missing = REQUIRED.filter((key) => !data[key]);
    if (missing.length > 0) {
      throw new Error(
        `Product "${file}" is published but is missing: ${missing.join(', ')}. ` +
          `Fill the field in the dashboard (or set published: false) and build again.`,
      );
    }

    products.push({
      id: file.replace(/\.md$/, ''),
      data: {
        title: data.title,
        description: data.description,
        price: data.price,
        category: data.category,
        image: data.image ?? '',
        checkoutUrl: data.checkout_url,
      },
      body,
    });
  }
  return products;
}

/** Published products only, ordered by file name (rename to reorder). */
export function getProducts(): Product[] {
  if (!cache) cache = load();
  return cache;
}
