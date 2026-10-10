import { url } from '../utils/url';

const groups = [
  {
    title: 'For artists & makers',
    items: [
      {
        name: 'Portfolio basics',
        note: 'How to sequence work so it reads as a practice, not a pile.',
        href: '/artists',
      },
      {
        name: 'Pricing without apology',
        note: 'A working framework for editions, commissions and one-offs.',
        href: '/collectible-objects',
      },
      {
        name: 'Studio rituals',
        note: 'Small systems that keep the work moving on low-energy days.',
        href: '/articles/the-last-letterpress-studio-above-a-bakery',
      },
    ],
  },
  {
    title: 'For collectors & readers',
    items: [
      {
        name: 'Starting a collection',
        note: 'What to buy first when the budget is honest and small.',
        href: '/articles/art-the-size-of-a-matchbox',
      },
      {
        name: 'Living with art',
        note: 'Placement, light, rotation — rooms that keep breathing.',
        href: '/art-interior',
      },
      {
        name: 'Editions explained',
        note: 'Numbers, proofs, signatures: what the little fraction means.',
        href: '/articles/twelve-of-twelve-why-the-last-edition-sells-first',
      },
    ],
  },
  {
    title: 'For the curious',
    items: [
      {
        name: 'Reading a painting',
        note: 'A short primer on looking slowly, without needing a degree.',
        href: '/articles/who-decided-the-sky-was-blue',
      },
      {
        name: 'Glossary of movements',
        note: 'From Baroque to relational aesthetics, briefly.',
        href: '/art-history',
      },
      {
        name: 'Museums after hours',
        note: 'How to visit like an editor rather than a tourist.',
        href: '/art-you-almost-missed',
      },
    ],
  },
];

/** /resources/ — curated guidance grouped for three kinds of reader. */
export function Resources() {
  return (
    <>
      <section className="section page-hero page-hero--resources">
        <div className="wrap wrap--narrow">
          <p className="eyebrow">Resources</p>
          <h1>Tools for living with art.</h1>
          <p className="lede">
            Practical guidance, gathered slowly. Every entry is written or curated by Fresh Muse — no
            affiliate clutter, no filler.
          </p>
        </div>
      </section>

      <section className="section section--tight section--resources">
        <div className="wrap">
          {groups.map((group) => (
            <div className="res-group" key={group.title}>
              <h2>{group.title}</h2>
              <div className="res-grid">
                {group.items.map((item) => (
                  <a className="res-card" href={url(item.href)} key={item.name}>
                    <h3>{item.name}</h3>
                    <p>{item.note}</p>
                    <span aria-hidden="true">→</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
