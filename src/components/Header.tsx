import { site, primaryNav } from '../data/site';
import { url } from '../utils/url';

/**
 * Site masthead — wordmark, primary navigation and the mobile menu.
 * The toggle behaviour lives in src/entrypoints/client.tsx.
 */
export function Header({ path }: { path: string }) {
  const pathname = path.replace(/\/$/, '');
  const isActive = (href: string) => pathname === href.replace(/\/$/, '');

  return (
    <header className="masthead">
      <div className="wrap masthead__inner">
        <a className="wordmark" href={url('/')} aria-label={`${site.name} — home`}>
          <span className="wordmark__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path
                d="M12 2c1.8 4.6 4.4 7.2 9 9-4.6 1.8-7.2 4.4-9 9-1.8-4.6-4.4-7.2-9-9 4.6-1.8 7.2-4.4 9-9z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="wordmark__text">{site.name}</span>
        </a>

        <nav className="masthead__nav" aria-label="Primary">
          <ul>
            {primaryNav.map((item) => (
              <li key={item.href}>
                <a href={url(item.href)} className={isActive(item.href) ? 'active' : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <button
          className="menu-toggle"
          type="button"
          aria-expanded="false"
          aria-controls="mobile-menu"
          aria-label="Open menu"
        >
          <span className="menu-toggle__bars" aria-hidden="true"></span>
        </button>
      </div>

      <div className="mobile-menu" id="mobile-menu" hidden>
        <nav aria-label="Mobile">
          <ul>
            {primaryNav.map((item) => (
              <li key={item.href}>
                <a href={url(item.href)}>{item.label}</a>
              </li>
            ))}
            <li>
              <a href={url('/resources')}>Resources</a>
            </li>
            <li>
              <a href={url('/contact')}>Contact</a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
