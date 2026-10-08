/**
 * Fresh Muse Command Center — AI provider adapter.
 *
 * OpenAI-compatible chat-completions with tool calling, so the engine works
 * with any of the low-cost/free providers by changing environment variables:
 *
 *   FRESHMUSE_AI_API_KEY    ← required (the ONE secret this system needs)
 *   FRESHMUSE_AI_BASE_URL   ← optional (default: Google Gemini free tier,
 *                                       OpenAI-compatible endpoint)
 *   FRESHMUSE_AI_MODEL      ← optional (default: gemini-2.5-flash)
 *
 * Alternatives (no code changes):
 *   OpenRouter  base https://openrouter.ai/api/v1   model any free model
 *   Groq        base https://api.groq.com/openai/v1  model a groq model
 *   Ollama      base http://localhost:11434/v1       model any local model
 *
 * The key is read from the environment ONLY — never printed, never sent to
 * the browser, never stored in this repository.
 */

import { UserFacingError, type ChatMessage, type ToolCall, type ToolDef } from './types.ts';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const DEFAULT_MODEL = 'gemini-2.5-flash';

export interface ProviderConfig {
  baseUrl: string;
  key: string;
  model: string;
}

export function hasKey(): boolean {
  return Boolean(process.env['FRESHMUSE_AI_API_KEY']);
}

export function providerConfig(): ProviderConfig {
  const key = process.env['FRESHMUSE_AI_API_KEY'];
  if (!key) {
    throw new UserFacingError(
      'The Command Center is not connected to an AI model yet.',
      'One free setup step: get a free API key (Google AI Studio works well), then add it as ' +
        'FRESHMUSE_AI_API_KEY in Settings → Environment, and reload this page.',
    );
  }
  return {
    key,
    baseUrl: (process.env['FRESHMUSE_AI_BASE_URL'] || DEFAULT_BASE).replace(/\/+$/, ''),
    model: process.env['FRESHMUSE_AI_MODEL'] || DEFAULT_MODEL,
  };
}

export interface AssistantTurn {
  content: string | null;
  toolCalls: ToolCall[];
}

/** One chat-completions call with tools. Throws UserFacingError on failure. */
export async function chat(
  messages: ChatMessage[],
  tools: ToolDef[],
  cfg: ProviderConfig = providerConfig(),
): Promise<AssistantTurn> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        tools,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(150_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UserFacingError(
      'Could not reach the AI service.',
      `Network error: ${message.slice(0, 200)}. Check your connection and try again.`,
    );
  }

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new UserFacingError(
        'The AI service rejected the key.',
        'FRESHMUSE_AI_API_KEY looks invalid or expired — update it in Settings → Environment.',
      );
    }
    if (res.status === 404) {
      throw new UserFacingError(
        `The AI model "${cfg.model}" was not found on this service.`,
        'Adjust FRESHMUSE_AI_MODEL (or FRESHMUSE_AI_BASE_URL) in Settings → Environment.',
      );
    }
    if (res.status === 429) {
      throw new UserFacingError(
        'The AI service is rate-limiting right now.',
        'Wait a minute and try again — free tiers have per-minute/day limits.',
      );
    }
    throw new UserFacingError(
      `The AI service returned an error (HTTP ${res.status}).`,
      text.slice(0, 300),
    );
  }

  let parsed: {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UserFacingError('The AI service returned an unreadable response.');
  }

  const message = parsed.choices?.[0]?.message;
  if (!message) {
    throw new UserFacingError('The AI service returned no message.');
  }
  return { content: message.content ?? null, toolCalls: message.tool_calls ?? [] };
}
