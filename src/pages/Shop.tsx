import { ArtPlate } from '../components/ArtPlate';
import { Newsletter } from '../components/Newsletter';
import { url } from '../utils/url';
import { getProducts, type Product } from '../lib/products';
import { getCollections, type Collection } from '../lib/collections';
import { getProductCategory } from '../data/products';
import { renderMarkdown } from '../lib/markdown';

/**
 * /shop/ — Fresh Muse Collections.
 *
 * Curated moodboards of art, editions and objects worth living with. Every
 * card links out to the retailer that carries the piece — no payments,
 * carts or accounts ever touch this website, and where Fresh Muse earns an
 * affiliate commission the link is labelled and marked rel="sponsored".
 * Items come from src/content/products/ and moodboards from
 * src/content/collections/, both edited in the dashboard at /admin/.
 */

function productImage(src: string): string {
  if (/^https?:\/\//.test(src)) return src;
  return url(src);
}

function ProductCard({ product }: { product: Product }) {
  const { id, data } = product;
  const category = getProductCategory(data.category);
  const label = data.linkLabel || 'View at retailer';

  return (
    <article className="card product-card">
      <div className="product-card__media">
        {data.image ? (
          <img src={productImage(data.image)} alt={data.title} loading="lazy" />
        ) : (
          <ArtPlate seed={`product-${id}`} quiet />
        )}
      </div>
      <div className="product-card__body">
        <p className="article-card__meta">
          {category && <span className="article-card__cat">{category.label}</span>}
          {data.sponsored && <span className="article-card__cat">Affiliate link</span>}
        </p>
        <h3 className="article-card__title">{data.title}</h3>
        <p className="article-card__desc">{data.description}</p>
        <div className="product-card__foot">
          {data.price && <span className="product-card__price">{data.price}</span>}
          <a
            className="btn btn--solid product-card__buy"
            href={data.url}
            target="_blank"
            rel={data.sponsored ? 'noopener noreferrer sponsored' : 'noopener noreferrer'}
          >
            {label}
            <span className="visually-hidden"> — {data.title}, opens in a new tab</span>
          </a>
        </div>
      </div>
    </article>
  );
}

function Board({
  title,
  tagline,
  body,
  items,
}: {
  title: string;
  tagline?: string;
  body?: string;
  items: Product[];
}) {
  return (
    <div className="board">
      <div className="board__head">
        <h2>{title}</h2>
        {tagline && <p>{tagline}</p>}
      </div>
      {body && <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />}
      {items.length > 0 ? (
        <div className="entry-grid shop-grid">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <p className="board__empty">
          This moodboard is being assembled — the first pieces will appear here.
        </p>
      )}
    </div>
  );
}

export function Shop() {
  const collections = getCollections();
  const products = getProducts();

  // Every non-empty `collection` names an existing moodboard file (the loader
  // enforces that) — so an item is listed only when its moodboard is
  // published; items of a draft moodboard stay hidden with it.
  const boards = collections.map((collection: Collection) => ({
    collection,
    items: products.filter((p) => p.data.collection === collection.id),
  }));
  const loose = products.filter((p) => p.data.collection === '');

  const hasContent = boards.some((b) => b.items.length > 0) || loose.length > 0;

  return (
    <>
      <section className="section page-hero page-hero--index">
        <div className="wrap">
          <p className="eyebrow">Collections</p>
          <h1>Objects worth living with.</h1>
          <p className="lede">
            Curated moodboards of art, editions and objects — gathered by Fresh Muse and pointed to
            the shops that carry them. When you buy through our links we may earn an affiliate
            commission at no extra cost to you; payments and delivery always happen with the
            retailer.
          </p>
        </div>
      </section>

      <section className="section section--tight">
        <div className="wrap">
          {hasContent ? (
            <>
              {boards.map(({ collection, items }) => (
                <Board
                  key={collection.id}
                  title={collection.data.title}
                  tagline={collection.data.tagline || undefined}
                  body={collection.body}
                  items={items}
                />
              ))}
              {loose.length > 0 && (
                <Board title="Curated finds" items={loose} />
              )}
            </>
          ) : (
            <div className="empty-state">
              <h2>The collections are being assembled.</h2>
              <p>
                New moodboards are in preparation. Subscribe below to hear when the first one
                opens.
              </p>
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
