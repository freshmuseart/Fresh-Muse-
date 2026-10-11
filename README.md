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
- `src/lib/` — markdown renderer, frontmatter parser, article loader, routes
- `scripts/build-static.mjs` — prerenders every route into `dist/`, plus
  `robots.txt` and the sitemap pair
- `command-center/` — the studio panel, available only in `bun run dev`

## Publishing content

- **Articles** — `src/content/articles/*.md`, edited at **`/admin/`** through
  the Decap dashboard (or by hand). `draft: true` hides an article.
- **Shop products** — `src/content/products/*.md`, same dashboard under
  **Products**. Only `published: true` products appear on `/shop/`; checkout
  links point at Payhip, never to files stored in this repository.
- **The dashboard itself** — static shell in `public/admin/`, sign-in through
  the OAuth proxy in `cloudflare-worker/` (setup steps in its README). No
  credential is ever stored in this repository or its build output.

GitHub is the source of truth: everything above is committed to `main`.

> **Deployment note (verified):** Freebuff hosting does **not** redeploy
> automatically when `main` receives a push — three separate pushes produced
> no new deployment. After publishing, trigger the build yourself: press
> **Deploy** in Freebuff, or run `freebuff-deploy start`. Until then,
> production keeps serving the previous build.

`.github/workflows/deploy.yml` is the separate GitHub Pages workflow; GitHub
Pages is switched off in repository settings, so that channel stays dark.
