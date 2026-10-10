/**
 * Minimal frontmatter parser for the article markdown files.
 *
 * Supports the subset this site uses: a `---` delimited block of
 * `key: value` lines, where values are either double-quoted strings or
 * bare scalars (dates, booleans, numbers).
 *
 * NON-PROGRAMMER NOTE: article files keep the exact same frontmatter
 * format as before — title, description, category, date, featured, author.
 */

export interface ParsedFrontmatter {
  data: Record<string, string>;
  body: string;
}

export function parseFrontmatter(source: string): ParsedFrontmatter {
  const text = source.replace(/^﻿/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text };

  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }
    if (key) data[key] = value;
  }

  return { data, body: text.slice(match[0].length) };
}
