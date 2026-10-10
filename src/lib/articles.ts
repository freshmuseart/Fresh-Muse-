/**
 * Article collection loader.
 *
 * Reads the markdown files in src/content/articles/ at render time — the
 * same files and the same frontmatter as before the migration. NON-PROGRAMMER
 * NOTE: add a new article by copying an existing file and editing its
 * frontmatter plus the markdown below it. `category` must match a slug from
 * src/data/categories.ts.
 *
 * Node-side only (used by the static build and the dev render middleware);
 * never shipped to the browser.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter';

// Resolved from the project root: this module is bundled for Node (static
// build + dev server), so import.meta.url would point at the bundle file.
const ARTICLES_DIR = path.resolve(process.cwd(), 'src/content/articles');

export interface ArticleData {
  title: string;
  description: string;
  /** Must match a slug in src/data/categories.ts */
  category: string;
  date: Date;
  author: string;
  featured: boolean;
  draft: boolean;
}

export interface Article {
  /** File name without .md — also the URL slug */
  id: string;
  data: ArticleData;
  /** Raw markdown body (frontmatter removed) */
  body: string;
}

let cache: Article[] | null = null;

function load(): Article[] {
  const files = readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  return files.map((file) => {
    const source = readFileSync(path.join(ARTICLES_DIR, file), 'utf8');
    const { data, body } = parseFrontmatter(source);
    const id = file.replace(/\.md$/, '');

    for (const key of ['title', 'description', 'category', 'date']) {
      if (!data[key]) {
        throw new Error(`Article "${file}" is missing the "${key}" field in its frontmatter.`);
      }
    }

    const date = new Date(data.date);
    if (Number.isNaN(date.valueOf())) {
      throw new Error(`Article "${file}" has an unreadable date: "${data.date}".`);
    }

    return {
      id,
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        date,
        author: data.author ?? 'Fresh Muse',
        featured: data.featured === 'true',
        draft: data.draft === 'true',
      },
      body,
    };
  });
}

/** All published articles, newest first. Cached per render bundle. */
export function getArticles(): Article[] {
  if (!cache) {
    cache = load()
      .filter((a) => !a.data.draft)
      .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
  }
  return cache;
}
