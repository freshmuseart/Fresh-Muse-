import { site, footerNav } from '../data/site';
import { url } from '../utils/url';

/** Site footer — brand, sitemap columns, social links and legal base row. */
export function Footer() {
  const year = new Date().getFullYear();
  const socials = site.social;

  return (
    <footer className="footer">
      <div className="wrap footer__grid">
        <div className="footer__brand">
          <a className="footer__wordmark" href={url('/')}>
            {site.name}
          </a>
          <p className="footer__tagline">{site.tagline}</p>
          <p className="footer__philosophy">{site.philosophy}</p>
        </div>

        {footerNav.map((group) => (
          <nav className="footer__col" aria-label={group.heading} key={group.heading}>
            <h3>{group.heading}</h3>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <a href={url(link.href)}>{link.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div className="footer__col">
          <h3>Follow</h3>
          <ul>
            {socials.map((s) => (
              <li key={s.href}>
                <a href={s.href} rel="noopener noreferrer" target="_blank">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="wrap footer__base">
        <p>
          © {year} {site.name}. All rights reserved.
        </p>
        <p>
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
        </p>
      </div>
    </footer>
  );
}
