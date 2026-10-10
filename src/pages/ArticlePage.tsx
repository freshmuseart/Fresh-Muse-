import { ArticleCard } from '../components/ArticleCard';
import { ArtPlate } from '../components/ArtPlate';
import { getCategory, categories } from '../data/categories';
import { url } from '../utils/url';
import { getArticles, type Article } from '../lib/articles';
import { renderMarkdown } from '../lib/markdown';

/** /articles/<slug>/ — a single journal piece. */
export function ArticlePage({ entry }: { entry: Article }) {
  const cat = getCategory(entry.data.category);

  /** Reading time estimated from the raw markdown body (when available). */
  const words = entry.body ? entry.body.split(/\s+/).length : 0;
  const readingMinutes = words > 0 ? Math.max(1, Math.round(words / 220)) : null;

  /** Previous / next article in chronological order (newest first). */
  const all = getArticles();
  const idx = all.findIndex((a) => a.id === entry.id);
  const newer = idx > 0 ? all[idx - 1] : null;
  const older = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

  const others = all.filter((a) => a.data.category === entry.data.category && a.id !== entry.id).slice(0, 3);

  const siblings = categories.filter((c) => c.slug !== entry.data.category).slice(0, 4);

  const formatted = new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(entry.data.date);

  return (
    <>
      <article className="article">
        {/* ======================= HEADER ======================= */}
        <header className="article__head">
          <div className="wrap wrap--narrow">
            <p className="eyebrow">
              {cat ? <a href={url(`/${cat.slug}`)}>{cat.title}</a> : 'Journal'}
            </p>
            <h1>{entry.data.title}</h1>
            <p className="article__dek">{entry.data.description}</p>
            <p className="article__byline">
              <span>{entry.data.author}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={entry.data.date.toISOString()}>{formatted}</time>
              {readingMinutes && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{readingMinutes} min read</span>
                </>
              )}
            </p>
          </div>
        </header>

        {/* ======================== PLATE ======================== */}
        <div className="wrap article__plate">
          <ArtPlate seed={entry.id} />
        </div>

        {/* ======================== BODY ========================= */}
        <div
          className="wrap wrap--narrow article__body prose"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.body) }}
        />

        {(newer || older) && (
          <nav className="wrap wrap--narrow article__pager" aria-label="Previous and next article">
            {older ? (
              <a className="article__pager-link" href={url(`/articles/${older.id}`)} rel="prev">
                <span className="article__pager-label">← Previous</span>
                <span className="article__pager-title">{older.data.title}</span>
              </a>
            ) : (
              <span></span>
            )}
            {newer ? (
              <a
                className="article__pager-link article__pager-link--next"
                href={url(`/articles/${newer.id}`)}
                rel="next"
              >
                <span className="article__pager-label">Next →</span>
                <span className="article__pager-title">{newer.data.title}</span>
              </a>
            ) : (
              <span></span>
            )}
          </nav>
        )}

        <nav className="wrap wrap--narrow article__foot" aria-label="Article navigation">
          <a className="btn" href={url('/articles')}>
            ← All writing
          </a>
          {cat && (
            <a className="btn" href={url(`/${cat.slug}`)}>
              More in {cat.title}
            </a>
          )}
        </nav>
      </article>

      {others.length > 0 && (
        <section className="section keep-reading">
          <div className="wrap">
            <p className="eyebrow">Keep reading</p>
            <div className="more-grid">
              {others.map((o) => (
                <ArticleCard
                  key={o.id}
                  title={o.data.title}
                  description={o.data.description}
                  category={o.data.category}
                  date={o.data.date}
                  slug={o.id}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="wrap">
          <p className="eyebrow">Other sections</p>
          <div className="siblings">
            {siblings.map((c) => (
              <a href={url(`/${c.slug}`)} key={c.slug}>
                <span>{c.index}</span> {c.title}
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
