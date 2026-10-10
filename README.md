# Fresh Muse

An independent art & creative culture publication — a quiet, static site built
with **Vite + React**, published to GitHub Pages.

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

Pushing to `main` builds and publishes automatically via GitHub Actions
(`.github/workflows/deploy.yml`).
