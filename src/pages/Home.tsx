import { NightSky } from '../components/NightSky';
import { ArticleCard } from '../components/ArticleCard';
import { Newsletter } from '../components/Newsletter';
import { categories } from '../data/categories';
import { site } from '../data/site';
import { url } from '../utils/url';
import { getArticles } from '../lib/articles';

/** The front page — hero, discovery grid, featured editorial, about intro. */
export function Home() {
  const articles = getArticles();
  const featured = articles.filter((a) => a.data.featured).slice(0, 3);
  const latest = (featured.length ? articles.filter((a) => !featured.includes(a)) : articles).slice(0, 3);

  return (
    <>
      {/* ============================ HERO ============================ */}
      <section className="hero">
        <NightSky className="hero__sky" />
        <div className="hero__veil" aria-hidden="true"></div>

        <div className="wrap hero__inner">
          <p className="eyebrow hero__eyebrow">An independent art publication</p>
          <h1 className="hero__title">
            Fresh <em>Muse</em>
          </h1>
          <p className="hero__statement">{site.tagline}</p>

          <div className="hero__actions">
            <a className="btn btn--solid" href="#discover">
              Enter the journal
            </a>
            <a className="btn" href={url('/about')}>
              About Fresh Muse
            </a>
          </div>
        </div>

        <div className="hero__scroll" aria-hidden="true">
          <span>Scroll</span>
          <span className="hero__scroll-line"></span>
        </div>
      </section>

      {/* ========================= DISCOVERY ========================== */}
      <section className="section" id="discover">
        <div className="wrap">
          <header className="section-head">
            <p className="eyebrow">Editorial discovery</p>
            <h2 className="section-head__title">Five ways into the work.</h2>
            <p className="lede">
              Fresh Muse moves between the overlooked, the atmospheric and the historical — art read
              as a way of living rather than a category of goods.
            </p>
          </header>

          <div className="discover-grid">
            {categories.map((cat, i) => (
              <a
                href={url(`/${cat.slug}`)}
                className={`discover-card${i < 2 ? ' discover-card--wide' : ''}`}
                key={cat.slug}
              >
                <span className="discover-card__index">{cat.index}</span>
                <h3 className="discover-card__title">{cat.title}</h3>
                <p className="discover-card__tagline">{cat.tagline}</p>
                <span className="discover-card__arrow" aria-hidden="true">
                  →
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ======================= FEATURED EDITORIAL ==================== */}
      <section className="section section--tinted">
        <div className="wrap">
          <header className="section-head section-head--row">
            <div>
              <p className="eyebrow">Featured editorial</p>
              <h2 className="section-head__title">Recently in the journal.</h2>
            </div>
            <a className="btn" href={url('/articles')}>
              All writing
            </a>
          </header>

          {featured.length > 0 ? (
            <div className="card-grid card-grid--featured">
              {featured.map((entry) => (
                <ArticleCard
                  key={entry.id}
                  title={entry.data.title}
                  description={entry.data.description}
                  category={entry.data.category}
                  date={entry.data.date}
                  slug={entry.id}
                  featured
                />
              ))}
            </div>
          ) : (
            <p className="empty-note">New writing is being set. First pieces arrive shortly.</p>
          )}

          {latest.length > 0 && (
            <div className="card-grid card-grid--three">
              {latest.map((entry) => (
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
          )}
        </div>
      </section>

      {/* ========================= ABOUT INTRO ========================= */}
      <section className="section about-intro">
        <div className="wrap about-intro__grid">
          <div className="about-intro__copy">
            <p className="eyebrow">About Fresh Muse</p>
            <h2>Art does not have to belong only in museums or to wealthy collectors.</h2>
            <p className="lede">
              Fresh Muse explores how art, objects, artists, materials and creative ideas can become
              part of everyday life — an intersection of independent publication, contemporary gallery
              and quiet cultural field guide.
            </p>
            <a className="btn" href={url('/about')}>
              Read our story
            </a>
          </div>

          <aside className="about-intro__aside" aria-label="Fresh Muse principles">
            <blockquote>
              <p>“{site.philosophy}”</p>
              <footer>— the Fresh Muse editorial position</footer>
            </blockquote>
            <ul>
              <li>
                <span>01</span> Curiosity over trend
              </li>
              <li>
                <span>02</span> Attention over acquisition
              </li>
              <li>
                <span>03</span> Atmosphere over noise
              </li>
            </ul>
          </aside>
        </div>
      </section>

      {/* ========================= NEWSLETTER ========================== */}
      <Newsletter />
    </>
  );
}
