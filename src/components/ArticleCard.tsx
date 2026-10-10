import { ArtPlate } from './ArtPlate';
import { getCategory } from '../data/categories';
import { url } from '../utils/url';

/**
 * ArticleCard — editorial card for article listings.
 * NON-PROGRAMMER NOTE: this renders automatically from files in
 * src/content/articles/; you normally never need to edit this file.
 */
export function ArticleCard({
  title,
  description,
  category,
  date,
  slug,
  featured = false,
}: {
  title: string;
  description: string;
  category: string;
  date: Date;
  slug: string;
  featured?: boolean;
}) {
  const cat = getCategory(category);
  const formatted = new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);

  return (
    <article className={`card article-card${featured ? ' article-card--featured' : ''}`}>
      <a className="article-card__media" href={url(`/articles/${slug}`)} tabIndex={-1} aria-hidden="true">
        <ArtPlate seed={slug} quiet={!featured} />
      </a>
      <div className="article-card__body">
        <p className="article-card__meta">
          {cat && <span className="article-card__cat">{cat.title}</span>}
          <time dateTime={date.toISOString()}>{formatted}</time>
        </p>
        <h3 className="article-card__title">
          <a href={url(`/articles/${slug}`)}>{title}</a>
        </h3>
        <p className="article-card__desc">{description}</p>
        <span className="article-card__more" aria-hidden="true">
          Read →
        </span>
      </div>
    </article>
  );
}
