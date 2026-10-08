import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * ARTICLES
 * NON-PROGRAMMER NOTE: add a new article by copying an existing file in
 * src/content/articles/ and editing the "frontmatter" (the block between
 * the --- lines) plus the markdown below it.
 *
 * `category` must match a slug from src/data/categories.ts.
 */
const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Must match a slug in src/data/categories.ts */
    category: z.string(),
    date: z.coerce.date(),
    author: z.string().default('Fresh Muse'),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles };
