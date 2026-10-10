import { url } from '../utils/url';

/** /404.html — served by GitHub Pages for any unknown path. */
export function NotFound() {
  return (
    <section className="section lost">
      <div className="wrap wrap--narrow lost__inner">
        <p className="lost__mark" aria-hidden="true">
          ✳
        </p>
        <p className="eyebrow">Error 404</p>
        <h1>This room of the gallery is empty.</h1>
        <p className="lede">
          The page you were looking for has been moved, renamed, or never hung on this wall.
        </p>
        <div className="lost__actions">
          <a className="btn btn--solid" href={url('/')}>
            Return to the front page
          </a>
          <a className="btn" href={url('/articles')}>
            Browse all writing
          </a>
        </div>
      </div>
    </section>
  );
}
