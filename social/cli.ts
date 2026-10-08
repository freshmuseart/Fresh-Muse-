/**
 * Fresh Muse — social integration CLI.
 *
 * The ONLY executable for the social architecture. Runs locally or inside the
 * manual GitHub Actions workflow; never from the website build, never in the
 * browser. All credentials come from the environment (.env.local locally,
 * GitHub Actions Secrets/Variables in CI) — this file contains none.
 *
 * Commands (safe by default — no network unless a command explicitly does
 * an OAuth/API operation with real credentials):
 *
 *   status                          readiness report (offline)
 *   queue                           show the content queue (offline)
 *   connect <platform>              start OAuth: prints the authorize URL (offline)
 *   connect <platform> --url "<u>"  complete OAuth: exchanges the code (network)
 *   refresh <platform>              refresh stored tokens (network)
 *   disconnect <platform>           remove stored tokens + manual revoke steps
 *   publish                         DRY RUN: what would publish (offline, default)
 *   publish --confirm publish       actually publish due posts (network, gated)
 *   post-status <platform> <id>     check a platform post/publish id (network)
 *
 * Usage:  bun social/cli.ts <command> ...
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ConfigurationError,
  readiness,
  tikTokDirectPostApproved,
  type Env,
  type Platform,
} from './config.ts';
import {
  applyPublishResult,
  duePosts,
  parseQueue,
  serializeQueue,
  type SocialPost,
} from './content.ts';
import { redact, randomState } from './oauth.ts';
import { instagram } from './providers/instagram.ts';
import { tiktok } from './providers/tiktok.ts';
import type { SocialProvider } from './providers/types.ts';
import { ApprovalRequiredError, NotConfiguredError } from './providers/types.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENV_LOCAL = path.join(ROOT, '.env.local');
const QUEUE_FILE = path.join(ROOT, 'social', 'content', 'queue.json');
const STATE_FILE = path.join(ROOT, 'social', '.oauth-state.json');

const providers: Record<Platform, SocialProvider> = { instagram, tiktok };

function isPlatform(value: string | undefined): value is Platform {
  return value === 'instagram' || value === 'tiktok';
}

// ── argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

// ── local credential store (.env.local — git-ignored) ──────────────────────

/**
 * Merge values into .env.local without touching other keys. Values are
 * quoted/escaped; they are NEVER printed. Removals delete whole lines.
 */
function writeEnvLocal(updates: Record<string, string>, removals: string[] = []): void {
  const keys = new Set([...Object.keys(updates), ...removals]);
  let lines = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, 'utf8').split('\n') : [];
  lines = lines.filter((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    return !(m && keys.has(m[1]));
  });
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  for (const [k, v] of Object.entries(updates)) {
    const escaped = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    lines.push(`${k}="${escaped}"`);
  }
  writeFileSync(ENV_LOCAL, `${lines.join('\n')}\n`);
}

function currentEnv(): Env {
  return { ...process.env };
}

// ── OAuth state (CSRF protection across two CLI invocations) ───────────────

interface OAuthStateFile {
  platform: Platform;
  state: string;
  createdAt: string;
}

function saveState(platform: Platform, state: string): void {
  const payload: OAuthStateFile = { platform, state, createdAt: new Date().toISOString() };
  writeFileSync(STATE_FILE, `${JSON.stringify(payload, null, 2)}\n`);
}

function readAndClearState(platform: Platform): string | null {
  if (!existsSync(STATE_FILE)) return null;
  let parsed: OAuthStateFile;
  try {
    parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as OAuthStateFile;
  } catch {
    return null;
  }
  if (parsed.platform !== platform) return null; // leave other sessions intact
  writeFileSync(STATE_FILE, '');
  return parsed.state;
}

// ── commands ───────────────────────────────────────────────────────────────

function cmdStatus(): void {
  const env = currentEnv();
  console.log('Fresh Muse — social integration status');
  console.log('(offline; shows variable NAMES only, never values)\n');

  for (const platform of ['instagram', 'tiktok'] as Platform[]) {
    const r = readiness(env, platform);
    console.log(`── ${platform.toUpperCase()} ${'─'.repeat(Math.max(0, 40 - platform.length))}`);
    console.log(`  connect : ${r.connectMissing.length === 0 ? 'ready to start OAuth' : `missing ${r.connectMissing.join(', ')}`}`);
    console.log(`  publish : ${r.publishMissing.length === 0 ? 'all credentials present' : `missing ${r.publishMissing.join(', ')}`}`);
    console.log(`  token   : ${r.tokenPresent ? 'present' : 'none'}`);
    if (r.tokenObtainedAt) console.log(`  issued  : ${r.tokenObtainedAt}`);
    if (r.tokenExpiresAt) console.log(`  expires : ${r.tokenExpiresAt}`);
    if (r.blockedBy.length > 0) {
      for (const b of r.blockedBy) console.log(`  BLOCKED : ${b}`);
    }
    console.log('');
  }

  if (env['GITHUB_ACTIONS'] === 'true') {
    console.log('Running in GitHub Actions — refresh tokens written this run must be copied back into the repo Secrets.');
  }
}

function cmdQueue(): void {
  const posts = parseQueue(readJsonFile(QUEUE_FILE));
  console.log(`Fresh Muse — content queue (${posts.length} posts)\n`);
  for (const p of posts) {
    console.log(`  [${p.status.padEnd(10)}] ${p.id} · ${p.platform}`);
    console.log(`      title     : ${p.title}`);
    console.log(`      scheduled : ${p.scheduledFor ?? '(not scheduled)'}`);
    console.log(`      media     : ${p.media.length} item(s) — ${p.media.map((m) => m.kind).join(', ')}`);
    if (p.platformPostId) console.log(`      post id   : ${p.platformPostId}`);
    if (p.statusMessage) console.log(`      status    : ${p.statusMessage}`);
  }
}

function cmdConnect(platform: Platform, flags: Record<string, string | boolean>): void {
  const provider = providers[platform];
  const env = currentEnv();
  const redirectUrl = typeof flags['url'] === 'string' ? flags['url'] : null;

  if (!redirectUrl) {
    // Step 1 — offline: print the authorize URL (no secret involved).
    const url = provider.authorizeUrl(env); // throws if config missing
    const stateHex = randomState();
    saveState(platform, stateHex);
    const fullUrl = `${url}&state=${stateHex}`;
    console.log(`Connect ${platform} — step 1 of 2\n`);
    console.log('1. Open this URL in your browser and approve access:');
    console.log(`   ${fullUrl}\n`);
    console.log('2. After approving, the browser redirects to the registered redirect');
    console.log('   URI. That page may not load (localhost or a 404) — that is OK.');
    console.log('   Copy the FULL URL from the address bar, including ?code=...&state=...\n');
    console.log(`3. Run:\n   bun social/cli.ts connect ${platform} --url "<paste the full redirect URL>"`);
    return;
  }

  // Step 2 — online: verify state, exchange the code, persist tokens.
  const expectedState = readAndClearState(platform);
  const stateParam = safeStateParam(redirectUrl);
  if (!expectedState) {
    throw new Error(
      'No connect session found for this platform — run `connect <platform>` again to start a fresh authorization.',
    );
  }
  if (stateParam && stateParam !== expectedState) {
    throw new Error('State mismatch — the redirect does not belong to this connect session. Restart the flow.');
  }

  provider
    .connect(env, redirectUrl)
    .then((result) => {
      writeEnvLocal(result.values);
      console.log(`Connect ${platform} — step 2 of 2\n`);
      console.log(result.summary);
      console.log(`\nCredentials written to .env.local (git-ignored). The values are NOT printed.`);
      if (env['GITHUB_ACTIONS'] === 'true') {
        console.log('In CI: copy these values into GitHub Secrets before relying on them there.');
      } else {
        console.log('Next: copy the same values into GitHub → Settings → Secrets and variables → Actions.');
      }
    })
    .catch((err) => {
      fail(err);
    });
}

function safeStateParam(url: string): string | null {
  try {
    return new URL(url).searchParams.get('state');
  } catch {
    return null;
  }
}

function cmdRefresh(platform: Platform): void {
  const provider = providers[platform];
  const env = currentEnv();
  provider
    .refresh(env)
    .then((result) => {
      // Apply to the live process so a following publish in this run uses them.
      Object.assign(process.env, result.values);
      writeEnvLocal(result.values);
      console.log(result.summary);
      console.log('Updated .env.local (git-ignored).');
      if (env['GITHUB_ACTIONS'] === 'true') {
        console.log(
          `Reminder: update these secrets in GitHub → Settings → Secrets and variables → Actions: ${Object.keys(result.values).join(', ')}`,
        );
      }
    })
    .catch((err) => fail(err));
}

function cmdDisconnect(platform: Platform): void {
  const provider = providers[platform];
  const report = provider.disconnect(currentEnv());
  writeEnvLocal({}, report.removed);
  readAndClearState(platform);
  console.log(`Disconnected ${platform}\n`);
  console.log('Removed from .env.local:');
  for (const k of report.removed) console.log(`  - ${k}`);
  console.log('\nAlso do this on the platform side (complete revocation):');
  for (const s of report.manualSteps) console.log(`  • ${s}`);
}

function cmdPublish(flags: Record<string, string | boolean>): void {
  const confirmed = flags['confirm'] === 'publish';
  const env = currentEnv();
  const posts = parseQueue(readJsonFile(QUEUE_FILE));
  const now = new Date();

  const due = duePosts(posts, now, false);
  const drafts = posts.filter((p) => p.status === 'draft');
  const scheduledFuture = posts.filter(
    (p) => p.status === 'scheduled' && p.scheduledFor !== null && Date.parse(p.scheduledFor) > now.getTime(),
  );

  if (!confirmed) {
    console.log('Fresh Muse — publish DRY RUN (no network, nothing will be posted)\n');
    console.log(`Due now        : ${due.length}`);
    console.log(`Future schedule: ${scheduledFuture.length}`);
    console.log(`Drafts         : ${drafts.length}\n`);
    for (const p of due) describePlanned(env, p);
    for (const p of scheduledFuture) describePlanned(env, p);
    console.log('To publish for real:  bun social/cli.ts publish --confirm publish');
    console.log('(Requires complete credentials; TikTok direct posts additionally require TIKTOK_DIRECT_POST_APPROVED=true.)');
    return;
  }

  if (due.length === 0) {
    console.log('Nothing is due to publish right now. (Drafts are never auto-published.)');
    return;
  }

  // Pre-flight: never start publishing if any due post cannot complete.
  const problems: string[] = [];
  for (const p of due) {
    const r = readiness(env, p.platform);
    if (r.publishMissing.length > 0) {
      problems.push(`${p.id}: ${p.platform} missing ${r.publishMissing.join(', ')}`);
    }
    if (p.platform === 'tiktok') {
      const mode = p.options?.tiktok?.postMode ?? 'direct';
      if (mode === 'direct' && !tikTokDirectPostApproved(env)) {
        problems.push(`${p.id}: TikTok direct post mode, but TIKTOK_DIRECT_POST_APPROVED is not "true"`);
      }
    }
  }
  if (problems.length > 0) {
    console.log('Refusing to publish — pre-flight failed:\n');
    for (const pr of problems) console.log(`  ✗ ${pr}`);
    process.exitCode = 1;
    return;
  }

  void publishDue(env, due, posts);
}

async function publishDue(env: Env, due: SocialPost[], all: SocialPost[]): Promise<void> {
  let queue = all;
  let failures = 0;

  for (const post of due) {
    const provider = providers[post.platform];
    console.log(`\nPublishing ${post.id} → ${post.platform} …`);
    try {
      // Keep tokens fresh (writes .env.local locally; reminds about Secrets in CI).
      const ts = provider.tokenStatus(env);
      if (ts.needsRefresh) {
        const refreshed = await provider.refresh(env);
        Object.assign(process.env, refreshed.values);
        Object.assign(env, refreshed.values);
        writeEnvLocal(refreshed.values);
        console.log(`  token refreshed — ${refreshed.summary}`);
        if (env['GITHUB_ACTIONS'] === 'true') {
          console.log(
            `  ⚠ persist these into GitHub Secrets: ${Object.keys(refreshed.values).join(', ')}`,
          );
        }
      }

      queue = applyPublishResult(queue, post.id, { status: 'publishing' });
      const outcome = await provider.publish(env, post);
      queue = applyPublishResult(queue, post.id, {
        status: 'published',
        platformPostId: outcome.platformPostId,
        statusMessage: outcome.statusMessage,
      });
      console.log(`  ✓ ${outcome.statusMessage}`);
    } catch (err) {
      failures++;
      const message = redact(err instanceof Error ? err.message : String(err));
      queue = applyPublishResult(queue, post.id, { status: 'failed', statusMessage: message });
      console.log(`  ✗ ${message}`);
      if (err instanceof NotConfiguredError || err instanceof ApprovalRequiredError || err instanceof ConfigurationError) {
        console.log('  Stopping: configuration/approval issues will affect every post. Fix and re-run.');
        break;
      }
    }
  }

  writeFileSync(QUEUE_FILE, serializeQueue(queue));
  console.log(`\nQueue updated: ${QUEUE_FILE}`);
  if (env['GITHUB_ACTIONS'] === 'true') {
    console.log('CI: commit/pull the updated queue.json if you want the status persisted to the repo.');
  }
  if (failures > 0) process.exitCode = 1;
}

function describePlanned(env: Env, p: SocialPost): void {
  const r = readiness(env, p.platform);
  const mode = p.platform === 'tiktok' ? (p.options?.tiktok?.postMode ?? 'direct') : 'direct';
  const gate =
    p.platform === 'tiktok' && mode === 'direct' && !tikTokDirectPostApproved(env)
      ? ' [BLOCKED: needs TIKTOK_DIRECT_POST_APPROVED=true]'
      : r.publishMissing.length > 0
        ? ` [BLOCKED: missing ${r.publishMissing.join(', ')}]`
        : '';
  console.log(
    `  • ${p.id} → ${p.platform}${p.platform === 'tiktok' ? ` (${mode})` : ''} — "${p.title}" · ${p.media.length} media · due ${p.scheduledFor}${gate}`,
  );
}

async function cmdPostStatus(platform: Platform, postId: string | undefined): Promise<void> {
  if (!postId) throw new Error('Usage: post-status <instagram|tiktok> <post-id>');
  const env = currentEnv();
  const report = await providers[platform].publishStatus(env, postId);
  console.log(`${platform} status for ${postId}: ${report.state}`);
  console.log(`  ${report.detail}`);

  // Persist the observation onto any queue entry referencing this id.
  const posts = parseQueue(readJsonFile(QUEUE_FILE));
  const match = posts.find((p) => p.platformPostId === postId);
  if (match) {
    const queue = applyPublishResult(posts, match.id, {
      status: report.state === 'published' ? 'published' : report.state === 'failed' ? 'failed' : match.status,
      statusMessage: report.detail,
    });
    writeFileSync(QUEUE_FILE, serializeQueue(queue));
    console.log(`  queue entry "${match.id}" updated.`);
  }
}

// ── helpers / entry ────────────────────────────────────────────────────────

function readJsonFile(file: string): unknown {
  if (!existsSync(file)) throw new Error(`Missing file: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function fail(err: unknown): never {
  const message = redact(err instanceof Error ? err.message : String(err));
  console.error(`\n✗ ${message}`);
  if (err instanceof ConfigurationError) {
    console.error('  See social/README.md for the full setup checklist.');
  }
  process.exit(1);
}

const HELP = `Fresh Muse social CLI

  status                            readiness report (offline)
  queue                             show the content queue (offline)
  connect <instagram|tiktok>        start OAuth — prints the authorize URL
  connect <platform> --url "<url>"  finish OAuth — exchanges the code
  refresh <platform>                refresh stored tokens
  disconnect <platform>             remove stored tokens + revocation steps
  publish                           DRY RUN (offline, the default)
  publish --confirm publish         publish everything that is due (gated)
  post-status <platform> <id>       query a post/publish id

No command ever prints a credential. See social/README.md.`;

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, first, second] = positional;

  switch (command) {
    case 'status':
      return cmdStatus();
    case 'queue':
      return cmdQueue();
    case 'connect': {
      if (!isPlatform(first)) throw new Error('Usage: connect <instagram|tiktok> [--url "<redirect url>"]');
      return cmdConnect(first, flags);
    }
    case 'refresh':
      if (!isPlatform(first)) throw new Error('Usage: refresh <instagram|tiktok>');
      return cmdRefresh(first);
    case 'disconnect':
      if (!isPlatform(first)) throw new Error('Usage: disconnect <instagram|tiktok>');
      return cmdDisconnect(first);
    case 'publish':
      return cmdPublish(flags);
    case 'post-status': {
      if (!isPlatform(first)) throw new Error('Usage: post-status <instagram|tiktok> <post-id>');
      return await cmdPostStatus(first, second);
    }
    case 'help':
    case '--help':
    case undefined:
      console.log(HELP);
      return;
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
}

main().catch(fail);
