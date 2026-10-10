import { site } from '../data/site';

/** /privacy-policy/ — plain-language privacy policy. */
export function PrivacyPolicy() {
  return (
    <>
      <section className="section page-hero page-hero--legal">
        <div className="wrap wrap--narrow">
          <p className="eyebrow">Legal</p>
          <h1>Privacy Policy</h1>
          <p className="lede">Plain language, no dark patterns. Last updated: October 2026.</p>
        </div>
      </section>

      <section className="section section--tight">
        <div className="wrap wrap--narrow prose">
          <p>
            Fresh Muse respects your attention and your data. This page explains, in ordinary language,
            what we collect, what we don't, and what you can do about it.
          </p>

          <h2>What we collect</h2>
          <p>
            This website is static: it has no user accounts, no tracking pixels and no advertising
            network. We do not collect personal information merely because you visited.
          </p>
          <ul>
            <li>
              <strong>Newsletter:</strong> if you subscribe, we receive your email address and use it
              only to send the Fresh Muse dispatch. You can unsubscribe from any email.
            </li>
            <li>
              <strong>Contact form:</strong> messages are sent through your own email client; nothing
              is stored on this website.
            </li>
            <li>
              <strong>Hosting logs:</strong> like most hosts, GitHub Pages records basic request data
              (IP address, user agent) for security and reliability. We do not access it for profiling.
            </li>
          </ul>

          <h2>What we don't do</h2>
          <ul>
            <li>No third-party advertising or cross-site tracking.</li>
            <li>No selling or sharing of personal data — ever.</li>
            <li>No unnecessary cookies.</li>
          </ul>

          <h2>Third parties</h2>
          <p>
            If we later add a service (for example a newsletter provider), we will name it here and
            link to its own privacy policy before it goes live.
          </p>

          <h2>Your rights</h2>
          <p>
            You can ask what data we hold about you, request correction or deletion, or withdraw
            consent at any time by writing to{' '}
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>. We respond within a
            reasonable time and without fuss.
          </p>

          <h2>Changes</h2>
          <p>
            If this policy changes materially, we will update this page and revise the date above.
          </p>

          <h2>Contact</h2>
          <p>
            Questions? Write to <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
          </p>
        </div>
      </section>
    </>
  );
}
