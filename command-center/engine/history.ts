/**
 * Fresh Muse Command Center — change history, snapshots and undo.
 *
 * Every command gets ONE snapshot, captured lazily before the first file is
 * modified (or created/deleted). If the same command continues later (a
 * clarification reply or a confirmation), paths already captured are never
 * re-captured — so undo always restores the true pre-command state.
 *
 * State lives in `command-center/.state/` (git-ignored). No credentials,
 * no git operations — undo is a pure file restore, which keeps the
 * Freebuff Changes panel as the single owner of commits.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { HistoryEntry } from './types.ts';

export const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const STATE_DIR = path.join(ROOT, 'command-center', '.state');
const SNAP_DIR = path.join(STATE_DIR, 'snapshots');
const HISTORY_FILE = path.join(STATE_DIR, 'history.json');

/** Keep the record bounded. */
const MAX_ENTRIES = 80;

/** Normalize any project-relative path to a safe posix form. */
export function toRel(p: string): string {
  return path.relative(ROOT, path.resolve(ROOT, p)).split(path.sep).join('/');
}

export async function readHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeHistory(entries: HistoryEntry[]): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const kept = entries.slice(-MAX_ENTRIES);
  await fs.writeFile(HISTORY_FILE, `${JSON.stringify(kept, null, 2)}\n`);
  // Prune snapshots that no longer have a record entry.
  const ids = new Set(kept.map((e) => e.id));
  try {
    for (const dir of await fs.readdir(SNAP_DIR)) {
      if (!ids.has(dir)) await fs.rm(path.join(SNAP_DIR, dir), { recursive: true, force: true });
    }
  } catch {
    /* no snapshots yet */
  }
}

export async function appendEntry(entry: HistoryEntry): Promise<void> {
  const entries = await readHistory();
  entries.push(entry);
  await writeHistory(entries);
}

export async function updateEntry(
  id: string,
  patch: Partial<HistoryEntry>,
): Promise<HistoryEntry | null> {
  const entries = await readHistory();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  entries[idx] = { ...entries[idx], ...patch };
  await writeHistory(entries);
  return entries[idx];
}

export async function getEntry(id: string): Promise<HistoryEntry | null> {
  const entries = await readHistory();
  return entries.find((e) => e.id === id) ?? null;
}

// ── snapshots ───────────────────────────────────────────────────────────────

interface SnapshotMeta {
  id: string;
  instruction: string;
  paths: Record<string, { existed: boolean }>;
}

async function readMeta(id: string): Promise<SnapshotMeta | null> {
  try {
    const raw = await fs.readFile(path.join(SNAP_DIR, id, 'meta.json'), 'utf8');
    return JSON.parse(raw) as SnapshotMeta;
  } catch {
    return null;
  }
}

async function writeMeta(meta: SnapshotMeta): Promise<void> {
  const dir = path.join(SNAP_DIR, meta.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
}

/**
 * Record the CURRENT state of a path before it is modified.
 * Captures only the first time each path is touched by this command.
 */
export async function capturePath(id: string, instruction: string, rel: string): Promise<void> {
  const meta = (await readMeta(id)) ?? { id, instruction, paths: {} };
  if (meta.paths[rel]) return;
  const abs = path.join(ROOT, rel);
  let existed = true;
  try {
    await fs.access(abs);
  } catch {
    existed = false;
  }
  meta.paths[rel] = { existed };
  await writeMeta(meta);
  if (existed) {
    const dest = path.join(SNAP_DIR, id, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(abs, dest);
  }
}

/** Restore every path captured for this command. Returns what was restored. */
export async function restoreSnapshot(id: string): Promise<string[]> {
  const meta = await readMeta(id);
  if (!meta) return [];
  const restored: string[] = [];
  for (const [rel, info] of Object.entries(meta.paths)) {
    const abs = path.join(ROOT, rel);
    if (info.existed) {
      const src = path.join(SNAP_DIR, id, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.copyFile(src, abs);
    } else {
      await fs.rm(abs, { force: true });
    }
    restored.push(rel);
  }
  return restored;
}

export async function deleteSnapshot(id: string): Promise<void> {
  await fs.rm(path.join(SNAP_DIR, id), { recursive: true, force: true });
}

// ── undo ────────────────────────────────────────────────────────────────────

export interface UndoOutcome {
  ok: boolean;
  message: string;
  restored: string[];
  entryId?: string;
}

/**
 * Undo the most recent change that can still be restored: the latest entry
 * that was applied, or one abandoned at the confirmation step.
 */
export async function undoLast(): Promise<UndoOutcome> {
  const entries = await readHistory();
  const target = [...entries]
    .reverse()
    .find((e) => (e.status === 'applied' || e.status === 'awaiting_confirm') && e.id);

  if (!target) {
    return { ok: false, message: 'There is no recent change to undo.', restored: [] };
  }
  const restored = await restoreSnapshot(target.id);
  await updateEntry(target.id, { status: 'undone', note: 'reverted by you' });
  await deleteSnapshot(target.id);

  const described =
    restored.length === 0
      ? 'nothing needed restoring'
      : `restored ${restored.length === 1 ? restored[0] : `${restored.length} files`}`;
  return {
    ok: true,
    message: `Undone — “${target.instruction}” was reverted (${described}).`,
    restored,
    entryId: target.id,
  };
}
