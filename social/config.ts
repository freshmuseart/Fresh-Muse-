/**
 * Fresh Muse — social integration configuration.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SECURITY RULES (enforced by this file):
 *   • Only variable NAMES are defined here — never values.
 *   • All credentials are read from the process environment at runtime.
 *   • Nothing in this module (or anywhere under social/) is imported by the
 *     Astro frontend. The website build never sees these values.
 *   • Reports print variable names only; secret values are never echoed.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Where values come from:
 *   • Locally:  .env.local  (git-ignored — written by `social/cli.ts connect`)
 *   • In CI:    GitHub Actions Secrets / Variables (Settings → Secrets and
 *               variables → Actions), injected only into the manual
 *               "Social publishing" workflow — never into the Pages build.
 */

export type Env = Record<string, string | undefined>;

/** Every environment variable the social integration knows about. */
export const ENV_KEYS = {
  // ── Instagram (Meta) — static app config ──────────────────────────────────
  INSTAGRAM_APP_ID: 'INSTAGRAM_APP_ID',
  INSTAGRAM_REDIRECT_URI: 'INSTAGRAM_REDIRECT_URI',
  INSTAGRAM_API_VERSION: 'INSTAGRAM_API_VERSION', // optional, defaults below
  // ── Instagram (Meta) — secrets / issued credentials ───────────────────────
  INSTAGRAM_APP_SECRET: 'INSTAGRAM_APP_SECRET',
  INSTAGRAM_ACCESS_TOKEN: 'INSTAGRAM_ACCESS_TOKEN',
  INSTAGRAM_USER_ID: 'INSTAGRAM_USER_ID',
  INSTAGRAM_TOKEN_OBTAINED_AT: 'INSTAGRAM_TOKEN_OBTAINED_AT',
  INSTAGRAM_TOKEN_EXPIRES_AT: 'INSTAGRAM_TOKEN_EXPIRES_AT',
  // ── TikTok — static app config ────────────────────────────────────────────
  TIKTOK_CLIENT_KEY: 'TIKTOK_CLIENT_KEY',
  TIKTOK_REDIRECT_URI: 'TIKTOK_REDIRECT_URI',
  /**
   * "true" ONLY after TikTok has actually granted the video.publish scope
   * (direct-post audit approved). Defaults to false — publishing to a TikTok
   * profile is hard-blocked until you set this yourself.
   */
  TIKTOK_DIRECT_POST_APPROVED: 'TIKTOK_DIRECT_POST_APPROVED',
  // ── TikTok — secrets / issued credentials ─────────────────────────────────
  TIKTOK_CLIENT_SECRET: 'TIKTOK_CLIENT_SECRET',
  TIKTOK_ACCESS_TOKEN: 'TIKTOK_ACCESS_TOKEN',
  TIKTOK_REFRESH_TOKEN: 'TIKTOK_REFRESH_TOKEN',
  TIKTOK_OPEN_ID: 'TIKTOK_OPEN_ID',
  TIKTOK_TOKEN_OBTAINED_AT: 'TIKTOK_TOKEN_OBTAINED_AT',
} as const;

export type EnvKey = (typeof ENV_KEYS)[keyof typeof ENV_KEYS];

/** Default Instagram Graph API version (Meta's current stable). */
export const DEFAULT_INSTAGRAM_API_VERSION = 'v25.0';

/** Thrown when a required environment variable is missing. Prints NAMES only. */
export class ConfigurationError extends Error {
  readonly missing: string[];
  constructor(missing: string[], what: string) {
    super(
      `Missing configuration for ${what}: ${missing.join(', ')}. ` +
        `Set these in .env.local (local) or GitHub Actions Secrets/Variables (CI). ` +
        `See social/README.md.`,
    );
    this.name = 'ConfigurationError';
    this.missing = missing;
  }
}

/** Read specific variables, or throw listing exactly which names are absent. */
export function requireEnv(env: Env, keys: readonly string[], what: string): Env {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length > 0) throw new ConfigurationError(missing, what);
  const out: Env = {};
  for (const k of keys) out[k] = env[k];
  return out;
}

export function instagramApiVersion(env: Env): string {
  return env[ENV_KEYS.INSTAGRAM_API_VERSION] || DEFAULT_INSTAGRAM_API_VERSION;
}

/** True when TikTok's video.publish direct-post scope has been approved. */
export function tikTokDirectPostApproved(env: Env): boolean {
  return env[ENV_KEYS.TIKTOK_DIRECT_POST_APPROVED]?.toLowerCase() === 'true';
}

export type Platform = 'instagram' | 'tiktok';

/** Readiness of one platform: what is set, what is missing (names only). */
export interface PlatformReadiness {
  platform: Platform;
  /** Variables required to START the OAuth connect flow. */
  connectMissing: string[];
  /** Variables required to publish (superset: connect + issued tokens). */
  publishMissing: string[];
  /** True when an access token is present in the environment. */
  tokenPresent: boolean;
  /** ISO date the current token was issued, if recorded. */
  tokenObtainedAt: string | null;
  /** ISO date the current token expires, if recorded (Instagram only). */
  tokenExpiresAt: string | null;
  /** Platform-specific approval gates that are still closed. */
  blockedBy: string[];
}

const CONNECT_KEYS: Record<Platform, readonly string[]> = {
  instagram: [ENV_KEYS.INSTAGRAM_APP_ID, ENV_KEYS.INSTAGRAM_REDIRECT_URI],
  tiktok: [ENV_KEYS.TIKTOK_CLIENT_KEY, ENV_KEYS.TIKTOK_REDIRECT_URI],
};

const PUBLISH_KEYS: Record<Platform, readonly string[]> = {
  instagram: [
    ...CONNECT_KEYS.instagram,
    ENV_KEYS.INSTAGRAM_APP_SECRET,
    ENV_KEYS.INSTAGRAM_ACCESS_TOKEN,
    ENV_KEYS.INSTAGRAM_USER_ID,
  ],
  tiktok: [
    ...CONNECT_KEYS.tiktok,
    ENV_KEYS.TIKTOK_CLIENT_SECRET,
    ENV_KEYS.TIKTOK_ACCESS_TOKEN,
    ENV_KEYS.TIKTOK_OPEN_ID,
  ],
};

const missing = (env: Env, keys: readonly string[]) =>
  keys.filter((k) => !env[k]);

/** Build the readiness report for one platform. Never touches the network. */
export function readiness(env: Env, platform: Platform): PlatformReadiness {
  const publishMissing = missing(env, PUBLISH_KEYS[platform]);
  const connectMissing = missing(env, CONNECT_KEYS[platform]);
  const blockedBy: string[] = [];

  if (platform === 'instagram') {
    // Publishing works with Standard Access for your own professional account;
    // Advanced Access (App Review + Business Verification) is only required if
    // the app ever serves OTHER accounts. Flag it as an FYI, not a block.
    if (env[ENV_KEYS.INSTAGRAM_TOKEN_EXPIRES_AT]) {
      const expires = Date.parse(env[ENV_KEYS.INSTAGRAM_TOKEN_EXPIRES_AT]!);
      if (Number.isFinite(expires) && expires <= Date.now()) {
        blockedBy.push('Instagram access token has EXPIRED — run `refresh instagram`');
      } else if (
        Number.isFinite(expires) &&
        expires - Date.now() < 7 * 24 * 60 * 60 * 1000
      ) {
        blockedBy.push('Instagram access token expires within 7 days — run `refresh instagram`');
      }
    }
  }

  if (platform === 'tiktok' && !tikTokDirectPostApproved(env)) {
    blockedBy.push(
      'TIKTOK_DIRECT_POST_APPROVED is not "true" — direct posts to the profile are hard-blocked until TikTok grants video.publish (draft/inbox mode only)',
    );
  }

  return {
    platform,
    connectMissing,
    publishMissing,
    tokenPresent: Boolean(
      platform === 'instagram'
        ? env[ENV_KEYS.INSTAGRAM_ACCESS_TOKEN]
        : env[ENV_KEYS.TIKTOK_ACCESS_TOKEN],
    ),
    tokenObtainedAt:
      env[
        platform === 'instagram'
          ? ENV_KEYS.INSTAGRAM_TOKEN_OBTAINED_AT
          : ENV_KEYS.TIKTOK_TOKEN_OBTAINED_AT
      ] ?? null,
    tokenExpiresAt: env[ENV_KEYS.INSTAGRAM_TOKEN_EXPIRES_AT] ?? null,
    blockedBy,
  };
}
