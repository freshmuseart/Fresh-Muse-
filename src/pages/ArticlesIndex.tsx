import { ArticleCard } from '../components/ArticleCard';
import { Newsletter } from '../components/Newsletter';
import { url } from '../utils/url';
import { getArticles } from '../lib/articles';

/** /articles/ — every published piece, newest first. */
export function ArticlesIndex() {
  const entries = getArticles();

  return (
    <>
      <section className="section page-hero page-hero--index">
        <div className="wrap">
          <p className="eyebrow">The journal</p>
          <h1>All writing.</h1>
          <p className="lede">
            Everything published in Fresh Muse, newest first. Each piece stands alone — read in any
            order, in any room.
          </p>
        </div>
      </section>

      <section className="section section--tight">
        <div className="wrap">
          {entries.length > 0 ? (
            <div className="entry-grid">
              {entries.map((entry) => (
                <ArticleCard
                  key={entry.id}
                  title={entry.data.title}
                  description={entry.data.description}
                  category={entry.data.category}
                  date={entry.data.date}
                  slug={entry.id}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>The journal opens soon.</h2>
              <p>New writing is being prepared. Subscribe below to hear when it arrives.</p>
            </div>
          )}
          <p className="back-link">
            <a href={url('/')}>← Back to the front page</a>
          </p>
        </div>
      </section>

      <Newsletter />
    </>
  );
}
