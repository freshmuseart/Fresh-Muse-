/**
 * Fresh Muse — the contract every social provider implements.
 *
 * Five capabilities per platform, exactly as required by the integration
 * plan:
 *
 *   connect     — OAuth account authorization (never password login)
 *   publish     — server-side publishing of an approved SocialPost
 *   publishStatus — check the platform's status for a post/publish id
 *   tokens      — read token status + refresh before expiry
 *   disconnect  — revoke locally + instructions for platform-side revocation
 *
 * Every method is offline-safe until real credentials exist: missing
 * configuration throws NotConfiguredError naming the exact variables
 * needed — it never fabricates a response or pretends an account is
 * connected.
 */

import type { Env, Platform, PlatformReadiness } from '../config.ts';
import type { SocialPost } from '../content.ts';

export class SocialIntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialIntegrationError';
  }
}

/** Required credentials are absent from the environment. */
export class NotConfiguredError extends SocialIntegrationError {
  constructor(platform: Platform, missing: string[]) {
    super(
      `${platform} is not configured. Missing: ${missing.join(', ')}. ` +
        `Complete the setup steps in social/README.md (no credential is stored in this repository).`,
    );
    this.name = 'NotConfiguredError';
  }
}

/** A required platform approval has not been obtained yet. */
export class ApprovalRequiredError extends SocialIntegrationError {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalRequiredError';
  }
}

/** The platform API returned an error (message already redacted). */
export class ApiError extends SocialIntegrationError {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Outcome of a completed OAuth connect (values to persist — never logged). */
export interface ConnectCredentials {
  /** Env var name → value to persist securely. */
  values: Record<string, string>;
  /** Human-readable summary that is safe to print (no secrets). */
  summary: string;
}

export interface TokenStatus {
  connected: boolean;
  obtainedAt: string | null;
  expiresAt: string | null;
  /** True when the token should be refreshed before the next publish. */
  needsRefresh: boolean;
}

export interface PublishOutcome {
  platformPostId: string;
  statusMessage: string;
}

export interface PublishStatusReport {
  state: 'unknown' | 'processing' | 'published' | 'failed';
  detail: string;
}

export interface DisconnectReport {
  /** Env var names removed from the local credential store. */
  removed: string[];
  /** Steps the owner must do on the platform side to fully revoke. */
  manualSteps: string[];
}

export interface SocialProvider {
  readonly platform: Platform;

  /** Offline readiness report (names only). */
  readiness(env: Env): PlatformReadiness;

  /** Build the OAuth authorize URL (throws NotConfiguredError if incomplete). */
  authorizeUrl(env: Env): string;

  /**
   * Exchange a redirected authorization code for tokens.
   * Returns values to persist; callers must never print them.
   */
  connect(env: Env, redirectUrlOrCode: string): Promise<ConnectCredentials>;

  /** Refresh tokens before expiry; returns replacement values to persist. */
  refresh(env: Env): Promise<ConnectCredentials>;

  /** Current token status (offline — reads env only). */
  tokenStatus(env: Env): TokenStatus;

  /**
   * Publish an approved post. Performs ONLY official platform API calls.
   * Throws NotConfiguredError / ApprovalRequiredError / ApiError.
   */
  publish(env: Env, post: SocialPost): Promise<PublishOutcome>;

  /** Query the platform for the status of a previously attempted publish. */
  publishStatus(env: Env, platformPostId: string): Promise<PublishStatusReport>;

  /** Remove local credentials + report manual platform-side revocation steps. */
  disconnect(env: Env): DisconnectReport;
}
