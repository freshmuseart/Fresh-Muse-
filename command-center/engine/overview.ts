/**
 * Fresh Muse Command Center — project overview.
 *
 * A compact map of the project handed to the model at the start of every
 * command, so it knows where things live without reading everything.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { ROOT } from './history.ts';

const SKIP = new Set(['node_modules', 'dist', '.git', '.astro', '.state']);

async function walk(dir: string, rel: string, lines: string[], depth: number): Promise<void> {
  if (depth > 4 || lines.length > 220) return;
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  entries.sort();
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const abs = path.join(dir, name);
    const childRel = rel ? `${rel}/${name}` : name;
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      lines.push(`${childRel}/`);
      await walk(abs, childRel, lines, depth + 1);
    } else {
      lines.push(childRel);
    }
  }
}

export async function buildOverview(): Promise<string> {
  const lines: string[] = [];
  await walk(ROOT, '', lines, 0);
  return `PROJECT MAP (Fresh Muse — Astro 5 static site, TypeScript, plain CSS):

${lines.join('\n')}

WHERE THINGS LIVE:
- src/pages/*.astro            pages (index.astro = homepage; [category].astro auto-generates sections)
- src/components/*.astro       Header, Footer, ArticleCard, Newsletter, NightSky (hero canvas), ArtPlate
- src/layouts/BaseLayout.astro shared <head>, fonts, header/footer
- src/styles/global.css        ALL design tokens (:root colors, type scale, spacing) + global styles
- src/data/site.ts             site name, nav, footer, social links, newsletter endpoint, contact email
- src/data/categories.ts       the journal sections (slugs + taglines) — drives nav + section pages
- src/content/articles/*.md    articles. Frontmatter: title, description, category, date, featured, author
- src/content.config.ts        content collection schema/validation
- src/utils/url.ts             base-path helper — internal links use url('/path')
- social/                      social publishing architecture (config/status only; NEVER touch credentials)
- command-center/              this command system (edit only when asked to change the command system)

HOUSE RULES:
- Colors/type/spacing changes belong in src/styles/global.css tokens.
- Internal links must go through url('/...') so sub-path deploys keep working.
- The visual identity: near-black midnight, warm ivory, restrained gold accents, Fraunces + IBM Plex Sans.
  Preserve it unless explicitly asked to change it.`;
}
