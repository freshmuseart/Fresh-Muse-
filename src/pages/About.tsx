import { Newsletter } from '../components/Newsletter';
import { categories } from '../data/categories';
import { site } from '../data/site';
import { url } from '../utils/url';

/** /about/ — who Fresh Muse is and how it works. */
export function About() {
  return (
    <>
      <section className="section page-hero page-hero--about">
        <div className="wrap wrap--narrow">
          <p className="eyebrow">About</p>
          <h1>An art journal after the gallery has closed.</h1>
          <p className="lede">{site.tagline}</p>
        </div>
      </section>

      <section className="section section--tight section--about">
        <div className="wrap wrap--narrow prose">
          <p>
            Fresh Muse is an independent art and creative culture platform. We sit somewhere between an
            independent publication, a contemporary gallery, a creative journal and a design
            publication — curious about all of them, loyal to none.
          </p>

          <h2>What we believe</h2>
          <p>
            <strong>Art does not have to belong only in museums or to wealthy collectors.</strong> Art,
            objects, artists, materials and creative ideas can become part of everyday life — in the
            rooms we live in, the objects we keep, and the attention we pay.
          </p>
          <p>
            We are interested in the overlooked and the unusual: forms of art that missed their
            recognition, artists working outside the conversation, objects with quiet gravity, and the
            long, strange history of how images and materials travelled to reach us.
          </p>

          <h2>How we work</h2>
          <p>
            Every piece is written to be read in one sitting. We publish slowly, edit carefully, and
            would rather be specific than comprehensive. Sections are made to grow: new categories and
            new writing can be added to this site without rebuilding anything around them.
          </p>

          <blockquote>
            <p>“{site.philosophy}”</p>
          </blockquote>

          <h2>What you'll find here</h2>
          <ul>
            {categories.map((c) => (
              <li key={c.slug}>
                <a href={url(`/${c.slug}`)}>{c.title}</a> — {c.tagline}
              </li>
            ))}
            <li>
              <a href={url('/resources')}>Resources</a> — tools and references for artists and curious
              readers.
            </li>
          </ul>

          <h2>Contact</h2>
          <p>
            Pitches, corrections, suggestions and quiet notes are all welcome:
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>. Or visit the{' '}
            <a href={url('/contact')}>contact page</a>.
          </p>
        </div>
      </section>

      <Newsletter />
    </>
  );
}
