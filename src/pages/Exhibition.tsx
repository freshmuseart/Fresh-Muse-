import { url } from '../utils/url';
import {
  getExhibitionArtworks,
  getExhibitionRooms,
  getExhibitionSettings,
} from '../lib/exhibition';

/**
 * /exhibition/ — the Three.js virtual exhibition.
 *
 * This file renders the PRERENDERED SHELL only: the entry screen, the HUD,
 * the artwork panel, the loading/error states and a static list that doubles
 * as the no-WebGL / no-JS fallback. The 3D engine itself lives in
 * src/exhibition/ and is loaded lazily by src/entrypoints/client.tsx ONLY on
 * this route, so three.js never weighs down the rest of the site.
 *
 * All visible text (title, intro, rooms, artworks) comes from the files in
 * src/content/exhibition/ — edited in the dashboard at /admin/ or by hand.
 */

interface ExhibitionPayload {
  settings: {
    title: string;
    intro: string;
    howTo: string;
    layout: string;
    lighting: string;
    spacing: number;
  };
  rooms: { id: string; title: string; description: string; order: number }[];
  artworks: {
    id: string;
    title: string;
    artist: string;
    description: string;
    room: string;
    order: number;
    image: string;
    link: string;
    linkLabel: string;
    body: string;
    placeholder: boolean;
  }[];
}

export function Exhibition() {
  const settings = getExhibitionSettings();
  const rooms = getExhibitionRooms();
  const artworks = getExhibitionArtworks();

  const payload: ExhibitionPayload = {
    settings: {
      title: settings.title,
      intro: settings.intro,
      howTo: settings.howTo,
      layout: settings.layout,
      lighting: settings.lighting,
      spacing: settings.spacing,
    },
    rooms,
    artworks: artworks.map((a) => ({
      id: a.id,
      title: a.title,
      artist: a.artist,
      description: a.description,
      room: a.room,
      order: a.order,
      image: a.image ? url(a.image) : '',
      link: a.link,
      linkLabel: a.linkLabel,
      body: a.body,
      placeholder: !a.image,
    })),
  };

  // Group artworks under their rooms for the static fallback list.
  const byRoom = rooms.map((room) => ({
    room,
    works: artworks.filter((a) => a.room === room.id),
  }));
  const orphans = artworks.filter((a) => !rooms.some((r) => r.id === a.room));

  const json = JSON.stringify(payload).replace(/</g, '\\u003c');

  return (
    <div className="ex" id="exhibition-root">
      <script
        type="application/json"
        id="ex-data"
        dangerouslySetInnerHTML={{ __html: json }}
      />

      {/* --- loading state --------------------------------------------- */}
      <div className="ex__status" id="ex-status" role="status" aria-live="polite">
        <span className="ex__spinner" aria-hidden="true" />
        <span>Preparing the exhibition…</span>
      </div>

      {/* --- entry screen ------------------------------------------------ */}
      <section className="ex__entry" id="ex-entry" aria-labelledby="ex-title" hidden>
        <p className="eyebrow">Virtual exhibition</p>
        <h1 id="ex-title">{settings.title}</h1>
        <p className="lede">{settings.intro}</p>
        <p className="ex__how">{settings.howTo}</p>
        <div className="ex__actions">
          <button type="button" className="btn btn--solid" id="ex-enter" disabled>
            Enter the exhibition
          </button>
          <a className="btn" href={url('/')}>
            Return to the site
          </a>
        </div>
        <p className="ex__roomline">{rooms.map((r) => r.title).join('  ·  ')}</p>
      </section>

      {/* --- the 3D stage ------------------------------------------------ */}
      <div className="ex__stage" id="ex-stage" hidden>
        <canvas id="ex-canvas" aria-label="Three-dimensional exhibition view" />
        <div className="ex__crosshair" id="ex-crosshair" aria-hidden="true" />
        <p className="ex__target" id="ex-target" hidden />
        <div className="ex__roomintro" id="ex-roomintro" hidden>
          <p className="eyebrow">Now entering</p>
          <h2 id="ex-roomintro-title" />
          <p id="ex-roomintro-desc" />
        </div>

        {/* HUD */}
        <div className="ex__hud" id="ex-hud">
          <div className="ex__hud-left">
            <span className="ex__keyhint">W A S D</span>
            <span className="ex__keyhint">click a work to look closer</span>
            <span className="ex__keyhint">Esc to pause</span>
          </div>
          <div className="ex__hud-right">
            <button type="button" className="ex__pill" id="ex-motion" aria-pressed="false">
              Reduce motion
            </button>
            <button type="button" className="ex__pill" id="ex-leave">
              Leave exhibition
            </button>
          </div>
        </div>

        {/* touch controls */}
        <div className="ex__joystick" id="ex-joystick" hidden aria-hidden="true">
          <div className="ex__joystick-knob" id="ex-joystick-knob" />
        </div>

        {/* pause overlay */}
        <div className="ex__pause" id="ex-pause" hidden>
          <div className="ex__card">
            <p className="eyebrow">Paused</p>
            <h2>Take your time.</h2>
            <div className="ex__actions">
              <button type="button" className="btn btn--solid" id="ex-resume">
                Resume
              </button>
              <button type="button" className="btn" id="ex-pause-leave">
                Leave exhibition
              </button>
            </div>
          </div>
        </div>

        {/* artwork info panel */}
        <aside
          className="ex__info"
          id="ex-info"
          role="dialog"
          aria-modal="false"
          aria-labelledby="ex-info-title"
          hidden
        >
          <button type="button" className="ex__info-close" id="ex-info-close" aria-label="Close artwork details">
            ×
          </button>
          <div className="ex__info-media" id="ex-info-media" />
          <p className="eyebrow" id="ex-info-room" />
          <h2 id="ex-info-title" />
          <p className="ex__info-artist" id="ex-info-artist" />
          <div className="ex__info-body" id="ex-info-body" />
          <p className="ex__badge" id="ex-info-placeholder" hidden>
            Sample artwork — generated placeholder
          </p>
          <a className="btn" id="ex-info-link" href="#" target="_blank" rel="noopener noreferrer sponsored" hidden />
        </aside>
      </div>

      {/* --- error state -------------------------------------------------- */}
      <div className="ex__error" id="ex-error" role="alert" hidden>
        <h2>The exhibition could not open.</h2>
        <p id="ex-error-message">
          Something stopped the 3D view from starting. The whole show is listed below — nothing is
          lost.
        </p>
        <div className="ex__actions">
          <button type="button" className="btn btn--solid" id="ex-retry">
            Try again
          </button>
          <a className="btn" href={url('/')}>
            Return to the site
          </a>
        </div>
      </div>

      {/* --- static fallback list (no WebGL / no JS) ---------------------- */}
      <section className="ex__fallback" id="ex-fallback" aria-labelledby="ex-fallback-title">
        <div className="wrap">
          <p className="eyebrow">Virtual exhibition</p>
          <h2 id="ex-fallback-title">{settings.title}</h2>
          <p className="lede">{settings.intro}</p>
          {byRoom.map(({ room, works }) => (
            <div className="ex__fallback-room" key={room.id}>
              <h3>{room.title}</h3>
              {room.description && <p>{room.description}</p>}
              {works.length === 0 ? (
                <p className="ex__fallback-empty">This room is between hangings.</p>
              ) : (
                <ul className="ex__fallback-list">
                  {works.map((w) => (
                    <li key={w.id}>
                      {w.image && <img src={url(w.image)} alt="" loading="lazy" />}
                      <div>
                        <h4>{w.title}</h4>
                        {w.artist && <p className="ex__fallback-artist">{w.artist}</p>}
                        <p>{w.description}</p>
                        {w.link && (
                          <a href={w.link} target="_blank" rel="noopener noreferrer sponsored">
                            {w.linkLabel || 'Read more'} →
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {orphans.length > 0 && (
            <div className="ex__fallback-room">
              <h3>Also in the show</h3>
              <ul className="ex__fallback-list">
                {orphans.map((w) => (
                  <li key={w.id}>
                    <div>
                      <h4>{w.title}</h4>
                      <p>{w.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="back-link">
            <a href={url('/')}>← Back to the front page</a>
          </p>
        </div>
      </section>
    </div>
  );
}
