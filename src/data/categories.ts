/**
 * Fresh Muse — editorial categories.
 *
 * NON-PROGRAMMER NOTE: To add a NEW category/section later:
 *   1. Copy one of the blocks below, paste it into the list, change the values.
 *   2. Give it a unique `slug` (lowercase, hyphens, no spaces).
 *   3. Save. The page /your-slug is created automatically.
 * Nothing else needs to change.
 */

export interface Category {
  /** URL of the section, e.g. /art-you-almost-missed */
  slug: string;
  /** Number shown on cards, e.g. "01" */
  index: string;
  /** Full display name */
  title: string;
  /** Short label used in the top navigation */
  navLabel: string;
  /** One-line promise under the title */
  tagline: string;
  /** Longer introduction shown at the top of the section page */
  description: string;
}

export const categories: Category[] = [
  {
    slug: 'art-you-almost-missed',
    index: '01',
    title: 'Art You Almost Missed',
    navLabel: 'Almost Missed',
    tagline: 'Discover unusual, overlooked or under-discussed forms of art.',
    description:
      'Not every important work announces itself. This section looks sideways — at forgotten media, quiet gestures, outsider practices and the pieces that reward a second look.',
  },
  {
    slug: 'art-interior',
    index: '02',
    title: 'Art × Interior',
    navLabel: 'Art × Interior',
    tagline: 'Explore how art affects spaces, atmosphere, identity and human perception.',
    description:
      'A room is never only a room. We look at how colour, objects, light and placement shape the way a space feels — and how living with art quietly reshapes the people who live there.',
  },
  {
    slug: 'artists',
    index: '03',
    title: 'Artists',
    navLabel: 'Artists',
    tagline: 'Discover artists, makers and creative practitioners.',
    description:
      'Studio visits, working methods and long conversations with emerging and established practitioners — including the ones the art world has not caught up with yet.',
  },
  {
    slug: 'collectible-objects',
    index: '04',
    title: 'Collectible Objects',
    navLabel: 'Objects',
    tagline: 'Explore unusual objects, editions, arrangements and artistic pieces.',
    description:
      'Editions, one-offs, useful things made beautiful. A considered look at objects worth living with — and how to begin collecting without pretending to be a museum.',
  },
  {
    slug: 'art-history',
    index: '05',
    title: 'Art History',
    navLabel: 'History',
    tagline: 'Short, engaging discoveries about artists, movements, objects and cultural history.',
    description:
      'Art history without the lecture. Small, surprising stories about how images, materials and ideas travelled — written to be read in a single sitting.',
  },
];

/** Reserved slugs that must not collide with hand-written pages. */
export const RESERVED_SLUGS = [
  'about',
  'contact',
  'resources',
  'shop',
  'privacy-policy',
  'affiliate-disclosure',
  'articles',
  'index',
];

export function getCategory(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}
