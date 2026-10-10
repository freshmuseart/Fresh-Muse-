import { ArtPlate } from '../components/ArtPlate';
import { Newsletter } from '../components/Newsletter';
import { url } from '../utils/url';
import { getProducts, type Product } from '../lib/products';
import { getProductCategory } from '../data/products';

/**
 * /shop/ — the Fresh Muse shop.
 *
 * Every card links out to the checkout partner (Payhip) — no payments, carts
 * or card details ever touch this website. Products come from
 * src/content/products/, edited in the dashboard at /admin/.
 */

function productImage(src: string): string {
  if (/^https?:\/\//.test(src)) return src;
  return url(src);
}

function ProductCard({ product }: { product: Product }) {
  const { id, data } = product;
  const category = getProductCategory(data.category);

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
        </p>
        <h3 className="article-card__title">{data.title}</h3>
        <p className="article-card__desc">{data.description}</p>
        <div className="product-card__foot">
          <span className="product-card__price">{data.price}</span>
          <a
            className="btn btn--solid product-card__buy"
            href={data.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Buy<span className="visually-hidden"> — {data.title}, opens in a new tab</span>
          </a>
        </div>
      </div>
    </article>
  );
}

export function Shop() {
  const products = getProducts();

  return (
    <>
      <section className="section page-hero page-hero--index">
        <div className="wrap">
          <p className="eyebrow">The shop</p>
          <h1>Objects worth living with.</h1>
          <p className="lede">
            Small runs of prints, printed matter and files from the Fresh Muse studio — made in
            short editions, sold while they last. Checkout happens with our payment partner;
            nothing on this site ever sees your card details.
          </p>
        </div>
      </section>

      <section className="section section--tight">
        <div className="wrap">
          {products.length > 0 ? (
            <div className="entry-grid shop-grid">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>The shop is quiet for now.</h2>
              <p>
                Nothing is on sale today. New editions appear here first — subscribe below to hear
                when one lands.
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
