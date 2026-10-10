# Fresh Muse — Decap CMS OAuth proxy (Cloudflare Worker)

A small Cloudflare Worker that lets the editorial dashboard at `/admin/` sign
in with GitHub **without ever exposing the OAuth client secret to the
browser**. It is the only server-side piece of this otherwise fully static
website.

Cost: **$0** — Cloudflare Workers free tier is 100,000 requests/day; a login
costs about 3 requests. No paid plan is ever required for this.

---

## What you must create (once, ~5 minutes)

### 1. A GitHub OAuth App — free

<https://github.com/settings/applications/new>

| Field | Value |
| --- | --- |
| Application name | `Fresh Muse Editorial` (any name) |
| Homepage URL | the **PROXY URL** from step 2 (deploy first if you do not have it yet) |
| Authorization callback URL | the **PROXY URL** + `/callback` |

Save the **Client ID** and **Client Secret** — they go into step 3, never into
this repository, never into `public/admin/config.yml`.

### 2. A Cloudflare account — free tier

<https://dash.cloudflare.com/sign-up>

Then create an API token: **My Profile → API Tokens → Create Token →
"Edit Cloudflare Workers" template**. You also need your **Account ID**
(displayed in the Workers dashboard URL, a long hexadecimal string).

## Deploying

From the project root:

```bash
# authenticate (either method)
export CLOUDFLARE_ACCOUNT_ID=...        # from the Cloudflare dashboard
export CLOUDFLARE_API_TOKEN=...         # the token from step 2
# …or: npx wrangler login

# publish the worker
npx wrangler deploy --config cloudflare-worker/wrangler.toml

# store the GitHub OAuth App credentials as Worker secrets
npx wrangler secret put GITHUB_OAUTH_ID     --config cloudflare-worker/wrangler.toml
npx wrangler secret put GITHUB_OAUTH_SECRET --config cloudflare-worker/wrangler.toml
```

Deploying prints the **PROXY URL**, e.g.
`https://freshmuse-decap-auth.<your-subdomain>.workers.dev`.

**Test it:** open the PROXY URL in a browser — it should say `Hello 👋 … It is
working.`

### 3. Point the dashboard at the proxy

Put the PROXY URL (no trailing slash) into `public/admin/config.yml`:

```yaml
backend:
  base_url: https://freshmuse-decap-auth.<your-subdomain>.workers.dev
```

Push that change and the live dashboard can sign in.

---

## How it stays secure

- `GITHUB_OAUTH_ID` / `GITHUB_OAUTH_SECRET` exist only as encrypted Worker
  secrets. The website, its HTML, its repository and its build output never
  contain them.
- A random `state` is issued as an `HttpOnly; Secure; SameSite=Lax` cookie on
  `/auth` and verified on `/callback`, so a forged callback cannot complete.
- The access token is handed to the dashboard with
  `postMessage(..., ALLOWED_SITE_ORIGIN)` — it is delivered only to
  `https://freshmuse.freebuff.app` and is never stored anywhere else.
- `/auth` additionally rejects logins started from any other site when the
  browser discloses the referrer.
- Signing in still requires a GitHub account **with push access to this
  repository**; GitHub enforces that on every API call the dashboard makes.

## Files

| File | Purpose |
| --- | --- |
| `worker.ts` | the proxy itself (`/auth`, `/callback`, health page) |
| `wrangler.toml` | non-secret deployment configuration |
