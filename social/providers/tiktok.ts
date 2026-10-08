/**
 * Fresh Muse — TikTok provider (official Content Posting API).
 *
 * Authorization is the OAuth 2.0 authorization-code flow from **Log in with
 * TikTok** — no password is ever seen or stored. Publishing uses only the
 * official Content Posting API. No browser automation, no login scraping,
 * no unofficial clients.
 *
 * Official endpoints used (verified against TikTok's docs, Oct 2026):
 *   authorize  https://www.tiktok.com/v2/auth/authorize/
 *   token      https://open.tiktokapis.com/v2/oauth/token/            (POST code / refresh_token)
 *   creator    /v2/post/publish/creator_info/query/                    (required before direct posts)
 *   video      /v2/post/publish/video/init/          direct, scope video.publish
 *              /v2/post/publish/inbox/video/init/    draft,  scope video.upload
 *   photo      /v2/post/publish/content/init/        DIRECT_POST | MEDIA_UPLOAD
 *   status     /v2/post/publish/status/fetch/
 *
 * APPROVAL GATES — enforced in code, not by convention:
 *   • The `video.publish` scope is requested in the OAuth URL ONLY when
 *     TIKTOK_DIRECT_POST_APPROVED=true, i.e. only after TikTok has actually
 *     granted it. Requesting an ungranted scope fails authorization anyway.
 *   • Direct-mode publishing throws ApprovalRequiredError while
 *     TIKTOK_DIRECT_POST_APPROVED is not "true".
 *   • Draft/inbox mode (video.upload scope) delivers content to the creator's
 *     TikTok inbox to review and post in the app — TikTok's required consent
 *     UX — and works without the direct-post audit.
 *   • Unaudited clients are restricted to private posts by TikTok; we do not
 *     attempt to circumvent that.
 *   • PULL_FROM_URL requires a domain/URL prefix verified in the TikTok
 *     developer portal; video defaults to FILE_UPLOAD (no verification
 *     needed), photos REQUIRE verified URLs (TikTok allows only
 *     PULL_FROM_URL for photos).
 */

import {
  ENV_KEYS,
  readiness,
  requireEnv,
  tikTokDirectPostApproved,
  type Env,
  type PlatformReadiness,
} from '../config.ts';
import { extractCode, postForm, postJson, redact, sleep } from '../oauth.ts';
import type { SocialPost } from '../content.ts';
import {
  ApiError,
  ApprovalRequiredError,
  type ConnectCredentials,
  type DisconnectReport,
  type PublishOutcome,
  type PublishStatusReport,
  type SocialProvider,
  type TokenStatus,
} from './types.ts';

const AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const API = 'https://open.tiktokapis.com/v2';

/** Base scopes — granted on Log in with TikTok without the posting audit. */
export const TIKTOK_BASE_SCOPES = ['user.info.basic', 'video.upload'];
/** Direct-post scope — requested only after TikTok actually grants it. */
export const TIKTOK_DIRECT_SCOPE = 'video.publish';

function scopesFor(env: Env): string[] {
  return tikTokDirectPostApproved(env)
    ? [...TIKTOK_BASE_SCOPES, TIKTOK_DIRECT_SCOPE]
    : [...TIKTOK_BASE_SCOPES];
}

function fail(message: string): never {
  throw new ApiError(redact(message));
}

/** TikTok access tokens last ~24h; refresh when older than 20h. */
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000;

/** media/init endpoints are limited to 6 requests/minute per user token. */
const sleepBetweenInits = () => sleep(11_000); // stay well under 6 req/min

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  open_id?: string;
  expires_in?: number;
  scope?: string;
  error?: { code?: string; description?: string } | string;
  error_code?: string | number;
  error_description?: string;
}

function tokenValues(res: TokenResponse): Record<string, string> {
  if (!res.access_token || !res.refresh_token || !res.open_id) {
    const detail =
      typeof res.error === 'string'
        ? `${res.error} ${res.error_description ?? ''}`
        : `${res.error?.code ?? res.error_code ?? 'unknown'} ${res.error?.description ?? res.error_description ?? ''}`;
    fail(`TikTok token response incomplete: ${detail}`);
  }
  return {
    [ENV_KEYS.TIKTOK_ACCESS_TOKEN]: res.access_token,
    [ENV_KEYS.TIKTOK_REFRESH_TOKEN]: res.refresh_token,
    [ENV_KEYS.TIKTOK_OPEN_ID]: res.open_id,
    [ENV_KEYS.TIKTOK_TOKEN_OBTAINED_AT]: new Date().toISOString(),
  };
}

interface InitResponse {
  data?: { publish_id?: string; upload_url?: string };
  error?: { code?: string; message?: string };
}

/** Download media bytes from the content URL (needed for FILE_UPLOAD). */
async function fetchMedia(url: string): Promise<Uint8Array<ArrayBuffer>> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new ApiError(`Could not download media ${redact(url)}: ${redact(String(err))}`);
  }
  if (!res.ok) throw new ApiError(`Media download failed (HTTP ${res.status}) for ${redact(url)}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Chunk plan per TikTok's Media Transfer Guide: chunks ≥5 MB and ≤64 MB
 * (the final chunk may be larger), 1–1000 chunks. One plan is shared by the
 * init request and the actual chunk PUTs so they always agree.
 */
function chunkPlan(size: number): { chunkSize: number; total: number } {
  const MIN = 5 * 1024 * 1024;
  const MAX = 64 * 1024 * 1024;
  let chunkSize = Math.min(MAX, Math.max(MIN, Math.ceil(size / 1000)));
  let total = Math.ceil(size / chunkSize);
  while (total > 1000) {
    chunkSize = Math.ceil(size / 1000);
    total = Math.ceil(size / chunkSize);
  }
  return { chunkSize, total };
}

/**
 * Chunked upload: PUT each slice with Content-Range to the upload_url
 * issued by init (valid for one hour).
 */
async function uploadInChunks(uploadUrl: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<void> {
  const size = bytes.byteLength;
  if (size === 0) fail('Media file is empty.');
  const { chunkSize, total: count } = chunkPlan(size);

  for (let i = 0; i < count; i++) {
    const start = i * chunkSize;
    const end = Math.min(size, start + chunkSize) - 1;
    const chunk = bytes.subarray(start, end + 1);
    let res: Response;
    try {
      res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(chunk.byteLength),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Transfer-Encoding': 'binary',
        },
        body: chunk,
      });
    } catch (err) {
      throw new ApiError(`Chunk ${i + 1}/${count} upload failed: ${redact(String(err))}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ApiError(`Chunk ${i + 1}/${count} upload failed (HTTP ${res.status}): ${redact(text.slice(0, 300))}`);
    }
    await res.text().catch(() => ''); // drain body
  }
}

function videoContentType(url: string): string {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.mov')) return 'video/quicktime';
  if (path.endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}

export const tiktok: SocialProvider = {
  platform: 'tiktok',

  readiness(env: Env): PlatformReadiness {
    return readiness(env, 'tiktok');
  },

  authorizeUrl(env: Env): string {
    const { TIKTOK_CLIENT_KEY: clientKey, TIKTOK_REDIRECT_URI: redirect } = requireEnv(
      env,
      [ENV_KEYS.TIKTOK_CLIENT_KEY, ENV_KEYS.TIKTOK_REDIRECT_URI],
      'TikTok connect',
    );
    const params = new URLSearchParams({
      client_key: clientKey!,
      redirect_uri: redirect!,
      response_type: 'code',
      scope: scopesFor(env).join(' '),
    });
    // `state` is added by the CLI (CSRF check on return).
    return `${AUTHORIZE}?${params.toString()}`;
  },

  async connect(env: Env, redirectUrlOrCode: string): Promise<ConnectCredentials> {
    const cfg = requireEnv(
      env,
      [
        ENV_KEYS.TIKTOK_CLIENT_KEY,
        ENV_KEYS.TIKTOK_CLIENT_SECRET,
        ENV_KEYS.TIKTOK_REDIRECT_URI,
      ],
      'TikTok connect',
    );
    const code = extractCode(redirectUrlOrCode);
    const res = await postForm<TokenResponse>(TOKEN, {
      client_key: cfg[ENV_KEYS.TIKTOK_CLIENT_KEY]!,
      client_secret: cfg[ENV_KEYS.TIKTOK_CLIENT_SECRET]!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: cfg[ENV_KEYS.TIKTOK_REDIRECT_URI]!,
    });
    const values = tokenValues(res);
    const granted = res.scope ?? scopesFor(env).join(' ');
    return {
      values,
      summary:
        `TikTok connected: open_id ${values[ENV_KEYS.TIKTOK_OPEN_ID]}, access token (~24h) + ` +
        `refresh token (~365d) stored. Scopes granted: ${granted}.` +
        (tikTokDirectPostApproved(env)
          ? ''
          : ' video.publish NOT requested/approved — draft (inbox) mode only until TIKTOK_DIRECT_POST_APPROVED=true.'),
    };
  },

  async refresh(env: Env): Promise<ConnectCredentials> {
    const cfg = requireEnv(
      env,
      [
        ENV_KEYS.TIKTOK_CLIENT_KEY,
        ENV_KEYS.TIKTOK_CLIENT_SECRET,
        ENV_KEYS.TIKTOK_REFRESH_TOKEN,
      ],
      'TikTok token refresh',
    );
    const res = await postForm<TokenResponse>(TOKEN, {
      client_key: cfg[ENV_KEYS.TIKTOK_CLIENT_KEY]!,
      client_secret: cfg[ENV_KEYS.TIKTOK_CLIENT_SECRET]!,
      grant_type: 'refresh_token',
      refresh_token: cfg[ENV_KEYS.TIKTOK_REFRESH_TOKEN]!,
    });
    const values = tokenValues(res);
    return {
      values,
      summary: `TikTok access token refreshed at ${values[ENV_KEYS.TIKTOK_TOKEN_OBTAINED_AT]}.`,
    };
  },

  tokenStatus(env: Env): TokenStatus {
    const obtainedAt = env[ENV_KEYS.TIKTOK_TOKEN_OBTAINED_AT] ?? null;
    const obtained = obtainedAt ? Date.parse(obtainedAt) : NaN;
    const needsRefresh = !Number.isFinite(obtained) || Date.now() - obtained > TOKEN_TTL_MS;
    return {
      connected: Boolean(env[ENV_KEYS.TIKTOK_ACCESS_TOKEN]),
      obtainedAt,
      expiresAt: null, // access token ~24h; refresh token ~365d
      needsRefresh,
    };
  },

  async publish(env: Env, post: SocialPost): Promise<PublishOutcome> {
    const cfg = requireEnv(
      env,
      [ENV_KEYS.TIKTOK_ACCESS_TOKEN, ENV_KEYS.TIKTOK_OPEN_ID],
      'TikTok publish',
    );
    const token = cfg[ENV_KEYS.TIKTOK_ACCESS_TOKEN]!;
    const mode = post.options?.tiktok?.postMode ?? 'direct';

    if (mode === 'direct' && !tikTokDirectPostApproved(env)) {
      throw new ApprovalRequiredError(
        'TikTok direct post blocked: TIKTOK_DIRECT_POST_APPROVED is not "true". ' +
          'Until TikTok grants the video.publish scope (direct-post audit), content can only ' +
          'be delivered in draft mode (options.tiktok.postMode = "draft"). Do not set the ' +
          'flag until approval has actually been obtained.',
      );
    }

    // Direct posts require creator_info first (TikTok's consent/UX contract).
    let privacy: string | undefined = post.options?.tiktok?.privacyLevel;
    if (mode === 'direct') {
      const creator = await postJson<
        {
          data?: { privacy_level_options?: string[]; creator_username?: string };
          error?: { code?: string; message?: string };
        }
      >(`${API}/post/publish/creator_info/query/`, token, {});
      if (creator.error && creator.error.code !== 'ok') {
        fail(`creator_info/query failed: ${creator.error.code} ${creator.error.message ?? ''}`);
      }
      const options = creator.data?.privacy_level_options ?? [];
      if (!privacy) {
        privacy = options.includes('PUBLIC_TO_EVERYONE')
          ? 'PUBLIC_TO_EVERYONE'
          : options[0];
      }
      if (!privacy) fail('creator_info returned no privacy_level_options.');
      if (options.length > 0 && !options.includes(privacy)) {
        fail(`privacy_level "${privacy}" is not offered; options were: ${options.join(', ')}`);
      }
    }

    const media = post.media[0];
    if (!media) fail('Post has no media.');

    const isPhoto = post.media.every((m) => m.kind === 'image');
    let init: InitResponse;
    let publishId: string;

    await sleepBetweenInits(); // respect 6 req/min on init endpoints

    if (isPhoto) {
      // Photos: PULL_FROM_URL only — URLs must be verified in the TikTok
      // developer portal. title ≤90 runes, description ≤4000 runes.
      const caption = post.caption;
      const title = caption.length <= 90 ? caption : caption.slice(0, 87) + '…';
      init = await postJson<InitResponse>(`${API}/post/publish/content/init/`, token, {
        post_info: {
          title,
          description: caption.length <= 4000 ? caption : caption.slice(0, 4000),
          ...(mode === 'direct'
            ? {
                privacy_level: privacy,
                disable_comment: post.options?.tiktok?.disableComment ?? false,
              }
            : {}),
        },
        source_info: {
          source: 'PULL_FROM_URL',
          photo_images: post.media.map((m) => m.url),
          photo_cover_index: 0,
        },
        post_mode: mode === 'direct' ? 'DIRECT_POST' : 'MEDIA_UPLOAD',
        media_type: 'PHOTO',
      });
    } else {
      const useUrl = post.options?.tiktok?.source === 'url';
      const endpoint =
        mode === 'direct'
          ? `${API}/post/publish/video/init/`
          : `${API}/post/publish/inbox/video/init/`;

      let sourceInfo: Record<string, unknown>;
      if (useUrl) {
        // PULL_FROM_URL — requires verified URL ownership (url_ownership_unverified otherwise).
        sourceInfo = { source: 'PULL_FROM_URL', video_url: media.url };
      } else {
        // FILE_UPLOAD — no domain verification needed; chunked transfer.
        const bytes = await fetchMedia(media.url);
        const size = bytes.byteLength;
        const { chunkSize, total } = chunkPlan(size);

        const body: Record<string, unknown> = {
          post_info: {
            title: post.caption.slice(0, 2200),
            ...(mode === 'direct'
              ? {
                  privacy_level: privacy,
                  disable_duet: post.options?.tiktok?.disableDuet ?? false,
                  disable_stitch: post.options?.tiktok?.disableStitch ?? false,
                  disable_comment: post.options?.tiktok?.disableComment ?? false,
                }
              : {}),
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: size,
            chunk_size: chunkSize,
            total_chunk_count: total,
          },
        };

        init = await postJson<InitResponse>(endpoint, token, body);
        if (init.error && init.error.code !== 'ok') {
          fail(`video/init failed: ${init.error.code} ${init.error.message ?? ''}`);
        }
        publishId = init.data?.publish_id ?? fail('video/init returned no publish_id');
        const uploadUrl = init.data?.upload_url ?? fail('video/init returned no upload_url');
        await uploadInChunks(uploadUrl, bytes, videoContentType(media.url));
        return pollStatus(token, publishId, mode);
      }

      init = await postJson<InitResponse>(endpoint, token, {
        post_info: {
          title: post.caption.slice(0, 2200),
          ...(mode === 'direct'
            ? {
                privacy_level: privacy,
                disable_duet: post.options?.tiktok?.disableDuet ?? false,
                disable_stitch: post.options?.tiktok?.disableStitch ?? false,
                disable_comment: post.options?.tiktok?.disableComment ?? false,
              }
            : {}),
        },
        source_info: sourceInfo,
      });
    }

    if (init.error && init.error.code !== 'ok') {
      fail(`${isPhoto ? 'content' : 'video'}/init failed: ${init.error.code} ${init.error.message ?? ''}`);
    }
    publishId = init.data?.publish_id ?? fail('init returned no publish_id');
    return pollStatus(token, publishId, mode);
  },

  async publishStatus(env: Env, platformPostId: string): Promise<PublishStatusReport> {
    const cfg = requireEnv(env, [ENV_KEYS.TIKTOK_ACCESS_TOKEN], 'TikTok status');
    try {
      const res = await postJson<
        {
          data?: { status?: string; fail_reason?: string };
          error?: { code?: string; message?: string };
        }
      >(`${API}/post/publish/status/fetch/`, cfg[ENV_KEYS.TIKTOK_ACCESS_TOKEN]!, {
        publish_id: platformPostId,
      });
      const s = res.data?.status;
      if (s === 'PUBLISH_COMPLETE') {
        return { state: 'published', detail: `publish_id ${platformPostId} PUBLISH_COMPLETE` };
      }
      if (s === 'FAILED') {
        return { state: 'failed', detail: res.data?.fail_reason ?? 'FAILED' };
      }
      if (s) return { state: 'processing', detail: String(s) };
      return { state: 'unknown', detail: redact(JSON.stringify(res).slice(0, 300)) };
    } catch (err) {
      return { state: 'unknown', detail: redact(String(err instanceof Error ? err.message : err)) };
    }
  },

  disconnect(_env: Env): DisconnectReport {
    return {
      removed: [
        ENV_KEYS.TIKTOK_ACCESS_TOKEN,
        ENV_KEYS.TIKTOK_REFRESH_TOKEN,
        ENV_KEYS.TIKTOK_OPEN_ID,
        ENV_KEYS.TIKTOK_TOKEN_OBTAINED_AT,
      ],
      manualSteps: [
        'TikTok app: Profile → Settings → Privacy → Apps and services → remove Fresh Muse (revokes the Log in with TikTok authorization).',
        'TikTok for Developers portal: remove the authorized user from your app if listed.',
        'GitHub repo: Settings → Secrets and variables → Actions → delete the TIKTOK_* secrets.',
        'Note: TikTok does not expose a public token-revocation endpoint; local removal plus the steps above is the complete revocation.',
      ],
    };
  },
};

/** Poll TikTok's official status endpoint until the publish settles. */
async function pollStatus(token: string, publishId: string, mode: 'direct' | 'draft'): Promise<PublishOutcome> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const status = await postJson<
      {
        data?: { status?: string; fail_reason?: string };
        error?: { code?: string; message?: string };
      }
    >(`${API}/post/publish/status/fetch/`, token, { publish_id: publishId });
    const s = status.data?.status;
    if (s === 'PUBLISH_COMPLETE') {
      return {
        platformPostId: publishId,
        statusMessage:
          mode === 'direct'
            ? `Published to TikTok (publish_id ${publishId}).`
            : `Delivered to TikTok as a draft/inbox item (publish_id ${publishId}) — review and post in the TikTok app.`,
      };
    }
    if (s === 'SEND_TO_USER_INBOX' || (s === 'PUBLISH_COMPLETE' && mode === 'draft')) {
      return {
        platformPostId: publishId,
        statusMessage: `Delivered to TikTok inbox (publish_id ${publishId}).`,
      };
    }
    if (s === 'FAILED') {
      fail(`TikTok publish failed: ${status.data?.fail_reason ?? 'unknown reason'}`);
    }
    await sleep(5000);
  }
  fail(`Timed out polling TikTok status for publish_id ${publishId}. Check with \`post-status tiktok ${publishId}\`.`);
}
