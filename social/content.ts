/**
 * Fresh Muse — internal social content model.
 *
 * A deliberately simple, plain-data model for one piece of approved content
 * destined for a social platform. It stores exactly:
 *
 *   content title · caption · media · platform · scheduled date/time ·
 *   publishing status · platform post ID · error/status message
 *
 * The queue lives in `social/content/queue.json` (plain JSON — safe to edit
 * by hand, safe to commit: it never contains credentials, only published
 * URLs, captions and status bookkeeping).
 */

import type { Platform } from './config.ts';

export type { Platform };

/** What kind of media this post carries. */
export type MediaKind = 'image' | 'video' | 'carousel';

/**
 * Lifecycle of a post.
 *   draft     → written, not scheduled
 *   scheduled → has a scheduledFor time in the future
 *   publishing→ a provider call is in flight
 *   published → platformPostId is set
 *   failed    → statusMessage explains why (safe to retry)
 */
export type PublishStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed';

export interface MediaAsset {
  kind: 'image' | 'video';
  /**
   * Publicly reachable URL. Required by BOTH platforms:
   *  - Instagram cURLs image_url/video_url at publish time (JPEG only for images).
   *  - TikTok PULL_FROM_URL fetches from a domain you have verified in the
   *    TikTok developer portal (photos REQUIRE a verified URL; videos may use
   *    file upload instead).
   */
  url: string;
  /** Alt text (Instagram images support captions' alt via alt_text field). */
  alt?: string;
}

export interface SocialPost {
  /** Stable id, e.g. "ig-eye-level-001". Used by the CLI and status updates. */
  id: string;
  /** Content title — internal, not shown by the platforms. */
  title: string;
  /** Caption / post text. Instagram caption (≤ 2200 chars) or TikTok title+description. */
  caption: string;
  media: MediaAsset[];
  platform: Platform;
  /** ISO 8601 date-time (e.g. "2026-11-01T09:00:00Z"), or null = not scheduled. */
  scheduledFor: string | null;
  status: PublishStatus;
  /** Platform post/media/publish ID once published; null otherwise. */
  platformPostId: string | null;
  /** Human-readable error or status message (e.g. "container FINISHED"). */
  statusMessage: string | null;
  /** Last update timestamp (ISO 8601), or null. */
  updatedAt: string | null;
  /** Optional per-platform knobs. */
  options?: {
    instagram?: {
      /** Defaults to "IMAGE" behaviour derived from media kind; REELS for video. */
      mediaType?: 'IMAGE' | 'VIDEO' | 'REELS' | 'STORIES';
    };
    tiktok?: {
      /**
       * "direct" = publish straight to the profile (requires video.publish
       * approval — TIKTOK_DIRECT_POST_APPROVED=true).
       * "draft"  = deliver to the creator's TikTok inbox/drafts for them to
       * review and post in the app (TikTok's required consent UX; only needs
       * the video.upload scope).
       */
      postMode?: 'direct' | 'draft';
      /**
       * Videos only: "file" (default) uploads the video bytes to TikTok in
       * chunks — no domain verification needed. "url" uses PULL_FROM_URL,
       * which requires a URL prefix/domain verified in the TikTok developer
       * portal (error url_ownership_unverified otherwise). Photos are always
       * PULL_FROM_URL — TikTok allows no other transfer method for photos.
       */
      source?: 'file' | 'url';
      privacyLevel?:
        | 'PUBLIC_TO_EVERYONE'
        | 'MUTUAL_FOLLOW_FRIENDS'
        | 'SELF_ONLY';
      disableComment?: boolean;
      disableDuet?: boolean;
      disableStitch?: boolean;
    };
  };
}

const STATUSES: PublishStatus[] = [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
];

/** Validate one entry from the queue JSON. Throws with a precise message. */
export function parsePost(raw: unknown, index: number): SocialPost {
  const where = `queue[${index}]`;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${where}: must be an object`);
  }
  const p = raw as Record<string, unknown>;

  const str = (key: string, allowEmpty = false): string => {
    const v = p[key];
    if (typeof v !== 'string' || (!allowEmpty && v.trim() === '')) {
      throw new Error(`${where}.${key}: expected a non-empty string`);
    }
    return v;
  };
  const nullStr = (key: string): string | null => {
    const v = p[key];
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string') throw new Error(`${where}.${key}: expected string or null`);
    return v;
  };

  const platform = str('platform');
  if (platform !== 'instagram' && platform !== 'tiktok') {
    throw new Error(`${where}.platform: must be "instagram" or "tiktok"`);
  }

  const status = str('status');
  if (!STATUSES.includes(status as PublishStatus)) {
    throw new Error(`${where}.status: must be one of ${STATUSES.join(', ')}`);
  }

  const scheduledFor = nullStr('scheduledFor');
  if (scheduledFor !== null && !Number.isFinite(Date.parse(scheduledFor))) {
    throw new Error(`${where}.scheduledFor: must be an ISO 8601 date-time or null`);
  }

  const mediaRaw = p['media'];
  if (!Array.isArray(mediaRaw) || mediaRaw.length === 0) {
    throw new Error(`${where}.media: expected a non-empty array`);
  }
  const media: MediaAsset[] = mediaRaw.map((m, i) => {
    if (typeof m !== 'object' || m === null) {
      throw new Error(`${where}.media[${i}]: must be an object`);
    }
    const mm = m as Record<string, unknown>;
    const kind = mm['kind'];
    if (kind !== 'image' && kind !== 'video') {
      throw new Error(`${where}.media[${i}].kind: must be "image" or "video"`);
    }
    const url = mm['url'];
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      throw new Error(`${where}.media[${i}].url: must be an http(s) URL`);
    }
    const alt = mm['alt'];
    if (alt !== undefined && typeof alt !== 'string') {
      throw new Error(`${where}.media[${i}].alt: must be a string`);
    }
    return alt === undefined
      ? { kind, url }
      : { kind, url, alt: alt as string };
  });

  const post: SocialPost = {
    id: str('id'),
    title: str('title'),
    caption: str('caption'),
    media,
    platform: platform as Platform,
    scheduledFor,
    status: status as PublishStatus,
    platformPostId: nullStr('platformPostId'),
    statusMessage: nullStr('statusMessage'),
    updatedAt: nullStr('updatedAt'),
  };
  if (typeof p['options'] === 'object' && p['options'] !== null) {
    post.options = p['options'] as SocialPost['options'];
  }
  return post;
}

/** Validate an entire queue document: `{ "posts": [...] }`. */
export function parseQueue(raw: unknown): SocialPost[] {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { posts?: unknown }).posts)) {
    throw new Error('queue.json: expected an object with a "posts" array');
  }
  const posts = ((raw as { posts: unknown[] }).posts).map(parsePost);
  const ids = new Set<string>();
  for (const p of posts) {
    if (ids.has(p.id)) throw new Error(`duplicate post id: ${p.id}`);
    ids.add(p.id);
  }
  return posts;
}

/** Posts whose scheduled time has arrived (or unscheduled drafts, if includeDrafts). */
export function duePosts(posts: SocialPost[], now: Date, includeDrafts = false): SocialPost[] {
  return posts.filter((p) => {
    if (p.status === 'published' || p.status === 'publishing') return false;
    if (p.scheduledFor === null) return includeDrafts;
    return Date.parse(p.scheduledFor) <= now.getTime();
  });
}

/** Return a copy of the queue with one post updated by a publish attempt. */
export function applyPublishResult(
  posts: SocialPost[],
  id: string,
  result: { status: PublishStatus; platformPostId?: string | null; statusMessage?: string | null },
): SocialPost[] {
  return posts.map((p) =>
    p.id === id
      ? {
          ...p,
          status: result.status,
          platformPostId: result.platformPostId ?? p.platformPostId,
          statusMessage: result.statusMessage ?? p.statusMessage,
          updatedAt: new Date().toISOString(),
        }
      : p,
  );
}

/** Stable, human-diffable JSON for queue.json. */
export function serializeQueue(posts: SocialPost[]): string {
  return `${JSON.stringify({ posts }, null, 2)}\n`;
}
