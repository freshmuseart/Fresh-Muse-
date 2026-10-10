import { site } from '../data/site';

/**
 * Newsletter — email signup band.
 * Uses a plain HTML form; set `newsletterAction` in src/data/site.ts to
 * connect any free form service (Buttondown, Mailchimp, etc.).
 * The unconnected-form fallback lives in src/entrypoints/client.tsx.
 */
export function Newsletter() {
  const action = site.newsletterAction;

  return (
    <section className="newsletter" aria-labelledby="newsletter-title">
      <div className="wrap newsletter__inner">
        <div className="newsletter__copy">
          <p className="eyebrow">The dispatch</p>
          <h2 id="newsletter-title">Letters from the gallery, after hours.</h2>
          <p className="lede">
            One considered email every few weeks — new discoveries, overlooked artists and objects
            worth living with. No noise, no selling.
          </p>
        </div>

        <form className="newsletter__form" method="post" action={action || undefined} data-newsletter="">
          <label className="visually-hidden" htmlFor="newsletter-email">
            Email address
          </label>
          <input
            id="newsletter-email"
            type="email"
            name="email"
            required
            placeholder="your@email.com"
            autoComplete="email"
          />
          <button className="btn btn--solid" type="submit">
            Subscribe
          </button>
          <p className="newsletter__note" data-newsletter-note="" hidden>
            {action
              ? 'Thank you — check your inbox to confirm.'
              : 'Signup isn’t connected yet — the newsletter service will be added soon.'}
          </p>
        </form>

        <p className="newsletter__fine">
          We respect your inbox. Unsubscribe any time. Read our{' '}
          <a href="/privacy-policy">privacy policy</a>.
        </p>
      </div>
    </section>
  );
}
