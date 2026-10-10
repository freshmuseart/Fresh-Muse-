/**
 * Tiny CommonMark-subset renderer for article bodies.
 *
 * The journal's articles use: paragraphs, ## / ### headings (with anchor
 * ids), unordered lists with wrapped items, **bold**, *italic* — and
 * ordered lists, links, inline code, fenced code blocks and blockquotes are
 * supported too, so future articles have room to grow.
 *
 * Output mirrors what the previous Astro build produced — including the
 * github-slugger heading ids and the "smartypants" typographic quotes — so
 * published URLs, anchor links and text keep working exactly as before.
 */

/** github-slugger-compatible heading id. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\- ]+/g, '')
    .replace(/ /g, '-');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Typographic quotes/dashes — the same “smartypants” pass the previous Astro
 * markdown pipeline applied by default, so published text keeps its
 * curly quotes, en/em dashes and ellipses.
 */
function smartypants(text: string): string {
  let out = text.replace(/---/g, '\u2014').replace(/--/g, '\u2013').replace(/\.\.\./g, '\u2026');
  out = out.replace(/"/g, (m, offset: number, whole: string) => {
    const prev = whole[offset - 1];
    return prev === undefined || /[\s(\[{‘“]/.test(prev) ? '“' : '”';
  });
  out = out.replace(/'/g, (m, offset: number, whole: string) => {
    const prev = whole[offset - 1];
    const next = whole[offset + 1];
    const opening =
      next !== undefined && /[A-Za-z]/.test(next) && (prev === undefined || /[\s(\[{‘“]/.test(prev));
    return opening ? '‘' : '’';
  });
  return out;
}

/** Inline markdown: **bold**, *italic*, `code`, [text](url). */
function renderInline(text: string): string {
  // Protect code spans from typographic + emphasis processing.
  const codes: string[] = [];
  const withPlaceholders = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });

  let out = escapeHtml(smartypants(withPlaceholders));
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, bold: string) => `<strong>${bold}</strong>`);
  out = out.replace(/\*([^*]+)\*/g, (_m, em: string) => `<em>${em}</em>`);
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, href: string) => `<a href="${href}">${label}</a>`,
  );
  return out;
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  const slugs = new Map<string, number>();
  let i = 0;

  const heading = (tag: string, text: string): void => {
    const base = slugify(text);
    const seen = slugs.get(base) ?? 0;
    slugs.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen}`;
    out.push(`<${tag} id="${id}">${renderInline(text)}</${tag}>`);
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // fenced code block
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}\n</code></pre>`);
      continue;
    }

    if (/^#{1,6} /.test(line)) {
      const m = /^(#{1,6}) (.*)$/.exec(line);
      if (m) {
        heading(`h${m[1].length}`, m[2].trim());
        i += 1;
        continue;
      }
    }

    if (/^> /.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^> ?/.test(lines[i])) {
        buf.push(lines[i].replace(/^> ?/, ''));
        i += 1;
      }
      out.push(`<blockquote><p>${renderInline(buf.join('\n'))}</p></blockquote>`);
      continue;
    }

    if (/^- /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^- /.test(lines[i])) {
        let item = lines[i].slice(2).trim();
        i += 1;
        // wrapped continuation lines (indented under the bullet)
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^- /.test(lines[i])) {
          item += ` ${lines[i].trim()}`;
          i += 1;
        }
        items.push(`<li>${renderInline(item)}</li>`);
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        let item = lines[i].replace(/^\d+\. /, '').trim();
        i += 1;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\d+\. /.test(lines[i])) {
          item += ` ${lines[i].trim()}`;
          i += 1;
        }
        items.push(`<li>${renderInline(item)}</li>`);
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // paragraph: consume until blank line or another block construct
    const buf: string[] = [lines[i]];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,6} /.test(lines[i]) &&
      !/^- /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i]) &&
      !/^> /.test(lines[i]) &&
      !/^```/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${renderInline(buf.join('\n'))}</p>`);
  }

  return out.join('');
}
