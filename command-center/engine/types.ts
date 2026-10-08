/**
 * Fresh Muse Command Center — shared types.
 *
 * The command engine is intentionally isolated from the website: nothing
 * under `src/` imports these modules except the thin `/api/command` endpoint
 * and the `/command-center` page shell.
 */

/** Events streamed to the control panel while a command runs. */
export type EngineEvent =
  | { type: 'stage'; label: string }
  | { type: 'file'; path: string; action: 'edit' | 'create' | 'delete' }
  | { type: 'check'; name: string; ok: boolean; detail?: string }
  | { type: 'ask'; question: string }
  | { type: 'confirm'; question: string; detail: string }
  | {
      type: 'result';
      status: 'applied' | 'answered' | 'failed';
      summary: string;
      changes: string[];
      files: string[];
    }
  | { type: 'error'; message: string; hint?: string }
  | { type: 'done' };

export type Emit = (event: EngineEvent) => void;

/** OpenAI-compatible chat message shapes. */
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** One entry in the change record (the activity/history list). */
export interface HistoryEntry {
  id: string;
  at: string;
  instruction: string;
  status:
    | 'in_progress'
    | 'awaiting_reply'
    | 'awaiting_confirm'
    | 'applied'
    | 'answered'
    | 'failed'
    | 'undone';
  summary?: string;
  changes?: string[];
  files?: string[];
  check?: string;
  note?: string;
}

/** Friendly errors the UI can show without translation. */
export class UserFacingError extends Error {
  hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'UserFacingError';
    this.hint = hint;
  }
}
