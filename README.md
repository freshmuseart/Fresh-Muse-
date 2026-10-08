# Fresh Muse 🌙

Official website and digital platform for **Fresh Muse** — an independent art and
creative culture platform exploring overlooked art, artists, interiors, collectible
objects, art history and the quiet ways art enters everyday life.

> "Art, objects and ideas for a more intentional world."
> — *Quietly unforgettable.*

---

## Live site

Published with **GitHub Pages** (free) from the `main` branch via GitHub Actions.
Every push to `main` rebuilds and republishes the site automatically.

---

## For non-programmers: how to update the site

You only ever need to touch **two places**: `src/content/articles/` and
`src/data/`. Everything else runs itself.

### ✎ Add a new article

1. Copy an existing file in `src/content/articles/`.
2. Rename it (lowercase, hyphens, e.g. `my-new-piece.md`).
3. Edit the block between the top `---` lines:

   ```yaml
   title: "Your Title Here"
   description: "One sentence summary shown on cards."
   category: "artists"          # one of: art-you-almost-missed, art-interior,
                                #         artists, collectible-objects, art-history
   date: 2026-10-07
   featured: true               # true → shows in the homepage featured slot
   author: "Fresh Muse"
   ```

4. Below the second `---`, write the article in normal text. Start a new section
   with `## Heading`, emphasise with `*italics*`, quote with `>`.

That's it — the card, the listing page, the article page and the homepage all
update by themselves.

### ✎ Add a whole new section/category

Open `src/data/categories.ts`, copy one block in the list, change the values and
give it a unique `slug`. The page `/your-slug` is created automatically.

### ✎ Change navigation, footer, social links, contact email

All in **`src/data/site.ts`** — plain text between quotes.

### ✎ Connect the newsletter

In `src/data/site.ts`, paste your form provider's URL into
`newsletterAction: ''`. Until then, the signup form shows a friendly
"not connected yet" note.

### ✎ Change colors / fonts

`src/styles/global.css` → edit the `:root` tokens at the top. Every color on the
site references these variables.

---

## For developers

```bash
bun install        # install dependencies
bun run dev        # local dev server at http://localhost:4321
bun run build      # static build → dist/
bun run preview    # preview the production build
bunx astro check   # type-check
```

**Stack:** [Astro 5](https://astro.build) (static output, zero client JS by default),
TypeScript strict, plain scoped CSS in `.astro` files. Fonts self-hosted via
Fontsource (Fraunces + IBM Plex Sans) — no external font requests.

**Architecture**

```
src/
├── content/articles/*.md   ← articles live here (markdown + frontmatter)
├── data/
│   ├── categories.ts       ← sections of the journal (drives nav + pages)
│   └── site.ts             ← nav, footer, socials, newsletter, contact
├── pages/
│   ├── index.astro         ← homepage
│   ├── [category].astro    ← auto-generated section pages
│   ├── articles/           ← all-writing index + [slug] article pages
│   └── *.astro             ← about, contact, resources, legal pages
├── components/             ← Header, Footer, cards, NightSky hero canvas…
├── layouts/BaseLayout.astro
└── styles/global.css       ← design tokens + shared utilities
```

- **Design language:** original, night-sky motion — flow-field hero canvas,
  generated SVG "ArtPlates", restrained gold accents on midnight/indigo.
  (Inspired by the *feeling* of painterly night movement; it reproduces no artwork.)
- **Adding pages:** drop a `.astro` file in `src/pages/`.
- **Base path:** `astro.config.mjs` reads `BASE_PATH`/`SITE_URL` env vars so the
  same build works on GitHub Pages project sub-paths and custom domains.

## Deploying to GitHub Pages

1. In the repo **Settings → Pages**, set *Source* to **GitHub Actions**.
2. Push to `main` — `.github/workflows/deploy.yml` builds and publishes.

To use a custom domain later: add a `CNAME` file in `public/`, then set
`SITE_URL=https://yourdomain.com` and `BASE_PATH=/` in the workflow.

---

## Social integration (Instagram + TikTok) — prepared, not connected

Target accounts: **[@freshmusegallery](https://www.instagram.com/freshmusegallery/)**
on Instagram, **[@fresh.muse](https://www.tiktok.com/@fresh.muse)** on TikTok.
The five social profiles linked in the footer/contact page live in
`src/data/site.ts`.

The publishing architecture lives entirely in **`social/`** and is completely
separate from the website: no credentials in the repo, no tokens in the
frontend, OAuth-only account connection, server-side publishing.

```bash
bun social/cli.ts status     # what is still missing (names only, offline)
bun social/cli.ts publish    # dry run — publishes nothing
```

Setup checklists (Meta/TikTok portal steps, scopes, redirect URLs, GitHub
Secrets/Variables, and what stays blocked until platform approval) are in
**`social/README.md`**. The manual `Social publishing` workflow in
`.github/workflows/social-publish.yml` runs only from the Actions tab and
only publishes when its input is exactly `publish`.

---

## Command Center — manage the site in plain English

Open **`/command-center`** in the dev preview: type what you want changed
(“make the homepage title bigger”), press **Apply change**, and the system
edits the right files, runs the checks, and shows the preview. Undo and a
full change record are built in; nothing is committed until you save from
the Changes panel.

One-time setup: add `FRESHMUSE_AI_API_KEY` (a free AI key) in
Settings → Environment. Full guide: **`command-center/README.md`**.
