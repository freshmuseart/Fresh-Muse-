# Fresh Muse

An independent art & creative culture publication — a quiet, static site built
with **Vite + React** and published as plain static HTML (Freebuff hosting in
production at `freshmuse.freebuff.app`).

You edit it, it builds — `src/content/articles/*.md` for new writing,
`src/data/` for navigation and site config. Every page is rendered to plain
HTML at build time, so there is no server and nothing to babysit.

## Commands

| Command | What it does |
| --- | --- |
| `bun install` | install dependencies |
| `bun run dev` | local studio server (site + Command Center) |
| `bun run build` | static production build into `dist/` |
| `bun run preview` | serve the built `dist/` locally |
| `bun social/cli.ts …` | social publishing helpers |

## How it fits together

- `src/pages/*.tsx` — one React component per page (home, sections, articles…)
- `src/components/*.tsx` — shared UI (masthead, footer, cards, procedural art)
- `src/lib/` — markdown renderer, frontmatter parser, article / curated-item /
  moodboard loaders, routes
- `scripts/build-static.mjs` — prerenders every route into `dist/`, plus
  `robots.txt` and the sitemap pair
- `command-center/` — the studio panel, available only in `bun run dev`

## The business model

Fresh Muse is an art curation and affiliate site. It does **not** sell
directly: there is no checkout, no cart, no payment processor and no customer
account anywhere in this repository. Revenue comes from affiliate commissions
on approved programs.

- **/shop/ is the "Collections" page** — curated moodboards of art, editions
  and objects. Every card links out to the retailer that carries the piece
  (`target="_blank" rel="noopener noreferrer sponsored"`); the URL is
  published verbatim, tracking parameters included.
- Cards with **Affiliate link** on are marked `rel="sponsored"`; the full
  disclosure lives at `/affiliate-disclosure/` and is linked from the footer.
- Prices on cards are display only — the retailer's page is the source of
  truth.

## Publishing content

- **Articles** — `src/content/articles/*.md`, edited at **`/admin/`** through
  the Decap dashboard (or by hand). `draft: true` hides an article.
- **Curated items** — `src/content/products/*.md`, same dashboard under
  **Curated Items**. Each item needs a retailer link (https, copied exactly);
  `published: true` items appear on `/shop/`. No payment fields exist.
- **Moodboards** — `src/content/collections/*.md`, dashboard under
  **Moodboards**. A published moodboard groups its items at the top of
  `/shop/`; items naming an unpublished moodboard stay hidden with it.
  Items without a moodboard are listed under "Curated finds".
- **The dashboard itself** — static shell in `public/admin/`, sign-in through
  the OAuth proxy in `cloudflare-worker/` (setup steps in its README). No
  credential is ever stored in this repository or its build output.

GitHub is the source of truth: everything above is committed to `main`.

## Deployment

Production is Freebuff hosting (`freshmuse.freebuff.app`); the repository is
on GitHub. To ship a change:

1. Commit and push to `main` (or save from Freebuff's Changes panel).
2. Trigger the build: press **Deploy** in Freebuff, or run
   `freebuff-deploy start`.

> **Deployment note (verified):** Freebuff hosting does **not** redeploy
> automatically when `main` receives a push — pushes to `main` produced no
> new deployment. Until a deploy is triggered, production keeps serving the
> previous build.

`SITE_URL` (canonical URLs, sitemap, robots.txt) defaults to
`https://freshmuse.freebuff.app` in `scripts/build-static.mjs` and
`src/layouts/Layout.tsx`; override it via the `SITE_URL` environment
variable only if the domain changes.

`.github/workflows/deploy.yml` is the separate GitHub Pages workflow; GitHub
Pages is switched off in repository settings, so that channel stays dark.
