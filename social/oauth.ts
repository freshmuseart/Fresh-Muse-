/**
 * Fresh Muse — generic OAuth 2.0 helpers (authorization-code flow).
 *
 * Shared plumbing for the Instagram and TikTok providers. Everything here is
 * transport-level: URL building, state/CSRF protection, code exchange
 * requests, refresh requests, and — critically — REDACTION, so that a token
 * can never leak into a log line, error message, or CI output.
 *
 * No endpoint, client id, or secret lives here; providers supply those.
 */

/** Redact anything that looks like a credential before it reaches a log. */
export function redact(text: string): string {
  return text
    .replace(/(access_token=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/(client_secret=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/(refresh_token=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/(authorization:\s*bearer\s+)\S+/gi, '$1[redacted]')
    .replace(/("access_token"\s*:\s*")[^"]+/gi, '$1[redacted]')
    .replace(/("refresh_token"\s*:\s*")[^"]+/gi, '$1[redacted]')
    .replace(/("client_secret"\s*:\s*")[^"]+/gi, '$1[redacted]');
}

/** Random CSRF state for the authorize redirect. */
export function randomState(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Build an authorize URL from a base + query params (undefined skipped). */
export function buildAuthorizeUrl(
  base: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return url.toString();
}

/**
 * Accepts either a raw authorization code or the full redirected URL
 * (e.g. "http://localhost:8787/callback?code=...&state=...") and returns the
 * code. Verifies `state` against the expected value when both are present.
 * Surfaces Meta/TikTok cancellation errors (error=access_denied) clearly.
 */
export function extractCode(input: string, expectedState?: string): string {
  let code = input;
  let state: string | null = null;
  let error: string | null = null;

  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    code = url.searchParams.get('code') ?? '';
    state = url.searchParams.get('state');
    error = url.searchParams.get('error') ?? url.searchParams.get('error_reason');
    if (error) {
      const desc =
        url.searchParams.get('error_description') ?? 'authorization was cancelled or denied';
      throw new Error(`OAuth authorization failed: ${error} — ${desc}`);
    }
  }

  code = code.replace(/#_?$/, ''); // Meta appends "#_" to some redirects
  if (!code) throw new Error('No authorization code found in the provided value.');
  if (expectedState && state && state !== expectedState) {
    throw new Error('State mismatch — the redirect does not match this connect session.');
  }
  return code;
}

/** POST application/x-www-form-urlencoded, parse JSON. Redacted errors. */
export async function postForm<T>(url: string, form: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
  } catch (err) {
    throw new Error(`Network error calling ${redact(url)}: ${redact(String(err))}`);
  }
  return parseJson<T>(res, url);
}

/** POST JSON with a Bearer token, parse JSON. Redacted errors. */
export async function postJson<T>(url: string, bearerToken: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Network error calling ${redact(url)}: ${redact(String(err))}`);
  }
  return parseJson<T>(res, url);
}

/** GET with an Authorization header (keeps tokens out of query strings). */
export async function getJson<T>(url: string, bearerToken?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {},
    });
  } catch (err) {
    throw new Error(`Network error calling ${redact(url)}: ${redact(String(err))}`);
  }
  return parseJson<T>(res, url);
}

async function parseJson<T>(res: Response, url: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} from ${redact(url)}: ${redact(text.slice(0, 500))}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Non-JSON response from ${redact(url)}: ${redact(text.slice(0, 500))}`);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse an ISO timestamp from the environment, or null. */
export function parseEnvDate(value: string | undefined): Date | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t) : null;
}
