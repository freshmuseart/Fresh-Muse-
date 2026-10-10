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
  let currentKey: string | null = null;

  for (const line of match[1].split(/\r?\n/)) {
    // YAML writers (Decap CMS included) fold long values onto indented
    // continuation lines. Rejoin them so a description is never truncated.
    if (currentKey && /^\s+\S/.test(line)) {
      const folded = line.trim();
      data[currentKey] = data[currentKey]
        ? `${data[currentKey]} ${folded}`
        : folded;
      continue;
    }

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.length >= 2) {
      const quote = value[0];
      const last = value[value.length - 1];
      if ((quote === '"' || quote === "'") && last === quote) {
        value = value.slice(1, -1);
        // YAML escapes a single quote by doubling it.
        value = quote === "'" ? value.replace(/''/g, "'") : value.replace(/\\"/g, '"');
      }
    }
    if (key) {
      data[key] = value;
      currentKey = key;
    }
  }

  return { data, body: text.slice(match[0].length) };
}
