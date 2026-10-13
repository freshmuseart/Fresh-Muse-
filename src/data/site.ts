/**
 * Fresh Muse — site-wide configuration.
 *
 * NON-PROGRAMMER NOTE: This file holds the site name, navigation,
 * footer links, social links and contact details.
 * Edit the values between quotes to change them everywhere at once.
 */

export const site = {
  name: 'Fresh Muse',
  tagline: 'Art, objects and ideas for a more intentional world.',
  description:
    'Fresh Muse is an independent art and creative culture platform exploring overlooked art, artists, interiors, collectible objects, art history and the quiet ways art enters everyday life.',
  philosophy: 'Quietly unforgettable.',
  contactEmail: 'hello@freshmuse.art', // ← replace with your real address
  /**
   * Social profiles — shown in the footer and on the contact page.
   * The list order is the display order; edit a URL between the quotes to
   * change it everywhere at once.
   */
  social: [
    { label: 'TikTok', href: 'https://www.tiktok.com/@fresh.muse?lang=en' },
    { label: 'Instagram', href: 'https://www.instagram.com/freshmusegallery/?hl=en' },
    { label: 'Substack', href: 'https://substack.com/@freshmuse' },
    {
      label: 'LinkedIn',
      href: 'https://www.linkedin.com/in/freshmuse-gallery-208280442/',
    },
    { label: 'Pinterest', href: 'https://www.pinterest.com/freshmusegallery/' },
  ],
  /**
   * Newsletter provider endpoint (Buttondown, Mailchimp, ConvertKit, …).
   * Leave EMPTY and the form shows a friendly "not connected yet" note.
   * Paste your provider's form action URL between the quotes to go live.
   */
  newsletterAction: '',
} as const;

/** Header navigation — short labels keep the top bar calm. */
export const primaryNav = [
  { label: 'Almost Missed', href: '/art-you-almost-missed' },
  { label: 'Art × Interior', href: '/art-interior' },
  { label: 'Artists', href: '/artists' },
  { label: 'Objects', href: '/collectible-objects' },
  { label: 'History', href: '/art-history' },
  { label: 'Collections', href: '/shop' },
  { label: 'Exhibition', href: '/exhibition' },
  { label: 'About', href: '/about' },
];

/** Footer sitemap — full names, grouped. */
export const footerNav = [
  {
    heading: 'Sections',
    links: [
      { label: 'Art You Almost Missed', href: '/art-you-almost-missed' },
      { label: 'Art × Interior', href: '/art-interior' },
      { label: 'Artists', href: '/artists' },
      { label: 'Collectible Objects', href: '/collectible-objects' },
      { label: 'Art History', href: '/art-history' },
      { label: 'Exhibition', href: '/exhibition' },
      { label: 'Resources', href: '/resources' },
    ],
  },
  {
    heading: 'Fresh Muse',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Collections', href: '/shop' },
      { label: 'Privacy Policy', href: '/privacy-policy' },
      { label: 'Affiliate Disclosure', href: '/affiliate-disclosure' },
    ],
  },
];
