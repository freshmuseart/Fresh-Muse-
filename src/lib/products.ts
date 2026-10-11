/**
 * Curated item loader — the pieces listed on /shop/ ("Collections").
 *
 * Reads the markdown files in src/content/products/ at render time, exactly
 * like the article loader. Items are edited from the dashboard at /admin/
 * (Decap CMS → Curated Items) and committed to this repository by the CMS.
 *
 * Fresh Muse never sells directly: every item links out to a retailer (often
 * with an affiliate tracking parameter). The URL is copied through EXACTLY
 * as written — nothing is rewritten, shortened or invented. No payments,
 * carts or customer accounts ever touch this site.
 *
 * An item is public ONLY when `published: true` AND every required field is
 * present — an incomplete item fails the build loudly instead of shipping
 * a broken card. Node-side only: never shipped to the browser.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter';
import { listCollectionIds } from './collections';

const PRODUCTS_DIR = path.resolve(process.cwd(), 'src/content/products');

export interface ProductData {
  title: string;
  /** Short blurb shown on the card */
  description: string;
  /**
   * Optional displayed price, written exactly as it should appear
   * ("$18", "€24", "Free"). '' = no price shown. Display only — the
   * retailer's page is the source of truth.
   */
  price: string;
  /** Must match a slug in src/data/products.ts */
  category: string;
  /** Public image path (e.g. /images/products/…), or '' for generated art */
  image: string;
  /**
   * External retailer / affiliate URL. Preserved verbatim, including any
   * tracking parameters. Payments happen on the retailer's site, never here.
   */
  url: string;
  /** Button text override; 'View at retailer' when empty */
  linkLabel: string;
  /** Adds rel="sponsored" and an "Affiliate link" label to the card */
  sponsored: boolean;
  /** Optional moodboard id (src/content/collections/<id>.md); '' = listed without one */
  collection: string;
}

export interface Product {
  /** File name without .md — also used as the art seed */
  id: string;
  data: ProductData;
  /** Raw markdown body (optional longer description) */
  body: string;
}

const REQUIRED = ['title', 'description', 'category', 'url'] as const;

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
        `Curated item "${file}" is published but is missing: ${missing.join(', ')}. ` +
          `Fill the field in the dashboard (or set published: false) and build again.`,
      );
    }

    if (!/^https:\/\/.+/.test(data.url)) {
      throw new Error(
        `Curated item "${file}" has an unusable retailer link. ` +
          `Use the full https:// product-page URL, copied exactly ` +
          `(including any affiliate tracking parameters).`,
      );
    }

    const collection = data.collection ?? '';
    if (collection && !listCollectionIds().includes(collection)) {
      throw new Error(
        `Curated item "${file}" references moodboard "${collection}", which does not exist. ` +
          `Use the name of a file in src/content/collections/ (created under Moodboards ` +
          `in the dashboard), or clear the field.`,
      );
    }

    products.push({
      id: file.replace(/\.md$/, ''),
      data: {
        title: data.title,
        description: data.description,
        price: data.price ?? '',
        category: data.category,
        image: data.image ?? '',
        url: data.url,
        linkLabel: data.link_label ?? '',
        // Affiliate by default — the business model — and easy to switch off
        // for a plain external reference.
        sponsored: data.sponsored !== 'false',
        collection,
      },
      body,
    });
  }
  return products;
}

/** Published items only, ordered by file name (rename to reorder). */
export function getProducts(): Product[] {
  if (!cache) cache = load();
  return cache;
}
