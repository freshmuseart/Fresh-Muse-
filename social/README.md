# Fresh Muse — social integration architecture

> **Status: prepared, not connected.** Nothing here has been authorized,
> nothing has been published, and no credential exists anywhere in this
> repository. The website and its approved visual design are untouched —
> this directory is completely separate from the frontend.

Goal: publish **approved** Fresh Muse content to Fresh Muse's own Instagram
and TikTok accounts through the platforms' **official APIs only** — OAuth
account authorization (never password login), server-side publishing, tokens
held exclusively in environment variables / GitHub Actions secrets.

**Target accounts** — the profiles this integration is built for (the same
ones linked from the website's footer and contact page):

| Platform | Profile | URL |
|---|---|---|
| Instagram | `@freshmusegallery` | <https://www.instagram.com/freshmusegallery/> |
| TikTok | `@fresh.muse` | <https://www.tiktok.com/@fresh.muse> |

The other profiles on the site — Substack, LinkedIn, Pinterest — are
**link-only** for now: Substack has no public API at all, while LinkedIn and
Pinterest each require their own developer-app registration and approval
before any automated posting is possible. Nothing in this integration touches
those platforms.

---

## Architecture at a glance

```
                 ┌──────────────────────────────────────────────────────┐
                 │  Browser / website (GitHub Pages, static)            │
                 │  — zero social code, zero credentials, zero tokens   │
                 └──────────────────────────────────────────────────────┘

  operator laptop                      GitHub Actions (manual-only)
  ┌─────────────────────────┐          ┌──────────────────────────────┐
  │ bun social/cli.ts       │          │ .github/workflows/           │
  │  connect / refresh /    │  same    │   social-publish.yml         │
  │  disconnect / publish   │─────────▶│  runs only when a maintainer │
  │                         │  code    │  dispatches it, and only     │
  │ secrets in .env.local   │          │  publishes on input= publish │
  │ (git-ignored)           │          │  secrets from GitHub Secrets │
  └───────────┬─────────────┘          └──────────────┬───────────────┘
              │  OAuth (authorization code)           │
              ▼                                       ▼
     instagram.com / api.instagram.com       open.tiktokapis.com
     graph.instagram.com                     www.tiktok.com (OAuth)
```

**Security properties (by construction):**

| Requirement | How it is enforced |
|---|---|
| Credentials never committed to GitHub | Secrets live in `.env.local` (git-ignored, added to `.gitignore` this change-set) and GitHub Actions Secrets/Variables. The repo contains only `.env*`-free templates (`social/env.template`). No credential appears in any file. |
| Secrets never exposed to the frontend | Nothing under `social/` is imported by any file in `src/`. The Astro build never reads these variables; the deploy workflow never receives them. |
| Access tokens never hard-coded | Tokens are read from the process environment at runtime; the CLI writes them to `.env.local` **without ever printing them** (all output passes through a redactor). |
| OAuth callbacks handled securely | The authorization code is copied from the redirect URL by the operator and exchanged **server-side** (CLI or CI) with the client secret. The `state` parameter is generated per attempt and verified (CSRF check). No code exchange ever happens in a browser or in frontend code. |
| Publishing server-side | Only `social/cli.ts` publishes — locally or inside the manual GitHub Actions workflow with injected secrets. There is no API surface in the static site. |

**Files:**

```
social/
├── README.md            ← this guide (the setup checklists)
├── env.template         ← every environment variable NAME, no values
├── cli.ts               ← the only executable (status, queue, connect,
│                           refresh, disconnect, publish, post-status)
├── config.ts            ← variable names, readiness & approval gates
├── content.ts           ← the content model + queue validation
├── oauth.ts             ← shared OAuth plumbing + secret redaction
├── content/queue.json   ← the content queue (plain JSON, safe to commit)
└── providers/
    ├── types.ts         ← provider contract (connect/publish/status/
    │                       tokens/disconnect) + typed errors
    ├── instagram.ts     ← official Instagram Graph API endpoints
    └── tiktok.ts        ← official TikTok Content Posting API endpoints
.github/workflows/social-publish.yml   ← manual-only publishing job
```

**Commands** (run from the project root):

```bash
bun social/cli.ts status            # readiness report — offline, names only
bun social/cli.ts queue             # show the content queue — offline
bun social/cli.ts connect instagram # step 1: prints the OAuth authorize URL
bun social/cli.ts connect instagram --url "<pasted redirect URL>"  # step 2
bun social/cli.ts refresh instagram # refresh the 60-day token
bun social/cli.ts disconnect instagram   # remove local tokens + revoke steps
bun social/cli.ts publish           # DRY RUN (default — offline)
bun social/cli.ts publish --confirm publish   # publish what is due (gated)
bun social/cli.ts post-status tiktok <publish_id>
```

Nothing publishes without `--confirm publish`; TikTok direct posts are
additionally hard-blocked until `TIKTOK_DIRECT_POST_APPROVED=true` (see §6).

---

## 1. What you need to create on Meta / Instagram

Recommended setup: **Instagram API with Instagram Login** (works for a
standalone professional account — no Facebook Page required).

1. **Meta developer account** — <https://developers.facebook.com> → *Get
   Started* (confirm email/phone).
2. **Create an app** — <https://developers.facebook.com/apps> → *Create App*
   → app type **Business** → name it (e.g. "Fresh Muse").
3. **Add the Instagram product** — Dashboard → *Add products* →
   **Instagram → API setup with Instagram login**.
4. **Business login settings** (inside that product) — you will take from
   here:
   - **Instagram App ID** → `INSTAGRAM_APP_ID`
   - **Instagram App Secret** → `INSTAGRAM_APP_SECRET`
   - **OAuth redirect URIs** → register the exact URI you will use (§4).
5. **Add `@freshmusegallery` to the app** (dashboard → Instagram API
   setup → add the Instagram account) so **Standard Access** covers it.
   Standard Access is explicitly enough when the app only serves accounts
   you own or manage — **no App Review needed** for Fresh Muse's own
   publishing (see §6 for the exceptions).
6. **Confirm `@freshmusegallery` is Professional** — Instagram app →
   Settings → Account → Account type → *Professional* (Business or Creator).
7. (Optional, later) **Webhooks** — Meta's guide assumes a webhooks server
   for comment/insight events. Not required for publishing; add later if you
   want comment moderation or insights.

*Alternative path (only if the IG account is linked to a Facebook Page and
you prefer Facebook credentials):* add **Facebook Login for Business** +
**Instagram API setup with Facebook login** instead. Scopes and hosts differ
(§3); your app users then log in with Facebook, and Page Publishing
Authorization (PPA) applies.

---

## 2. What you need to create on TikTok for Developers

1. **Developer account** — <https://developers.tiktok.com> → sign up /
   register (the identity behind the `@fresh.muse` account is fine).
2. **Create an app** — Developer Portal → *Manage apps* → *Create app*.
3. **Add the product** — *Products* → **Content Posting API** → *Add*.
4. **Configure Log in with TikTok (Login Kit)** — register the **Redirect
   URL** there (§4; **HTTPS only — TikTok does not accept localhost**).
5. **Copy credentials** — *App credentials*: **Client Key** →
   `TIKTOK_CLIENT_KEY`, **Client Secret** → `TIKTOK_CLIENT_SECRET`.
6. **Enable Direct Post (later, not now)** — Content Posting API →
   *Direct Post* → *Apply*. This is the audit that grants `video.publish`.
   Leave it un-applied until you are ready; until then our code stays in
   draft mode and refuses direct posts.
7. **Verify a domain / URL prefix (needed for pulled media)** — for
   `PULL_FROM_URL` media (this is **mandatory for photo posts** and optional
   for videos): *URL prefix verification* in the portal, on a domain you
   control. Videos can alternatively use **FILE_UPLOAD** (our default), which
   needs no verification.

---

## 3. Permissions / scopes required

### Instagram — recommended path (Instagram API with Instagram Login)

| Scope | Why |
|---|---|
| `instagram_business_basic` | basic professional-account access (login/identity) |
| `instagram_business_content_publish` | create media containers and publish |

Requested as a comma-separated list on
`https://www.instagram.com/oauth/authorize`. That is the complete set needed
for publishing — no comments/insights/messaging scopes.

*Alternative path (Facebook Login for Business):* `instagram_basic`,
`instagram_content_publish`, `pages_show_list`, `pages_read_engagement` —
plus `ads_management` and `ads_read` **only if** your app user has a Page
role granted through Business Manager. Host: `graph.facebook.com`.

### TikTok

| Scope | When | Why |
|---|---|---|
| `user.info.basic` | always | Log in with TikTok identity (open_id) |
| `video.upload` | always | deliver content to the creator's **inbox/drafts** (consent-first flow) |
| `video.publish` | **only after TikTok grants it** | direct post to the profile |

Our `connect tiktok` requests exactly `user.info.basic video.upload` while
`TIKTOK_DIRECT_POST_APPROVED` is not `"true"`, and adds `video.publish`
only after approval — requesting an ungranted scope would fail authorization.

### Access levels (Instagram)

- **Standard Access** — your own account: sufficient, no App Review.
- **Advanced Access** — required only if the app ever serves Instagram
  accounts you don't own/manage; needs App Review + Business Verification.

---

## 4. Redirect URLs that must be registered

Exact string match (scheme, host, path — Meta's dashboard may append a
trailing slash; verify what it stored).

| Platform | Register where | Recommended value | Notes |
|---|---|---|---|
| Instagram | Meta App Dashboard → Instagram → API setup with Instagram login → Business login settings → **OAuth redirect URIs** | `http://localhost:8787/callback/instagram` | Meta **accepts localhost** (HTTPS required for non-localhost URIs). Used by `bun social/cli.ts connect instagram` on your machine. |
| TikTok | Developer Portal → your app → Login Kit → **Redirect URL** | `https://<OWNER>.github.io/<REPO>/` (your deployed Pages URL) | TikTok **rejects localhost and plain HTTP**. After approving, the browser lands on your (possibly 404) page — simply copy the full URL from the address bar, code and state included. |

Also set each value into the matching variable:
`INSTAGRAM_REDIRECT_URI` / `TIKTOK_REDIRECT_URI` — they must equal the
registered string **exactly** (both the env value and the registered value;
a mismatch is rejected at authorization time).

**Future production callback (optional):** if you later add a small server
(e.g. a serverless function) to receive callbacks automatically, register its
HTTPS URL too, e.g. `https://api.yourdomain.com/auth/callback/instagram` and
`.../tiktok`, and set the env vars to those. The exchange logic in
`social/providers/*.ts` already handles the code → token step; only the
listener would be new. GitHub Pages alone cannot receive callbacks — that is
why the copy-the-URL flow above is the documented default.

---

## 5. Values that become GitHub Secrets / environment variables

Repo → **Settings → Secrets and variables → Actions**. The same names are
used locally in `.env.local` (copy from `social/env.template`).

### Secrets tab (values must never be public)

| Name | Comes from | Set when |
|---|---|---|
| `INSTAGRAM_APP_SECRET` | Meta App Dashboard → Instagram App Secret | step 1 |
| `INSTAGRAM_ACCESS_TOKEN` | written by `connect instagram` / `refresh instagram` | after connect |
| `TIKTOK_CLIENT_SECRET` | TikTok Developer Portal → App credentials | step 1 |
| `TIKTOK_ACCESS_TOKEN` | written by `connect tiktok` / `refresh tiktok` (≈24 h lifetime) | after connect |
| `TIKTOK_REFRESH_TOKEN` | written by `connect tiktok` (≈365 d lifetime) | after connect |

### Variables tab (non-secret configuration)

| Name | Comes from | Set when |
|---|---|---|
| `INSTAGRAM_APP_ID` | Meta App Dashboard | step 1 |
| `INSTAGRAM_REDIRECT_URI` | the string you registered (§4) | step 1 |
| `INSTAGRAM_API_VERSION` | optional, e.g. `v25.0` (defaults if empty) | optional |
| `INSTAGRAM_USER_ID` | written by `connect instagram` | after connect |
| `INSTAGRAM_TOKEN_OBTAINED_AT` | written by connect/refresh | after connect |
| `INSTAGRAM_TOKEN_EXPIRES_AT` | written by connect/refresh (60-day expiry) | after connect |
| `TIKTOK_CLIENT_KEY` | TikTok Developer Portal | step 1 |
| `TIKTOK_REDIRECT_URI` | the string you registered (§4) | step 1 |
| `TIKTOK_OPEN_ID` | written by `connect tiktok` | after connect |
| `TIKTOK_TOKEN_OBTAINED_AT` | written by connect/refresh | after connect |
| `TIKTOK_DIRECT_POST_APPROVED` | you — `"true"` **only after** TikTok grants `video.publish` | after approval |

These names are injected **only** into `.github/workflows/social-publish.yml`
(the manual workflow). The Pages deploy workflow (`deploy.yml`) receives none
of them, and no build step of the website can see them.

**Token hygiene:** Instagram's long-lived token lasts 60 days and is renewed
by `bun social/cli.ts refresh instagram` (another 60 days each time, per
Meta's `ig_refresh_token` grant). TikTok's access token lasts ~24 hours and
is refreshed automatically before each publish run; if the run happens in
CI, the CLI prints a reminder to paste the refreshed values back into the
secrets (GitHub cannot write its own secrets).

---

## 6. What cannot work until approval is obtained

| # | Blocked capability | Gate | What unlocks it |
|---|---|---|---|
| 1 | **TikTok `video.publish` scope** — direct posting to the profile | TikTok must grant the scope (portal: Content Posting API → Direct Post → *Apply* / audit) | Apply with a demo of the consent UX; on grant, set `TIKTOK_DIRECT_POST_APPROVED=true` and re-run `connect tiktok` so the token carries the scope. Our code hard-refuses direct posts until then (`ApprovalRequiredError`). |
| 2 | **TikTok public visibility of API posts** | TikTok restricts **unaudited** clients to private viewing (error code `unaudited_client_can_only_post_to_private_accounts` for the publish attempt) | Passing the Content Posting API audit. We do not attempt to circumvent this. |
| 3 | **TikTok photo posts / `PULL_FROM_URL` video** | Media must come from a **verified** domain/URL prefix (`url_ownership_unverified` otherwise). Photos have no upload alternative. | Verify your domain in the TikTok developer portal (videos can use `source: "file"` / FILE_UPLOAD in the meantime). |
| 4 | **Instagram App Review / Advanced Access** | Needed only to serve accounts you don't own — **not** needed for Fresh Muse's own account (Standard Access) | Nothing to do. Only required if the product ever serves other creators. |
| 5 | **Instagram Page Publishing Authorization (PPA)** | Applies only if the professional account is linked to a Facebook Page that requires PPA (mainly the Facebook-Login path) | Complete PPA in Meta Business Suite if/when prompted. |
| 6 | **Automatic OAuth callback receiver** | GitHub Pages is static — it cannot receive `?code=` server-side | Optional later: a small HTTPS serverless endpoint; register its URL (§4) and set the redirect env vars. The copy-the-URL flow works today without it. |

Not blocked, once §1–§5 are filled in: **Instagram publishing to Fresh Muse's
own professional account** (Standard Access), and **TikTok draft/inbox
delivery** (`video.upload`) — the consent-first flow where content lands in
the creator's TikTok inbox to be reviewed and posted inside the app.

---

## The content model

`social/content/queue.json` — plain JSON, safe to commit, contains **no
credentials**, only content and bookkeeping. Every entry is validated by
`social/content.ts` before use.

| Field | Meaning |
|---|---|
| `id` | stable identifier (e.g. `ig-quiet-rooms-001`) |
| `title` | content title (internal) |
| `caption` | post caption — Instagram ≤ 2200 chars; TikTok video title ≤ 2200, photo title ≤ 90 + description ≤ 4000 |
| `media[]` | `{ kind: "image"\|"video", url, alt? }` — `url` must be publicly reachable |
| `platform` | `"instagram"` \| `"tiktok"` |
| `scheduledFor` | ISO date-time (`2026-12-01T09:00:00Z`) or `null` |
| `status` | `draft` → `scheduled` → `publishing` → `published` / `failed` |
| `platformPostId` | Instagram media id / TikTok publish_id once published |
| `statusMessage` | human-readable error or status text |
| `updatedAt` | last change (ISO) |
| `options.instagram.mediaType` | `IMAGE` \| `VIDEO` \| `REELS` \| `STORIES` |
| `options.tiktok.postMode` | `direct` (needs approval) \| `draft` (inbox, consent-first) |
| `options.tiktok.source` | `file` (default, no domain verification) \| `url` (verified domain) |
| `options.tiktok.privacyLevel` | must match TikTok's `creator_info` options for direct posts |

Publish rules: only **`scheduled`/`failed` entries whose time has passed**
are ever published; drafts are never auto-published; a failed pre-flight
(configuration or approval missing) refuses the whole run before any network
call. Results (status, post id, error) are written back into `queue.json`.

**Media requirements to keep in mind when preparing assets:**

- Instagram images must be **JPEG** (only JPEG is supported); video up to
  100 minutes, and publishing is capped at **100 API posts / 24 h** (the CLI
  checks `content_publishing_limit` first).
- TikTok videos: **MP4 + H.264** (also .mov/.webm accepted by the chunked
  upload); TikTok limits init calls to **6 per minute** (the CLI spaces them)
  and caps pending inbox shares at 5 / 24 h.
- Both platforms cURL/pull the media URL at publish time, so it must be live
  and public at that moment — host media on the deployed site (or any public
  host), not on localhost.

---

## Current state (honest summary)

- Architecture, gates, models, workflow and docs: **done and type-checked**.
- Accounts/apps on Meta and TikTok: **not created yet** (items §1–§2 are your
  portal work).
- Tokens: **none exist**; `bun social/cli.ts status` shows what is missing by
  name.
- Publishing: **never attempted**; dry-run is the default and real publishing
  needs an explicit `--confirm publish` plus complete credentials plus, for
  TikTok direct posts, actual approval.
- The website's design, pages and styles: **unchanged**.
