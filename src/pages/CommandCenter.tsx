import { url } from '../utils/url';

/**
 * Fresh Muse — Command Center.
 *
 * A calm, editorial control panel: one text box, one button, a live preview,
 * and a record of what changed. All logic lives in `command-center/` — this
 * page is only its shell. In the published build it renders a quiet closed
 * notice; the live panel belongs to the studio environment (the panel script
 * is initialised from src/entrypoints/client.tsx when the form exists).
 */
const examples = [
  'Make the homepage title bigger.',
  'Change the newsletter button to black.',
  'Add TikTok to the social links.',
  'Make the mobile layout less crowded.',
];

export function CommandCenter({ dev }: { dev: boolean }) {
  if (!dev) {
    return (
      <section className="cc closed">
        <p className="eyebrow">Fresh Muse — Studio</p>
        <h1>Command Center</h1>
        <p className="lede">
          The Command Center lives alongside the site while it is being edited. The published site
          remains a quiet, static gallery — exactly as intended.
        </p>
        <a className="btn btn-primary" href={url('/')}>
          Back to the site
        </a>
      </section>
    );
  }

  return (
    <section className="cc" data-live="true">
      <header className="cc-head">
        <p className="eyebrow">Fresh Muse — Studio</p>
        <h1>Command Center</h1>
        <p className="lede">
          Say what you would like changed, in your own words. The change is made, checked, and shown
          in the preview — nothing joins the site until you decide to keep it.
        </p>
      </header>

      <div className="cc-grid">
        <div className="cc-main">
          <form id="cc-form" className="composer">
            <textarea
              id="cc-input"
              rows={4}
              placeholder="Make the homepage feel more like an art magazine — keep the colours, but strengthen the typography…"
              aria-label="Describe the change you want"
            />
            <div className="composer-row">
              <button id="cc-apply" className="btn btn-primary" type="submit">
                Apply change
              </button>
              <span className="hint">Plain English is enough.</span>
            </div>
          </form>

          <div className="chips" aria-label="Example instructions">
            {examples.map((text) => (
              <button className="chip" type="button" data-example={text} key={text}>
                {text}
              </button>
            ))}
          </div>

          <div id="cc-ask" className="dialog" hidden>
            <p className="dialog-label">A question before I proceed</p>
            <p id="cc-ask-text" className="dialog-q"></p>
            <div className="dialog-row">
              <input id="cc-ask-input" type="text" placeholder="Your answer…" aria-label="Your answer" />
              <button id="cc-ask-send" className="btn btn-primary" type="button">
                Send
              </button>
            </div>
          </div>

          <div id="cc-confirm" className="dialog confirm" hidden>
            <p className="dialog-label">Confirmation needed</p>
            <p id="cc-confirm-text" className="dialog-q"></p>
            <p id="cc-confirm-detail" className="dialog-detail"></p>
            <div className="dialog-row">
              <button id="cc-confirm-yes" className="btn btn-primary" type="button">
                Yes, apply it
              </button>
              <button id="cc-confirm-no" className="btn btn-ghost" type="button">
                No, cancel everything
              </button>
            </div>
          </div>

          <p id="cc-status" className="status" role="status" aria-live="polite"></p>

          <section className="block activity">
            <h2>Activity</h2>
            <ol id="cc-activity"></ol>
          </section>

          <section className="block record">
            <div className="block-head">
              <h2>The record</h2>
              <button id="cc-undo" className="btn btn-ghost" type="button">
                Undo last change
              </button>
            </div>
            <ol id="cc-history"></ol>
            <p id="cc-empty" className="empty">
              Nothing yet — your first instruction will appear here.
            </p>
          </section>
        </div>

        <aside className="cc-side">
          <div className="preview-frame">
            <div className="preview-bar">
              <span className="preview-label">Live preview</span>
              <span className="preview-actions">
                <button id="cc-refresh" className="linkish" type="button">
                  Refresh
                </button>
                <a href={url('/')} target="_blank" rel="noopener">
                  Open ↗
                </a>
              </span>
            </div>
            <iframe id="cc-preview" src={url('/')} title="Fresh Muse live preview"></iframe>
          </div>
          <p className="side-note">
            Every change appears here at once, and stays <em>uncommitted</em> until you save it from
            Freebuff's Changes panel. Undo reverts the most recent change at any time.
          </p>
          <p id="cc-connections" className="side-note faint"></p>
        </aside>
      </div>
    </section>
  );
}
