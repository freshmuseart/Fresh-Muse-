import { ArticleCard } from '../components/ArticleCard';
import { Newsletter } from '../components/Newsletter';
import { categories, type Category } from '../data/categories';
import { url } from '../utils/url';
import { getArticles } from '../lib/articles';

/** /<category>/ — section pages generated from src/data/categories.ts. */
export function CategoryPage({ category }: { category: Category }) {
  const entries = getArticles().filter((a) => a.data.category === category.slug);
  const others = categories.filter((c) => c.slug !== category.slug);

  return (
    <>
      {/* ===================== SECTION HEADER ===================== */}
      <section className="section page-hero page-hero--category">
        <div className="wrap">
          <p className="eyebrow">Section {category.index}</p>
          <h1 className="page-hero__title">{category.title}</h1>
          <p className="page-hero__tagline">{category.tagline}</p>
          <p className="lede">{category.description}</p>
        </div>
      </section>

      {/* ======================== ENTRIES ========================== */}
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
            <div className="empty-state empty-state--category">
              <p className="empty-state__mark" aria-hidden="true">
                ✳
              </p>
              <h2>The first pieces are being set in type.</h2>
              <p>
                This section of the journal is being prepared. Subscribe below and you will know when
                it opens.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ===================== OTHER SECTIONS ===================== */}
      <section className="section section--tight">
        <div className="wrap">
          <p className="eyebrow">Continue exploring</p>
          <div className="others">
            {others.map((c) => (
              <a href={url(`/${c.slug}`)} key={c.slug}>
                <span>{c.index}</span>
                {c.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      <Newsletter />
    </>
  );
}
