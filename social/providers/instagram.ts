/**
 * Fresh Muse — Instagram provider (official Instagram Platform / Graph API).
 *
 * Login type: **Instagram API with Instagram Login** (Business Login for
 * Instagram). No password is ever seen or stored — authorization is the
 * OAuth 2.0 authorization-code flow, and API calls use a long-lived
 * Instagram User access token held ONLY in the environment.
 *
 * Official endpoints used (verified against Meta's docs, Oct 2026):
 *   authorize  https://www.instagram.com/oauth/authorize
 *   token      https://api.instagram.com/oauth/access_token          (POST, code → short-lived)
 *   long-lived https://graph.instagram.com/access_token               (ig_exchange_token)
 *   refresh    https://graph.instagram.com/refresh_access_token       (ig_refresh_token, +60 days)
 *   publish    /{version}/{ig-user-id}/media  →  /{container}?fields=status_code
 *              →  /{version}/{ig-user-id}/media_publish
 *   limits     /{version}/{ig-user-id}/content_publishing_limit
 *
 * Access level: **Standard Access is sufficient** for publishing to your own
 * professional account. Advanced Access (App Review + Business Verification)
 * is only needed if the app ever serves accounts you don't own/manage.
 *
 * This module makes NO network call unless real credentials are present.
 */

import {
  ENV_KEYS,
  instagramApiVersion,
  readiness,
  requireEnv,
  type Env,
  type PlatformReadiness,
} from '../config.ts';
import { parseEnvDate, redact, extractCode, getJson, postForm, sleep } from '../oauth.ts';
import type { SocialPost } from '../content.ts';
import {
  ApiError,
  type ConnectCredentials,
  type DisconnectReport,
  type PublishOutcome,
  type PublishStatusReport,
  type SocialProvider,
  type TokenStatus,
} from './types.ts';

const AUTHORIZE = 'https://www.instagram.com/oauth/authorize';
const TOKEN = 'https://api.instagram.com/oauth/access_token';
const GRAPH = 'https://graph.instagram.com';

/** Scopes for Business Login for Instagram (current names, post-2025). */
export const INSTAGRAM_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
];

const graph = (env: Env, path: string) => {
  const version = instagramApiVersion(env);
  return `https://graph.instagram.com/${version}${path}`;
};

interface CodeExchangeResponse {
  access_token?: string;
  user_id?: string;
  data?: Array<{ access_token?: string; user_id?: string }>;
}

interface LongLivedResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_message?: string;
}

function fail(message: string): never {
  throw new ApiError(redact(message));
}

async function exchangeForLongLived(
  env: Env,
  shortLived: string,
): Promise<{ token: string; expiresAt: string }> {
  const secret = env[ENV_KEYS.INSTAGRAM_APP_SECRET];
  const url =
    `${GRAPH}/access_token?grant_type=ig_exchange_token` +
    `&client_secret=${encodeURIComponent(secret ?? '')}` +
    `&access_token=${encodeURIComponent(shortLived)}`;
  const res = await getJson<LongLivedResponse>(url);
  if (!res.access_token) {
    fail(`Long-lived token exchange failed: ${res.error ?? 'unknown error'} ${res.error_message ?? ''}`);
  }
  const expiresIn = res.expires_in ?? 60 * 24 * 60 * 60; // 60 days default
  return {
    token: res.access_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export const instagram: SocialProvider = {
  platform: 'instagram',

  readiness(env: Env): PlatformReadiness {
    return readiness(env, 'instagram');
  },

  authorizeUrl(env: Env): string {
    const { INSTAGRAM_APP_ID: appId, INSTAGRAM_REDIRECT_URI: redirect } = requireEnv(
      env,
      [ENV_KEYS.INSTAGRAM_APP_ID, ENV_KEYS.INSTAGRAM_REDIRECT_URI],
      'Instagram connect',
    );
    const params = new URLSearchParams({
      client_id: appId!,
      redirect_uri: redirect!,
      response_type: 'code',
      scope: INSTAGRAM_SCOPES.join(','),
    });
    // `state` is added by the CLI (CSRF check on return).
    return `${AUTHORIZE}?${params.toString()}`;
  },

  async connect(env: Env, redirectUrlOrCode: string): Promise<ConnectCredentials> {
    const cfg = requireEnv(
      env,
      [
        ENV_KEYS.INSTAGRAM_APP_ID,
        ENV_KEYS.INSTAGRAM_APP_SECRET,
        ENV_KEYS.INSTAGRAM_REDIRECT_URI,
      ],
      'Instagram connect',
    );
    const code = extractCode(redirectUrlOrCode);

    const short = await postForm<CodeExchangeResponse>(TOKEN, {
      client_id: cfg[ENV_KEYS.INSTAGRAM_APP_ID]!,
      client_secret: cfg[ENV_KEYS.INSTAGRAM_APP_SECRET]!,
      grant_type: 'authorization_code',
      redirect_uri: cfg[ENV_KEYS.INSTAGRAM_REDIRECT_URI]!,
      code,
    });
    const shortToken = short.access_token ?? short.data?.[0]?.access_token;
    const userId = short.user_id ?? short.data?.[0]?.user_id;
    if (!shortToken || !userId) {
      fail(`Token exchange did not return a token/user id: ${JSON.stringify(short).slice(0, 300)}`);
    }

    const long = await exchangeForLongLived(env, shortToken);
    return {
      values: {
        [ENV_KEYS.INSTAGRAM_ACCESS_TOKEN]: long.token,
        [ENV_KEYS.INSTAGRAM_USER_ID]: userId,
        [ENV_KEYS.INSTAGRAM_TOKEN_OBTAINED_AT]: new Date().toISOString(),
        [ENV_KEYS.INSTAGRAM_TOKEN_EXPIRES_AT]: long.expiresAt,
      },
      summary:
        `Instagram connected: user ${userId}, long-lived token stored ` +
        `(expires ${long.expiresAt.slice(0, 10)}, refresh with \`refresh instagram\`).`,
    };
  },

  async refresh(env: Env): Promise<ConnectCredentials> {
    const cfg = requireEnv(
      env,
      [ENV_KEYS.INSTAGRAM_ACCESS_TOKEN, ENV_KEYS.INSTAGRAM_APP_SECRET],
      'Instagram token refresh',
    );
    const url =
      `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token` +
      `&access_token=${encodeURIComponent(cfg[ENV_KEYS.INSTAGRAM_ACCESS_TOKEN]!)}`;
    const res = await getJson<LongLivedResponse>(url);
    if (!res.access_token) {
      fail(`Token refresh failed: ${res.error ?? 'unknown error'} ${res.error_message ?? ''}`);
    }
    const expiresIn = res.expires_in ?? 60 * 24 * 60 * 60;
    return {
      values: {
        [ENV_KEYS.INSTAGRAM_ACCESS_TOKEN]: res.access_token,
        [ENV_KEYS.INSTAGRAM_TOKEN_OBTAINED_AT]: new Date().toISOString(),
        [ENV_KEYS.INSTAGRAM_TOKEN_EXPIRES_AT]: new Date(
          Date.now() + expiresIn * 1000,
        ).toISOString(),
      },
      summary: `Instagram token refreshed (new expiry ${new Date(Date.now() + expiresIn * 1000).toISOString().slice(0, 10)}).`,
    };
  },

  tokenStatus(env: Env): TokenStatus {
    const obtainedAt = env[ENV_KEYS.INSTAGRAM_TOKEN_OBTAINED_AT] ?? null;
    const expiresAt = env[ENV_KEYS.INSTAGRAM_TOKEN_EXPIRES_AT] ?? null;
    const expiry = parseEnvDate(env[ENV_KEYS.INSTAGRAM_TOKEN_EXPIRES_AT]);
    const needsRefresh = expiry !== null && expiry.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
    return { connected: Boolean(env[ENV_KEYS.INSTAGRAM_ACCESS_TOKEN]), obtainedAt, expiresAt, needsRefresh };
  },

  async publish(env: Env, post: SocialPost): Promise<PublishOutcome> {
    const cfg = requireEnv(
      env,
      [
        ENV_KEYS.INSTAGRAM_ACCESS_TOKEN,
        ENV_KEYS.INSTAGRAM_USER_ID,
      ],
      'Instagram publish',
    );
    const token = cfg[ENV_KEYS.INSTAGRAM_ACCESS_TOKEN]!;
    const userId = cfg[ENV_KEYS.INSTAGRAM_USER_ID]!;

    if (post.caption.length > 2200) {
      throw new ApiError(`Instagram caption too long (${post.caption.length} > 2200 chars).`);
    }

    // Respect Meta's publishing rate limit before attempting a publish.
    const limit = await getJson<{ quota_usage?: number; data?: Array<{ quota_usage?: number }> }>(
      `${graph(env, `/${userId}/content_publishing_limit`)}?access_token=${encodeURIComponent(token)}`,
    ).catch(() => null);
    const usage = limit?.quota_usage ?? limit?.data?.[0]?.quota_usage;
    if (typeof usage === 'number' && usage >= 100) {
      throw new ApiError('Instagram publishing rate limit reached (100 API posts / 24h).');
    }

    const createContainer = async (params: Record<string, string>): Promise<string> => {
      const res = await postForm<{ id?: string; error?: { message?: string } }>(
        `${graph(env, `/${userId}/media`)}?access_token=${encodeURIComponent(token)}`,
        params,
      );
      if (!res.id) fail(`Container creation failed: ${JSON.stringify(res).slice(0, 300)}`);
      return res.id;
    };

    const waitForContainer = async (containerId: string): Promise<void> => {
      for (let attempt = 0; attempt < 50; attempt++) {
        const res = await getJson<{ status_code?: string; error?: { message?: string } }>(
          `${graph(env, `/${containerId}`)}?fields=status_code&access_token=${encodeURIComponent(token)}`,
        );
        const status = res.status_code;
        if (status === 'FINISHED') return;
        if (status === 'ERROR') {
          fail(`Media container ${containerId} is not publishable: ${res.error?.message ?? 'unknown error'}`);
        }
        await sleep(4000);
      }
      fail(`Timed out waiting for media container ${containerId} to finish processing.`);
    };

    const caption = post.caption;
    let containerId: string;

    if (post.media.length > 1) {
      // Carousel: child containers first, then the parent.
      const childIds: string[] = [];
      for (const asset of post.media) {
        const child = await createContainer({
          [asset.kind === 'video' ? 'video_url' : 'image_url']: asset.url,
          is_carousel_item: 'true',
        });
        await waitForContainer(child);
        childIds.push(child);
      }
      containerId = await createContainer({
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        caption,
      });
    } else {
      const asset = post.media[0];
      const params: Record<string, string> = { caption };
      if (asset.kind === 'video') {
        params['video_url'] = asset.url;
        params['media_type'] = post.options?.instagram?.mediaType ?? 'REELS';
      } else {
        params['image_url'] = asset.url;
        if (asset.alt) params['alt_text'] = asset.alt;
      }
      containerId = await createContainer(params);
    }

    await waitForContainer(containerId);

    const published = await postForm<{ id?: string }>(
      `${graph(env, `/${userId}/media_publish`)}?access_token=${encodeURIComponent(token)}`,
      { creation_id: containerId },
    );
    if (!published.id) {
      fail(`media_publish did not return an id: ${JSON.stringify(published).slice(0, 300)}`);
    }
    return {
      platformPostId: published.id,
      statusMessage: `Published to Instagram (media id ${published.id}).`,
    };
  },

  async publishStatus(env: Env, platformPostId: string): Promise<PublishStatusReport> {
    const cfg = requireEnv(env, [ENV_KEYS.INSTAGRAM_ACCESS_TOKEN], 'Instagram status');
    try {
      const res = await getJson<{ status_code?: string; timestamp?: string }>(
        `${graph(env, `/${platformPostId}`)}?fields=status_code,timestamp&access_token=${encodeURIComponent(cfg[ENV_KEYS.INSTAGRAM_ACCESS_TOKEN]!)}`,
      );
      if (res.status_code === 'FINISHED') {
        return { state: 'published', detail: `container ${platformPostId} FINISHED` };
      }
      if (res.status_code === 'ERROR') {
        return { state: 'failed', detail: `container ${platformPostId} ERROR` };
      }
      if (res.status_code === 'IN_PROGRESS') {
        return { state: 'processing', detail: `container ${platformPostId} IN_PROGRESS` };
      }
      // Published media have no status_code but exist.
      return { state: 'published', detail: `media ${platformPostId} exists` };
    } catch (err) {
      return { state: 'unknown', detail: redact(String(err instanceof Error ? err.message : err)) };
    }
  },

  disconnect(_env: Env): DisconnectReport {
    return {
      removed: [
        ENV_KEYS.INSTAGRAM_ACCESS_TOKEN,
        ENV_KEYS.INSTAGRAM_USER_ID,
        ENV_KEYS.INSTAGRAM_TOKEN_OBTAINED_AT,
        ENV_KEYS.INSTAGRAM_TOKEN_EXPIRES_AT,
      ],
      manualSteps: [
        'Instagram app: Settings → Apps and websites → remove "Fresh Muse" (revokes the user authorization).',
        'Meta App Dashboard: your app → Users can be removed, and the app can be deleted when no longer needed.',
        'GitHub repo: Settings → Secrets and variables → Actions → delete INSTAGRAM_* secrets.',
        'Note: Meta does not expose a programmatic revoke endpoint for Instagram Login tokens; local removal + the steps above is the complete revocation.',
      ],
    };
  },
};
