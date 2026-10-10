/**
 * Fresh Muse — Decap CMS OAuth proxy (Cloudflare Worker).
 *
 * PURPOSE
 *   The editorial dashboard at /admin/ uses Decap CMS with the GitHub backend.
 *   GitHub's authorization-code flow needs a client secret, which must never
 *   exist in the browser. This worker is that server-side step: it redirects
 *   to GitHub, exchanges the code for an access token, and hands the token
 *   back to the dashboard window via postMessage.
 *
 * WHAT IS SECRET
 *   GITHUB_OAUTH_ID / GITHUB_OAUTH_SECRET are Worker secrets, set with
 *   `npx wrangler secret put`. They are never sent to the website and never
 *   appear in public/admin/config.yml.
 *
 * WHO CAN LOG IN
 *   Only GitHub accounts with push access to the content repository — GitHub
 *   enforces that when the token is used against the repo. The admin shell on
 *   the website is static and contains no credentials.
 *
 * PROTOCOL (matches Decap CMS's GitHub OAuth proxy client):
 *   1. Dashboard opens  GET /auth?provider=github[&scope=...]  in a popup.
 *   2. Worker 302s to GitHub authorize with a random state + HttpOnly cookie.
 *   3. GitHub redirects to GET /callback?code=...&state=...
 *   4. Worker exchanges code+secret for an access token (server-side).
 *   5. Callback page posts to window.opener:
 *        "authorizing:github"
 *        then "authorization:github:success:{\"token\":\"...\"}"
 *      (or "...:error:{\"message\":\"...\"}" on failure).
 */

export interface Env {
  /** GitHub OAuth App client id (Worker secret). */
  GITHUB_OAUTH_ID: string;
  /** GitHub OAuth App client secret (Worker secret). */
  GITHUB_OAUTH_SECRET: string;
  /** Exact origin of the website allowed to receive the token, no trailing slash. */
  ALLOWED_SITE_ORIGIN: string;
  /** "0"/unset = public repository (scope public_repo); anything else = private (scope repo). */
  GITHUB_REPO_PRIVATE?: string;
}

const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';
const STATE_COOKIE = 'freshmuse_oauth_state';
const STATE_TTL_SECONDS = 600;

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function redirect(location: string, setCookie?: string): Response {
  const headers: Record<string, string> = { location, 'Cache-Control': 'no-store' };
  if (setCookie) headers['Set-Cookie'] = setCookie;
  return new Response(null, { status: 302, headers });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // NOTE: no Cross-Origin-Opener-Policy — it would sever window.opener
      // and break the handshake with the dashboard.
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    },
  });
}

/** Plain-language failure page. Never includes secrets or tokens. */
function failurePage(message: string, detail = ''): Response {
  return html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Login problem</title></head><body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem">
<h1>Login could not be completed</h1>
<p>${message}</p>${detail ? `<p style="color:#555">${detail}</p>` : ''}
<p>Close this window and try again from <code>/admin/</code>.</p>
</body></html>`,
    400,
  );
}

/**
 * The page GitHub lands on after authorizing. It relays the result to the
 * dashboard window. The token only ever exists inside this popup — it is
 * never written to the website, its repository, or any log.
 */
function handshakePage(
  siteOrigin: string,
  proxyOrigin: string,
  status: 'success' | 'error',
  payload: { token?: string; message?: string },
): Response {
  const message = `authorization:github:${status}:${JSON.stringify(payload)}`;
  return html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorizing…</title></head>
<body style="font:16px/1.5 system-ui,sans-serif;margin:3rem auto;max-width:32rem;padding:0 1rem">
<p>Authorizing the editorial dashboard… you can close this window.</p>
<script>
  (function () {
    var SITE = ${JSON.stringify(siteOrigin)};
    var PROXY = ${JSON.stringify(proxyOrigin)};
    var MESSAGE = ${JSON.stringify(message)};
    var relayed = false;
    function post(data) {
      try { if (window.opener) window.opener.postMessage(data, SITE); } catch (e) {}
    }
    // 1. Announce ourselves so the dashboard switches to its token listener.
    post('authorizing:github');
    // 2. Relay the result when the dashboard echoes back…
    window.addEventListener('message', function (event) {
      if (event.origin === PROXY) relay();
    });
    // 3. …and after a short delay if no echo arrives, so login never hangs.
    setTimeout(relay, 1500);
    function relay() { if (!relayed) { relayed = true; post(MESSAGE); } }
  })();
</script>
</body></html>`,
  );
}

function getCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('Cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

/**
 * Defence in depth on the login request: when the browser tells us where the
 * navigation started, it must match the website. Browsers that withhold the
 * referrer are not blocked — the token still only reaches ALLOWED_SITE_ORIGIN.
 */
function originRejected(env: Env, request: Request): boolean {
  const allowed = (env.ALLOWED_SITE_ORIGIN || '').replace(/\/+$/, '');
  if (!allowed) return false;
  const header = request.headers.get('Origin') || request.headers.get('Referer');
  if (!header) return false;
  let seen: string;
  try {
    seen = new URL(header).origin;
  } catch {
    return true;
  }
  return seen !== allowed;
}

async function handleAuth(url: URL, request: Request, env: Env): Promise<Response> {
  const provider = url.searchParams.get('provider');
  if (provider !== 'github') {
    return failurePage('Unsupported login provider.', 'This proxy only signs in with GitHub.');
  }
  if (!env.GITHUB_OAUTH_ID || !env.GITHUB_OAUTH_SECRET) {
    return failurePage(
      'The proxy is not configured yet.',
      'The GITHUB_OAUTH_ID and GITHUB_OAUTH_SECRET Worker secrets are missing.',
    );
  }
  if (originRejected(env, request)) {
    return failurePage('This sign-in was started from an unexpected site.');
  }

  const state = randomHex(16);
  const redirectUri = `${url.origin}/callback?provider=github`;
  const scope =
    env.GITHUB_REPO_PRIVATE && env.GITHUB_REPO_PRIVATE !== '0' ? 'repo,user' : 'public_repo';

  const authorizeUrl =
    `${GITHUB_AUTHORIZE}?response_type=code` +
    `&client_id=${encodeURIComponent(env.GITHUB_OAUTH_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;

  const cookie = `${STATE_COOKIE}=${state}; Path=/; Max-Age=${STATE_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
  return redirect(authorizeUrl, cookie);
}

async function handleCallback(url: URL, request: Request, env: Env): Promise<Response> {
  const provider = url.searchParams.get('provider');
  if (provider !== 'github') {
    return failurePage('Unsupported login provider.');
  }

  const siteOrigin = (env.ALLOWED_SITE_ORIGIN || '').replace(/\/+$/, '');
  const proxyOrigin = url.origin;

  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    return failurePage('GitHub did not authorize this sign-in.', `GitHub said: ${oauthError}`);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookie = getCookie(request, STATE_COOKIE);
  if (!code || !state || !cookie || cookie !== state) {
    return failurePage(
      'The sign-in session could not be verified.',
      'The login link may have expired — please try again from /admin/.',
    );
  }

  let token = '';
  try {
    const response = await fetch(GITHUB_TOKEN, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_OAUTH_ID,
        client_secret: env.GITHUB_OAUTH_SECRET,
        code,
        redirect_uri: `${url.origin}/callback?provider=github`,
        grant_type: 'authorization_code',
      }),
    });
    const data = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    token = data.access_token || '';
    if (!token) {
      const why = data.error_description || data.error || 'no access token returned';
      return failurePage('GitHub refused the sign-in.', `GitHub said: ${why}`);
    }
  } catch {
    return failurePage('Could not reach GitHub to finish the sign-in.');
  }

  return handshakePage(siteOrigin, proxyOrigin, 'success', { token });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Tolerate accidental double slashes (base_url + "/" + auth_endpoint).
    const path = url.pathname.replace(/\/{2,}/g, '/');

    if (path === '/auth') return handleAuth(url, request, env);
    if (path === '/callback') return handleCallback(url, request, env);

    return html(
      `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Fresh Muse OAuth</title></head>
<body style="font:16px/1.5 system-ui,sans-serif;margin:3rem auto;max-width:32rem;padding:0 1rem">
<p>Hello 👋</p><p>This is the Fresh Muse Decap CMS OAuth proxy. It is working.</p>
</body></html>`,
    );
  },
};
