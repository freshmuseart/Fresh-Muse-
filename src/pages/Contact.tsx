import { site } from '../data/site';

/** /contact/ — a mailto form plus direct links. */
export function Contact() {
  return (
    <>
      <section className="section page-hero page-hero--contact">
        <div className="wrap wrap--narrow">
          <p className="eyebrow">Contact</p>
          <h1>Send a note after hours.</h1>
          <p className="lede">
            Pitches, corrections, collaborations, gallery tips and quiet observations — all read by a
            person.
          </p>
        </div>
      </section>

      <section className="section section--tight">
        <div className="wrap contact-grid">
          {/*
            NON-PROGRAMMER NOTE: this form opens the visitor's own email client.
            To use a form service instead, replace `action` below with your
            provider's endpoint (e.g. Formspree, Buttondown).
          */}
          <form
            className="contact-form"
            method="post"
            action={`mailto:${site.contactEmail}`}
            encType="text/plain"
          >
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" type="text" required autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="subject">Subject</label>
              <input id="subject" name="subject" type="text" />
            </div>
            <div className="field">
              <label htmlFor="message">Message</label>
              <textarea id="message" name="message" rows={7} required></textarea>
            </div>
            <button className="btn btn--solid" type="submit">
              Compose message
            </button>
            <p className="contact-form__note">
              This opens your email app with the message ready to send — nothing is stored on this
              site.
            </p>
          </form>

          <aside className="contact-aside">
            <h2>Direct</h2>
            <p>
              <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
            </p>

            <h2>Elsewhere</h2>
            <ul>
              {site.social.map((s) => (
                <li key={s.href}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>

            <blockquote>
              <p>“{site.philosophy}”</p>
            </blockquote>
          </aside>
        </div>
      </section>
    </>
  );
}
