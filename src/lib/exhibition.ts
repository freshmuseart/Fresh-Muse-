/**
 * Exhibition content loader — the 3D show at /exhibition/.
 *
 * Reads three places under src/content/exhibition/ at render time, exactly
 * like the article and curated-item loaders:
 *
 *   settings.md      the exhibition title, introduction and controls
 *                    (layout preset, lighting preset, artwork spacing)
 *   rooms/*.md       one file per gallery room (title, description, order)
 *   artworks/*.md    one file per artwork (title, artist, description,
 *                    room, order, optional image and external link)
 *
 * All three are edited from the dashboard at /admin/ (Decap CMS →
 * Exhibition). The same files are the documented fallback while dashboard
 * sign-in is unfinished: copy an existing file, edit the fields, rebuild.
 *
 * An artwork is shown ONLY when `published: true` AND every required field
 * is present — a published artwork with a broken field fails the build
 * loudly instead of shipping a broken room. Node-side only: this module is
 * never shipped to the browser.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter';

const EXHIBITION_DIR = path.resolve(process.cwd(), 'src/content/exhibition');
const ROOMS_DIR = path.join(EXHIBITION_DIR, 'rooms');
const ARTWORKS_DIR = path.join(EXHIBITION_DIR, 'artworks');

export type ExhibitionLayout = 'enfilade' | 'atrium';
export type ExhibitionLighting = 'nocturne' | 'dawn' | 'white-cube';

export interface ExhibitionSettings {
  title: string;
  intro: string;
  /** Controls help shown on the entry screen (keyboard, mouse, touch). */
  howTo: string;
  /** How the rooms are arranged in the 3D plan. */
  layout: ExhibitionLayout;
  /** Light temperature / mood preset. */
  lighting: ExhibitionLighting;
  /** Artwork spacing multiplier — >1 spreads pieces further apart. */
  spacing: number;
}

export interface ExhibitionRoom {
  /** File name without .md — referenced by artworks' `room` field. */
  id: string;
  title: string;
  description: string;
  order: number;
}

export interface ExhibitionArtwork {
  /** File name without .md — used as the generated-art seed. */
  id: string;
  title: string;
  artist: string;
  description: string;
  /** Room id (a file name in rooms/) this piece hangs in. */
  room: string;
  order: number;
  /** Public image path (/images/exhibition/…), or '' for generated art. */
  image: string;
  /** Optional external page about the work — must be https://, or ''. */
  link: string;
  linkLabel: string;
  /** Raw markdown body — longer wall-label copy (optional). */
  body: string;
}

const SETTINGS_FILE = path.join(EXHIBITION_DIR, 'settings.md');

const DEFAULT_SETTINGS: ExhibitionSettings = {
  title: 'The Fresh Muse Exhibition',
  intro:
    'A quiet, after-hours walk through selected works — arranged as rooms you can move through.',
  howTo:
    'Move with the arrow keys or W A S D, look with the mouse, and click any work to step closer. On a phone: drag left to walk, drag right to look, tap a work to open it.',
  layout: 'enfilade',
  lighting: 'nocturne',
  spacing: 1,
};

function readMdDir(dir: string): { file: string; data: Record<string, string>; body: string }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const { data, body } = parseFrontmatter(readFileSync(path.join(dir, file), 'utf8'));
      return { file, data, body };
    });
}

/** Exhibition title, intro and controls. Falls back to sensible defaults. */
export function getExhibitionSettings(): ExhibitionSettings {
  if (!existsSync(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS };
  const { data } = parseFrontmatter(readFileSync(SETTINGS_FILE, 'utf8'));

  const layout: ExhibitionLayout = data.layout === 'atrium' ? 'atrium' : 'enfilade';
  const lighting: ExhibitionLighting =
    data.lighting === 'dawn'
      ? 'dawn'
      : data.lighting === 'white-cube'
        ? 'white-cube'
        : 'nocturne';
  const spacing = Number.parseFloat(data.spacing ?? '');
  const parsedSpacing = Number.isFinite(spacing) && spacing >= 0.6 && spacing <= 2 ? spacing : 1;

  return {
    title: data.title?.trim() || DEFAULT_SETTINGS.title,
    intro: data.intro?.trim() || DEFAULT_SETTINGS.intro,
    howTo: data.how_to?.trim() || DEFAULT_SETTINGS.howTo,
    layout,
    lighting,
    spacing: parsedSpacing,
  };
}

/** Published rooms, ordered by `order` then file name. */
export function getExhibitionRooms(): ExhibitionRoom[] {
  return readMdDir(ROOMS_DIR)
    .filter(({ data }) => data.published !== 'false')
    .map(({ file, data }, i) => {
      if (!data.title) {
        throw new Error(
          `Exhibition room "${file}" is missing a title. Fill it in the dashboard ` +
            `(or set published: false) and build again.`,
        );
      }
      return {
        id: file.replace(/\.md$/, ''),
        title: data.title,
        description: data.description ?? '',
        order: Number.parseInt(data.order ?? '', 10) || i + 1,
      };
    })
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/**
 * Published artworks, grouped by their room's order then their own `order`.
 * Fails loudly when a published piece is incomplete or points at a room
 * that does not exist.
 */
export function getExhibitionArtworks(): ExhibitionArtwork[] {
  const rooms = getExhibitionRooms();
  const roomOrder = new Map(rooms.map((r) => [r.id, r.order]));

  const artworks = readMdDir(ARTWORKS_DIR)
    .filter(({ data }) => data.published === 'true')
    .map(({ file, data, body }) => {
      const missing = ['title', 'artist', 'description', 'room'].filter((k) => !data[k]);
      if (missing.length > 0) {
        throw new Error(
          `Exhibition artwork "${file}" is published but is missing: ${missing.join(', ')}. ` +
            `Fill the field in the dashboard (or set published: false) and build again.`,
        );
      }
      if (!roomOrder.has(data.room)) {
        throw new Error(
          `Exhibition artwork "${file}" points at room "${data.room}", which does not exist. ` +
            `Use the name of a file in src/content/exhibition/rooms/ (created under ` +
            `Exhibition Rooms in the dashboard), or publish that room first.`,
        );
      }
      const link = data.link ?? '';
      if (link && !/^https:\/\/.+/.test(link)) {
        throw new Error(
          `Exhibition artwork "${file}" has an unusable link. Use a full https:// URL ` +
            `(it is published verbatim), or leave the field empty.`,
        );
      }

      return {
        id: file.replace(/\.md$/, ''),
        title: data.title,
        artist: data.artist ?? '',
        description: data.description,
        room: data.room,
        order: Number.parseInt(data.order ?? '', 10) || 0,
        image: data.image ?? '',
        link,
        linkLabel: data.link_label ?? '',
        body,
      };
    });

  // Group into room order, then artwork order, then file name (rename to
  // break ties — the same convention as the curated items).
  return artworks.sort(
    (a, b) =>
      (roomOrder.get(a.room) ?? 0) - (roomOrder.get(b.room) ?? 0) ||
      a.order - b.order ||
      a.id.localeCompare(b.id),
  );
}
