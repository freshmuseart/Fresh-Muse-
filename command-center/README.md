# Fresh Muse Command Center

> A plain-English control panel for the Fresh Muse website. You type what you
> want changed — “make the homepage title bigger”, “add TikTok to the social
> links” — and the system finds the right files, makes the smallest change,
> runs the project's checks, and shows you the result. **No filenames, no
> code, no terminal commands, ever.**

The Command Center is completely separate from the website itself:

- the website (`src/`) never imports the Command Center's logic,
- the published site never exposes the Command Center (it shows a quiet
  closed notice; the live panel belongs to the studio environment),
- credentials live only in the environment — never in this repository.

---

## Using it

1. Open the site preview and go to **`/command-center`**.
2. Type what you want in the big box → **Apply change**.
3. Watch the activity line; when it finishes, look at the **live preview**.
4. Keep the change by saving it from Freebuff's **Changes panel** (that is
   what commits it), or press **Undo last change** to revert.

That's the whole workflow. Two things may occasionally appear:

- **A question** — if your request could mean two very different things, the
  system asks one short plain-language question instead of guessing.
- **A confirmation** — if a change would delete a file, you are asked first.
  “No, cancel everything” reverts the whole request.

Every attempt is written to **The record** (instruction, result, files
touched) so you can always see what happened — and undo it.

## One-time setup (the only technical step)

The engine needs an AI model to interpret language. Add **one free key**:

1. Get a free API key — [Google AI Studio](https://aistudio.google.com/apikey)
   (free tier, no credit card) is the simplest.
2. In Freebuff: **Settings → Environment** → add
   `FRESHMUSE_AI_API_KEY` = your key.
3. Reload `/command-center`.

Optional environment variables (only if you use a different provider):

| Variable | Default | Purpose |
|---|---|---|
| `FRESHMUSE_AI_BASE_URL` | Google Gemini OpenAI-compatible endpoint | any OpenAI-compatible API (OpenRouter, Groq, local Ollama…) |
| `FRESHMUSE_AI_MODEL` | `gemini-2.5-flash` | which model to use |

If you ever see “not connected to an AI model yet”, the key above is the fix.

## What it can change today

Visual and content changes inside this repository: typography, colours,
spacing, layout, copy, navigation, footer, social links, newsletter settings,
new articles (markdown), new sections (data-driven), and general page edits —
plus pure questions like *“show me everything currently connected to the
website.”*

## Safety model (why you can trust it)

- **Smallest change policy** is built into the engine; it reads before it
  writes and never touches unrelated files.
- **Guardrails, not promises:** paths are resolved inside the project;
  credentials (`.env*`), `.git`, `node_modules` and build output are
  off-limits to the engine; deletions always require your confirmation.
- **Checks are real:** after any edit the project's actual typecheck and
  Astro check run. If they keep failing, **everything from that request is
  rolled back** and reported — the site never ends up broken by a bad change.
- **Undo:** each request snapshots the files it touches *before* touching
  them, so **Undo last change** restores the true previous state.
- **Nothing is committed by the system.** Changes sit uncommitted until you
  save them from Freebuff's Changes panel — your preview is the gate, and
  commits/deployments stay under your control.
- **History** lives in `command-center/.state/` (git-ignored, local only).

## How it is built (for the curious)

```
src/pages/command-center.astro   the panel page (a thin shell)
src/pages/api/command.ts         dev-only API: run (streamed), undo, history, status
command-center/
├── engine/
│   ├── index.ts                 orchestrator: AI tool loop → edits → checks → result
│   ├── provider.ts              OpenAI-compatible AI adapter (env-configured)
│   ├── tools.ts                 guarded tools: read/write/delete, checks, connections
│   ├── history.ts               snapshots, the record, undo
│   └── overview.ts              project map given to the model
└── ui/panel.ts                  the browser-side panel logic
```

The interface (what you type) is fully separated from the engine (how it is
done) and from the website (what it edits) — which is what lets this grow
into a broader Fresh Muse management hub: future commands like *“add this
article and draft an Instagram caption”*, *“update the affiliate product”*,
*“what broke after the last update?”* plug in as new tools beside the
existing file tools, using the same panel.
