/**
 * Fresh Muse Command Center — the engine orchestrator.
 *
 * Takes one plain-English instruction, runs an AI tool loop against the real
 * project files, then verifies the result with the project's real checks.
 *
 * Guarantees:
 *  • smallest-change policy is explicit in the system prompt; file guardrails
 *    live in tools.ts (prompt-proof)
 *  • every mutation is snapshotted first → one-command undo
 *  • if checks fail after repair attempts, ALL of the command's changes are
 *    rolled back and reported honestly
 *  • destructive actions pause for the owner's confirmation
 *  • ambiguity → ONE plain-language question instead of a big assumption
 *  • no git, no deploys, no credentials, no servers
 */

import { buildOverview } from './overview.ts';
import { chat, providerConfig } from './provider.ts';
import { TOOL_DEFS, executeTool, runChecks, type ToolContext } from './tools.ts';
import { appendEntry, deleteSnapshot, getEntry, restoreSnapshot, updateEntry } from './history.ts';
import {
  UserFacingError,
  type ChatMessage,
  type Emit,
  type HistoryEntry,
} from './types.ts';

const MAX_STEPS = 18;
const MAX_REPAIRS = 2;

export interface RunOptions {
  /** Stable id for the whole interaction (kept across replies/confirms). */
  commandId: string;
  /** The owner's latest words (empty when context already carries them). */
  instruction: string;
  /** Earlier turns of this same interaction. */
  thread: ChatMessage[];
  /** True when the owner approved a pending destructive action. */
  approved?: boolean;
}

const SYSTEM_RULES = `You are the engine behind the Fresh Muse Command Center. The owner is NOT a
programmer. They describe changes in ordinary English; you implement them
directly in the project files.

How to work:
1. Read a file BEFORE writing it. write_file replaces the ENTIRE file, so
   reuse the existing content and change only what the instruction requires.
2. Make the SMALLEST change that fulfils the request. Never rewrite, reformat
   or "improve" unrelated code. Never touch files the request doesn't involve.
3. Preserve all existing functionality, routes, content and the visual
   identity (midnight/ivory/gold, Fraunces + IBM Plex Sans) unless the owner
   explicitly asks to change something specific.
4. Colours and typography: edit the tokens in src/styles/global.css when
   possible, so the change stays coherent.
5. For new articles: create one markdown file in src/content/articles/ with
   the exact frontmatter schema from src/content.config.ts, and only use a
   category that exists in src/data/categories.ts.
6. After ANY file edit, call run_checks. Fix real failures (max 2 repair
   rounds), then call finish.
7. If the instruction is ambiguous in a way that could cause a large wrong
   change, call ask_user with ONE short question in plain language — never
   ask about filenames, code, or technical details. If it is clear, proceed
   without questions.
8. If the owner asks to undo/revert, call undo_last.
9. delete_file requires the owner's confirmation — never try to work around it.
10. Never run git, never deploy, never start servers, never read or write
    credentials (.env is off-limits), never invent features that were not
    asked for.

Answering questions (for example "what is connected to the site?") needs no
file changes: call the right tool, then finish with a plain-English summary
and an informational changes list.

When done, call finish with:
- summary: 1–2 sentences of plain English (no jargon) telling the owner what
  happened and how to see it;
- changes: short human-readable lines, one per change (file names may appear
  as labels, e.g. "Homepage title size — src/styles/global.css").`;

function acquireLock(): boolean {
  const key = Symbol.for('freshmuse.command-center.lock');
  const g = globalThis as Record<symbol, { busy?: boolean }>;
  if (g[key]?.busy) return false;
  g[key] = { busy: true };
  return true;
}

function releaseLock(): void {
  const key = Symbol.for('freshmuse.command-center.lock');
  const g = globalThis as Record<symbol, { busy?: boolean }>;
  g[key] = { busy: false };
}

interface Finish {
  summary: string;
  changes: string[];
}

export async function runCommand(opts: RunOptions, emit: Emit): Promise<void> {
  if (!acquireLock()) {
    emit({
      type: 'error',
      message: 'Another command is still running.',
      hint: 'Let it finish, then send yours.',
    });
    emit({ type: 'done' });
    return;
  }

  const ctx: ToolContext = {
    commandId: opts.commandId,
    instruction: opts.instruction || 'continuation',
    approved: opts.approved === true,
    touched: new Set<string>(),
  };

  try {
    emit({ type: 'stage', label: 'Reading your instruction…' });
    providerConfig(); // throws a friendly onboarding error when no key

    const overview = await buildOverview();
    const messages: ChatMessage[] = [
      { role: 'system', content: `${SYSTEM_RULES}\n\n${overview}` },
      ...opts.thread,
      ...(opts.instruction ? [{ role: 'user' as const, content: opts.instruction }] : []),
    ];
    if (opts.approved) {
      messages.push({
        role: 'user',
        content:
          'The owner has APPROVED the pending destructive action(s) for this same request. ' +
          'Continue and finish the work now.',
      });
    }

    // One history record per command id (continued across replies/confirms).
    const existing = await getEntry(opts.commandId);
    if (existing) {
      await updateEntry(opts.commandId, { status: 'in_progress', at: new Date().toISOString() });
    } else {
      const fresh: HistoryEntry = {
        id: opts.commandId,
        at: new Date().toISOString(),
        instruction: opts.instruction || '(continuation)',
        status: 'in_progress',
      };
      await appendEntry(fresh);
    }

    let editsMade = false;
    let repairs = 0;
    let stopped = false;
    let showedEditStage = false;

    const saveEntry = (patch: Partial<HistoryEntry>): Promise<unknown> =>
      updateEntry(opts.commandId, patch);

    const emitResult = async (status: 'applied' | 'answered', fin: Finish, check?: string): Promise<void> => {
      emit({
        type: 'result',
        status,
        summary: fin.summary,
        changes: fin.changes,
        files: [...ctx.touched],
      });
      await saveEntry({
        status,
        summary: fin.summary,
        changes: fin.changes,
        files: [...ctx.touched],
        ...(check ? { check } : {}),
      });
    };

    /** Validate with real checks; 'repair' = push feedback and keep looping. */
    const attemptFinish = async (fin: Finish): Promise<'done' | 'repair'> => {
      if (!editsMade) {
        await emitResult('answered', fin);
        return 'done';
      }
      emit({ type: 'stage', label: 'Running checks…' });
      const { ok, results } = await runChecks();
      for (const r of results) {
        emit({
          type: 'check',
          name: r.name,
          ok: r.ok,
          ...(r.ok ? {} : { detail: r.output.slice(-2000) }),
        });
      }
      if (ok) {
        await emitResult('applied', fin, 'pass');
        return 'done';
      }

      const failureText = results
        .filter((r) => !r.ok)
        .map((r) => `${r.name} FAILED:\n${r.output}`)
        .join('\n\n');

      if (repairs < MAX_REPAIRS) {
        repairs++;
        emit({ type: 'stage', label: 'Fixing what the checks caught…' });
        messages.push({
          role: 'user',
          content:
            `Your last change does not pass the project checks:\n\n${failureText}\n\n` +
            'Fix these errors with the smallest possible edits (change only what is broken), ' +
            'then call finish again. Do not start over.',
        });
        return 'repair';
      }

      // Roll back everything this command touched — the site stays intact.
      const restored = await restoreSnapshot(ctx.commandId);
      await deleteSnapshot(ctx.commandId);
      emit({
        type: 'result',
        status: 'failed',
        summary:
          'The checks kept failing, so everything from this request was rolled back. ' +
          'The site is exactly as it was.',
        changes: [`Rolled back ${restored.length} file(s)`],
        files: restored,
      });
      emit({
        type: 'error',
        message: 'This change could not be made safely.',
        hint: failureText.slice(0, 2500),
      });
      await saveEntry({
        status: 'failed',
        summary: 'rolled back — checks failed',
        note: failureText.slice(0, 500),
        check: 'fail',
      });
      return 'done';
    };

    for (let step = 0; step < MAX_STEPS && !stopped; step++) {
      const turn = await chat(messages, TOOL_DEFS);

      if (turn.toolCalls.length === 0) {
        const summary = (turn.content ?? '').trim() || 'Done.';
        const outcome = await attemptFinish({ summary, changes: [] });
        if (outcome === 'repair') continue;
        stopped = true;
        break;
      }

      messages.push({ role: 'assistant', content: turn.content, tool_calls: turn.toolCalls });

      for (const call of turn.toolCalls) {
        if (stopped) break;
        const name = call.function.name;
        let outcome;
        try {
          outcome = await executeTool(name, call.function.arguments, ctx);
        } catch (err) {
          if (!(err instanceof UserFacingError)) throw err;
          outcome = { result: `TOOL ERROR: ${err.message}` };
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: outcome.result });

        if (name === 'write_file' || name === 'delete_file') {
          editsMade = true;
          if (!showedEditStage) {
            showedEditStage = true;
            emit({ type: 'stage', label: 'Making changes…' });
          }
          const lastFile = [...ctx.touched].pop();
          if (lastFile) {
            emit({ type: 'file', path: lastFile, action: name === 'delete_file' ? 'delete' : 'edit' });
          }
        }

        if (outcome.terminal === 'ask') {
          emit({ type: 'ask', question: safeQuestion(call.function.arguments) });
          await saveEntry({ status: 'awaiting_reply' });
          stopped = true;
          break;
        }

        if (outcome.terminal === 'confirm') {
          emit({
            type: 'confirm',
            question: 'This change removes a file. Apply it?',
            detail: outcome.pendingConfirm?.path ?? '',
          });
          await saveEntry({ status: 'awaiting_confirm' });
          stopped = true;
          break;
        }

        if (outcome.finished) {
          const fin = outcome.finished;
          const checkOutcome = await attemptFinish(fin);
          if (checkOutcome === 'done') stopped = true;
          // 'repair' → keep looping; the feedback message is already queued.
        }
      }
    }

    if (!stopped) {
      emit({
        type: 'error',
        message: 'The request needed too many steps to complete.',
        hint: 'Try a smaller, more specific request.',
      });
      await saveEntry({ status: 'failed', note: 'ran out of steps' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = err instanceof UserFacingError ? err.hint : undefined;
    emit({ type: 'error', message, ...(hint ? { hint } : {}) });
    await updateEntry(opts.commandId, { status: 'failed', note: message.slice(0, 300) }).catch(
      () => undefined,
    );
  } finally {
    releaseLock();
    emit({ type: 'done' });
  }
}

function safeQuestion(argsRaw: string): string {
  try {
    const args = JSON.parse(argsRaw || '{}') as { question?: string };
    return String(args.question ?? 'Could you clarify what you mean?');
  } catch {
    return 'Could you clarify what you mean?';
  }
}
