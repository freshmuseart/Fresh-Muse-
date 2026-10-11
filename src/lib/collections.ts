/**
 * Moodboard loader — the groupings shown on /shop/ ("Collections").
 *
 * Reads the markdown files in src/content/collections/ at render time, the
 * same way the article and item loaders work. NON-PROGRAMMER NOTE: a
 * moodboard is one markdown file; add a new one by copying
 * example-moodboard.md and editing its frontmatter. Curated items join a
 * moodboard by setting their `collection` field to this file's name.
 *
 * Node-side only (used by the static build and the dev render middleware);
 * never shipped to the browser.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter';

const COLLECTIONS_DIR = path.resolve(process.cwd(), 'src/content/collections');

export interface CollectionData {
  title: string;
  /** Optional one-line promise shown under the title */
  tagline: string;
}

export interface Collection {
  /** File name without .md — referenced by items via their `collection` field */
  id: string;
  data: CollectionData;
  /** Optional intro copy (markdown) shown above the moodboard's items */
  body: string;
}

function files(): string[] {
  if (!existsSync(COLLECTIONS_DIR)) return [];
  return readdirSync(COLLECTIONS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();
}

let idCache: string[] | null = null;
let cache: Collection[] | null = null;

/** Every moodboard file name (published or not) — used to validate items. */
export function listCollectionIds(): string[] {
  if (!idCache) idCache = files().map((f) => f.replace(/\.md$/, ''));
  return idCache;
}

function load(): Collection[] {
  const out: Collection[] = [];
  for (const file of files()) {
    const source = readFileSync(path.join(COLLECTIONS_DIR, file), 'utf8');
    const { data, body } = parseFrontmatter(source);

    if (data.published !== 'true') continue; // drafts never reach the site

    if (!data.title) {
      throw new Error(
        `Moodboard "${file}" is published but has no title. ` +
          `Fill the field in the dashboard (or set published: false) and build again.`,
      );
    }

    out.push({
      id: file.replace(/\.md$/, ''),
      data: {
        title: data.title,
        tagline: data.tagline ?? '',
      },
      body,
    });
  }
  return out;
}

/** Published moodboards only, ordered by file name (rename to reorder). */
export function getCollections(): Collection[] {
  if (!cache) cache = load();
  return cache;
}
