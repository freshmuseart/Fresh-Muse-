/**
 * Fresh Muse Command Center — tools the AI engine may use.
 *
 * Guardrails enforced HERE, not by prompt:
 *  • every path is resolved inside the project root and rejected otherwise
 *  • credentials and build/git internals are off-limits (reads and writes)
 *  • file reads are capped so the model cannot swallow the whole project
 *  • destructive deletes are flagged and only run with explicit approval
 *  • checks run the project's real commands (tsc + astro check) and their
 *    REAL exit status is reported — never faked
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { ROOT, capturePath, toRel } from './history.ts';
import { UserFacingError, type ToolDef } from './types.ts';

const exec = promisify(execFile);

const READ_CAP = 40_000; // bytes per read
const WRITE_CAP = 300_000;
const CHECK_TIMEOUT = 180_000;

/** Nothing in here may be read or written by the engine. */
const PROTECTED = [
  '.git/',
  'node_modules/',
  'dist/',
  '.astro/',
  'command-center/.state/',
  '.env',
  '.env.',
];

function isProtected(rel: string): boolean {
  const r = rel.startsWith('./') ? rel.slice(2) : rel;
  return PROTECTED.some((p) => (p.endsWith('/') ? r.startsWith(p) : r === p || r.startsWith(p)));
}

/** Resolve a user/model-supplied path inside the project, or throw. */
export function resolveSafe(p: string): string {
  const trimmed = p.trim().replace(/^\.\//, '');
  const abs = path.resolve(ROOT, trimmed);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
    throw new UserFacingError(`Path outside the project: ${p}`);
  }
  const rel = toRel(abs);
  if (rel === '' || rel.startsWith('..')) {
    throw new UserFacingError(`Path outside the project: ${p}`);
  }
  if (isProtected(rel)) {
    throw new UserFacingError(
      `${rel} is off-limits to the command engine.`,
      'Credentials, build output and history are never touched.',
    );
  }
  return abs;
}

// ── check runner ────────────────────────────────────────────────────────────

export interface CheckResult {
  ok: boolean;
  name: string;
  output: string;
}

async function runOne(name: string, args: string[]): Promise<CheckResult> {
  try {
    const { stdout, stderr } = await exec(process.execPath, args, {
      cwd: ROOT,
      timeout: CHECK_TIMEOUT,
      maxBuffer: 4 * 1024 * 1024,
    });
    const output = `${stdout}\n${stderr}`.trim();
    return { ok: true, name, output: output.slice(-6000) };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = `${e.stdout ?? ''}\n${e.stderr ?? ''}\n${e.message ?? ''}`.trim();
    return { ok: false, name, output: output.slice(-6000) };
  }
}

/** Run the project's real checks: typecheck first, then astro check. */
export async function runChecks(): Promise<{ ok: boolean; results: CheckResult[] }> {
  const results: CheckResult[] = [];
  const tsc = await runOne('typecheck', [
    path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
    '-b',
    '--noEmit',
  ]);
  results.push(tsc);
  if (!tsc.ok) return { ok: false, results };
  const astro = await runOne('astro check', [
    path.join(ROOT, 'node_modules', 'astro', 'astro.js'),
    'check',
  ]);
  results.push(astro);
  return { ok: astro.ok, results };
}

// ── connections info (powers "what is connected to the site?") ─────────────

export async function getConnections(): Promise<Record<string, unknown>> {
  const { site } = await import('../../src/data/site.ts');
  const { readiness } = await import('../../social/config.ts');

  let articleCount = 0;
  try {
    articleCount = (await fs.readdir(path.join(ROOT, 'src', 'content', 'articles'))).filter(
      (f) => f.endsWith('.md'),
    ).length;
  } catch {
    /* content dir missing */
  }

  const socials = site.social.map((s) => ({
    network: s.label,
    url: s.href,
    configured: Boolean(s.href),
  }));

  return {
    siteName: site.name,
    tagline: site.tagline,
    contactEmail: site.contactEmail,
    newsletter: site.newsletterAction
      ? 'connected'
      : 'not connected yet (form shows a friendly note)',
    socialLinks: socials,
    articles: articleCount,
    socialPublishing: {
      instagram: readiness(process.env, 'instagram'),
      tiktok: readiness(process.env, 'tiktok'),
    },
    note: 'Publishing credentials are never shown here — only whether configuration is present.',
  };
}

// ── tool schemas (OpenAI-compatible) ────────────────────────────────────────

const obj = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  properties,
  required,
});

export const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read one project file. Use before ever writing a file.',
      parameters: obj({ path: { type: 'string', description: 'Project-relative file path' } }, ['path']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Create or fully replace a project file with the given content. ALWAYS read the file first and reuse its style. Snapshotted automatically (undoable).',
      parameters: obj(
        {
          path: { type: 'string', description: 'Project-relative file path' },
          content: { type: 'string', description: 'The complete new file content' },
        },
        ['path', 'content'],
      ),
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description:
        'Delete a project file. DESTRUCTIVE — the user is asked to confirm before anything is removed.',
      parameters: obj({ path: { type: 'string', description: 'Project-relative file path' } }, ['path']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_checks',
      description: 'Run the project typecheck and Astro check. Run after edits and before finishing.',
      parameters: obj({}, []),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_connections',
      description:
        'Report everything currently connected to the site (newsletter, social links, publishing readiness, article count). Use for "what is connected" questions.',
      parameters: obj({}, []),
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description:
        'Ask the owner ONE short plain-language clarification when the request is ambiguous. Never ask technical questions. Only one question per command.',
      parameters: obj({ question: { type: 'string', description: 'One short question in plain English' } }, ['question']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'undo_last',
      description: 'Revert the most recent applied change. Use when the owner asks to undo.',
      parameters: obj({}, []),
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description:
        'End the command. summary = one plain-English sentence for the owner. changes = short human-readable lines describing each change (mention file names only as labels).',
      parameters: obj(
        {
          summary: { type: 'string', description: 'Plain-English result, max 2 sentences' },
          changes: { type: 'array', items: { type: 'string' }, description: 'One line per change' },
        },
        ['summary', 'changes'],
      ),
    },
  },
];

export const TOOL_NAMES = new Set(TOOL_DEFS.map((t) => t.function.name));

// ── execution ───────────────────────────────────────────────────────────────

export interface ToolContext {
  commandId: string;
  instruction: string;
  approved: boolean;
  touched: Set<string>;
}

export interface ToolOutcome {
  /** Response handed back to the model. */
  result: string;
  /** Set when the engine must stop (ask/confirm). */
  terminal?: 'ask' | 'confirm';
  /** Set when the command finished (engine stops). */
  finished?: { summary: string; changes: string[] };
  /** Destructive action awaiting the owner's yes/no. */
  pendingConfirm?: { path: string };
}

export async function executeTool(
  name: string,
  argsRaw: string,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsRaw || '{}') as Record<string, unknown>;
  } catch {
    throw new UserFacingError(`The engine sent malformed arguments for ${name}.`);
  }

  switch (name) {
    case 'read_file': {
      const abs = resolveSafe(String(args['path'] ?? ''));
      let content: string;
      try {
        content = await fs.readFile(abs, 'utf8');
      } catch {
        throw new UserFacingError(`Could not read ${toRel(abs)} — does it exist?`);
      }
      const truncated = content.length > READ_CAP;
      return {
        result: truncated
          ? `${content.slice(0, READ_CAP)}\n…[truncated at ${READ_CAP} chars]`
          : content,
      };
    }

    case 'write_file': {
      const abs = resolveSafe(String(args['path'] ?? ''));
      const content = String(args['content'] ?? '');
      if (content.length > WRITE_CAP) {
        throw new UserFacingError('That file would be too large to write in one step.');
      }
      const rel = toRel(abs);
      await capturePath(ctx.commandId, ctx.instruction, rel);
      let existed = true;
      try {
        await fs.access(abs);
      } catch {
        existed = false;
      }
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content);
      ctx.touched.add(rel);
      return { result: `Wrote ${rel} (${existed ? 'updated' : 'created'}).`, };
    }

    case 'delete_file': {
      const abs = resolveSafe(String(args['path'] ?? ''));
      const rel = toRel(abs);
      try {
        await fs.access(abs);
      } catch {
        throw new UserFacingError(`${rel} does not exist — nothing to delete.`);
      }
      if (!ctx.approved) {
        // Do NOT delete yet — surface the confirmation request to the owner.
        return {
          result:
            'CONFIRMATION REQUIRED. The owner has been asked to approve this deletion. ' +
            'Call finish now, summarising exactly what would be removed if they approve. ' +
            'Do not attempt the deletion again until they approve.',
          terminal: 'confirm',
          pendingConfirm: { path: rel },
        };
      }
      await capturePath(ctx.commandId, ctx.instruction, rel);
      await fs.rm(abs, { force: true });
      ctx.touched.add(rel);
      return { result: `Deleted ${rel}.` };
    }

    case 'run_checks': {
      const { ok, results } = await runChecks();
      const lines = results.map(
        (r) => `${r.name}: ${r.ok ? 'PASSED' : 'FAILED'}${r.ok ? '' : `\n${r.output}`}`,
      );
      return { result: `${ok ? 'ALL CHECKS PASSED.' : 'CHECKS FAILED.'}\n${lines.join('\n\n')}` };
    }

    case 'get_connections': {
      return { result: JSON.stringify(await getConnections(), null, 2) };
    }

    case 'ask_user': {
      const question = String(args['question'] ?? '').trim();
      if (!question) throw new UserFacingError('ask_user was called without a question.');
      return { result: 'Question shown to the owner.', terminal: 'ask' };
    }

    case 'undo_last': {
      const { undoLast } = await import('./history.ts');
      const outcome = await undoLast();
      return { result: outcome.ok ? outcome.message : `Undo: ${outcome.message}` };
    }

    case 'finish': {
      const summary = String(args['summary'] ?? '').trim() || 'Done.';
      const changes = Array.isArray(args['changes'])
        ? (args['changes'] as unknown[]).map(String)
        : [];
      return { result: 'Finished.', finished: { summary, changes } };
    }

    default:
      throw new UserFacingError(`Unknown tool: ${name}`);
  }
}
