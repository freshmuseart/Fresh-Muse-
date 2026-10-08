/**
 * Fresh Muse Command Center — client panel logic.
 *
 * Plain DOM, no framework. Talks to `/api/command`:
 *   run     → streamed events (stage/file/check/ask/confirm/result/error)
 *   undo    → revert the most recent applied change
 *   history → render "The record"
 *   status  → connection state (a boolean — never a credential)
 */

interface TextTurn {
  role: 'user' | 'assistant';
  content: string;
}

type EventData = {
  type: string;
  label?: string;
  path?: string;
  action?: string;
  name?: string;
  ok?: boolean;
  detail?: string;
  question?: string;
  status?: string;
  summary?: string;
  changes?: string[];
  files?: string[];
  message?: string;
  hint?: string;
};

interface HistoryItem {
  id: string;
  at: string;
  instruction: string;
  status: string;
  summary?: string;
  changes?: string[];
  files?: string[];
}

const $ = <T extends HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

/** Site base path ('/' in the studio, '/<repo>/' on GitHub Pages). */
const BASE = import.meta.env.BASE_URL || '/';

export function initPanel(): void {
  const form = $<HTMLFormElement>('cc-form');
  const input = $<HTMLTextAreaElement>('cc-input');
  const applyBtn = $<HTMLButtonElement>('cc-apply');
  const activity = $<HTMLOListElement>('cc-activity');
  const statusEl = $<HTMLElement>('cc-status');
  const historyEl = $<HTMLOListElement>('cc-history');
  const emptyEl = $<HTMLElement>('cc-empty');
  const undoBtn = $<HTMLButtonElement>('cc-undo');
  const askBox = $<HTMLElement>('cc-ask');
  const askText = $<HTMLElement>('cc-ask-text');
  const askInput = $<HTMLInputElement>('cc-ask-input');
  const askSend = $<HTMLButtonElement>('cc-ask-send');
  const confirmBox = $<HTMLElement>('cc-confirm');
  const confirmText = $<HTMLElement>('cc-confirm-text');
  const confirmDetail = $<HTMLElement>('cc-confirm-detail');
  const confirmYes = $<HTMLButtonElement>('cc-confirm-yes');
  const confirmNo = $<HTMLButtonElement>('cc-confirm-no');
  const refreshBtn = $<HTMLButtonElement>('cc-refresh');
  const preview = $<HTMLIFrameElement>('cc-preview');
  const connectionsEl = $<HTMLElement>('cc-connections');

  // The closed (published) notice has no form — stay silent there.
  if (!form || !input || !applyBtn || !statusEl) return;

  let busy = false;
  let commandId: string | null = null;
  /** Plain-language turns of the current interaction (no tool chatter). */
  let textThread: TextTurn[] = [];
  /** The instruction sent most recently (not yet in textThread). */
  let sentInstruction = '';

  const newId = (): string =>
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `cmd-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  // ── small views ──────────────────────────────────────────────────────────

  const setStatus = (kind: 'success' | 'error' | 'info' | '', text: string, hint?: string): void => {
    statusEl!.textContent = text;
    if (kind) statusEl!.setAttribute('data-kind', kind);
    else statusEl!.removeAttribute('data-kind');
    if (hint) {
      const line = document.createElement('span');
      line.className = 'hintline';
      line.textContent = hint;
      statusEl!.appendChild(line);
    }
  };

  const addActivity = (text: string, kind: 'stage' | 'ok' | 'fail' | 'file' | ''): void => {
    if (!activity) return;
    const li = document.createElement('li');
    if (kind === 'stage') li.className = 'is-stage';
    if (kind === 'ok') li.className = 'is-ok';
    if (kind === 'fail') li.className = 'is-fail';
    if (kind === 'file' && text.includes(' — ')) {
      const [head, tail] = text.split(' — ');
      li.append(`${head} `);
      const span = document.createElement('span');
      span.className = 'path';
      span.textContent = tail;
      li.appendChild(span);
    } else {
      li.textContent = text;
    }
    activity.insertBefore(li, activity.firstChild);
    while (activity.children.length > 14) activity.removeChild(activity.lastChild!);
  };

  const refreshPreview = (): void => {
    window.setTimeout(() => {
      try {
        preview?.contentWindow?.location.reload();
      } catch {
        if (preview) preview.src = preview.src;
      }
    }, 500);
  };

  const STATUS_LABELS: Record<string, string> = {
    applied: 'Applied',
    answered: 'Answered',
    failed: 'Rolled back',
    undone: 'Undone',
    awaiting_reply: 'Waiting for you',
    awaiting_confirm: 'Waiting for you',
    in_progress: 'In progress',
  };

  const renderHistory = (entries: HistoryItem[]): void => {
    if (!historyEl || !emptyEl) return;
    historyEl.textContent = '';
    emptyEl.hidden = entries.length > 0;
    for (const e of entries.slice(0, 20)) {
      const li = document.createElement('li');

      const instr = document.createElement('p');
      instr.className = 'rec-instr';
      instr.textContent = `“${e.instruction}”`;
      li.appendChild(instr);

      if (e.summary) {
        const sum = document.createElement('p');
        sum.className = 'rec-summary';
        sum.textContent = e.summary;
        li.appendChild(sum);
      }

      const meta = document.createElement('div');
      meta.className = 'rec-meta';
      const chip = document.createElement('span');
      chip.className = `rec-status ${e.status}`;
      chip.textContent = STATUS_LABELS[e.status] ?? e.status;
      meta.appendChild(chip);
      const when = document.createElement('span');
      when.textContent = new Date(e.at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      meta.appendChild(when);
      li.appendChild(meta);

      if (e.files && e.files.length > 0) {
        const files = document.createElement('div');
        files.className = 'rec-files';
        for (const f of e.files.slice(0, 8)) {
          const s = document.createElement('span');
          s.textContent = f;
          files.appendChild(s);
        }
        li.appendChild(files);
      }
      historyEl.appendChild(li);
    }
  };

  const loadHistory = async (): Promise<void> => {
    try {
      const res = await fetch(`${BASE}api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'history' }),
      });
      const data = (await res.json()) as { entries?: HistoryItem[] };
      renderHistory(data.entries ?? []);
    } catch {
      /* history is non-critical */
    }
  };

  const loadStatus = async (): Promise<void> => {
    try {
      const res = await fetch(`${BASE}api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      const data = (await res.json()) as {
        hasKey?: boolean;
        connections?: {
          newsletter?: string;
          articles?: number;
          socialLinks?: Array<{ network: string }>;
        };
      };
      if (connectionsEl && data.connections) {
        const socialCount = data.connections.socialLinks?.length ?? 0;
        connectionsEl.textContent =
          `Connected — ${data.connections.articles ?? 0} articles · ` +
          `${socialCount} social link${socialCount === 1 ? '' : 's'} · newsletter ${data.connections.newsletter}`;
      }
      if (data.hasKey === false) {
        setStatus(
          'info',
          'One-time setup: connect an AI model to use the Command Center.',
          'Get a free API key (Google AI Studio), then add FRESHMUSE_AI_API_KEY in Settings → Environment and reload.',
        );
      }
    } catch {
      /* status is non-critical */
    }
  };

  // ── running a command ────────────────────────────────────────────────────

  const setBusy = (value: boolean): void => {
    busy = value;
    applyBtn.disabled = value;
    applyBtn.textContent = value ? 'Working…' : 'Apply change';
    if (undoBtn) undoBtn.disabled = value;
  };

  const handleEvent = (ev: EventData): void => {
    switch (ev.type) {
      case 'stage':
        addActivity(ev.label ?? '', 'stage');
        break;
      case 'file': {
        const verb =
          ev.action === 'create' ? 'Created' : ev.action === 'delete' ? 'Removed' : 'Edited';
        addActivity(`${verb} — ${ev.path ?? ''}`, 'file');
        break;
      }
      case 'check':
        addActivity(
          `${ev.name}: ${ev.ok ? 'passed' : 'failed'}`,
          ev.ok ? 'ok' : 'fail',
        );
        if (!ev.ok && ev.detail) addActivity(ev.detail.split('\n').slice(0, 4).join(' · '), 'fail');
        break;
      case 'ask':
        if (sentInstruction) {
          textThread.push({ role: 'user', content: sentInstruction });
        }
        textThread.push({ role: 'assistant', content: ev.question ?? '?' });
        sentInstruction = '';
        if (askText) askText.textContent = ev.question ?? 'Could you clarify?';
        if (askBox) askBox.hidden = false;
        askInput?.focus();
        break;
      case 'confirm':
        if (confirmText) confirmText.textContent = ev.question ?? 'Confirm this change?';
        if (confirmDetail) confirmDetail.textContent = ev.detail ?? '';
        if (confirmBox) confirmBox.hidden = false;
        break;
      case 'result': {
        const ok = ev.status === 'applied' || ev.status === 'answered';
        const lines = ev.changes && ev.changes.length > 0 ? ev.changes.join('\n') : '';
        setStatus(
          ok ? 'success' : 'error',
          ev.summary ?? (ok ? 'Done.' : 'That change could not be made.'),
          lines || undefined,
        );
        addActivity(ev.summary ?? 'Finished.', ok ? 'ok' : 'fail');
        endInteraction();
        refreshPreview();
        void loadHistory();
        break;
      }
      case 'error':
        setStatus('error', ev.message ?? 'Something went wrong.', ev.hint);
        addActivity(ev.message ?? 'Error', 'fail');
        break;
      case 'done':
        setBusy(false);
        break;
    }
  };

  const endInteraction = (): void => {
    commandId = null;
    textThread = [];
    sentInstruction = '';
    if (askBox) askBox.hidden = true;
    if (confirmBox) confirmBox.hidden = true;
    if (input) input.value = '';
    if (askInput) askInput.value = '';
  };

  const run = async (instruction: string, approved: boolean): Promise<void> => {
    if (busy || !instruction.trim()) return;
    if (askBox) askBox.hidden = true;
    if (confirmBox) confirmBox.hidden = true;

    if (!commandId) {
      commandId = newId();
      textThread = [];
    }
    sentInstruction = instruction;
    setBusy(true);
    setStatus('', '');
    addActivity('Understanding your request…', 'stage');

    try {
      const res = await fetch(`${BASE}api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run',
          commandId,
          instruction: approved ? '' : instruction,
          thread: approved ? [...textThread, { role: 'user', content: instruction }] : textThread,
          approved,
        }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed (HTTP ${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            handleEvent(JSON.parse(line.slice(6)) as EventData);
          } catch {
            /* skip malformed frame */
          }
        }
      }
    } catch (err) {
      setStatus(
        'error',
        err instanceof Error ? err.message : 'Could not reach the command service.',
        'The Command Center runs in the studio environment — reload if this persists.',
      );
    } finally {
      setBusy(false);
    }
  };

  // ── wiring ───────────────────────────────────────────────────────────────

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) {
      setStatus('info', 'Tell me what you would like changed first.');
      return;
    }
    void run(text, false);
  });

  document.querySelectorAll<HTMLButtonElement>('.chip[data-example]').forEach((chip) => {
    chip.addEventListener('click', () => {
      input.value = chip.getAttribute('data-example') ?? '';
      input.focus();
    });
  });

  askSend?.addEventListener('click', () => {
    const reply = askInput?.value.trim() ?? '';
    if (!reply) return;
    if (askBox) askBox.hidden = true;
    void run(reply, false);
  });
  askInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      askSend?.click();
    }
  });

  confirmYes?.addEventListener('click', () => {
    if (confirmBox) confirmBox.hidden = true;
    // Same instruction (already in thread), now with approval — same command id.
    const last = sentInstruction;
    const thread = [...textThread, ...(last ? [{ role: 'user' as const, content: last }] : [])];
    sentInstruction = '';
    void sendApproved(thread);
  });

  const sendApproved = async (thread: TextTurn[]): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setStatus('', '');
    addActivity('Applying your approval…', 'stage');
    try {
      const res = await fetch(`${BASE}api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run',
          commandId,
          instruction: '',
          thread,
          approved: true,
        }),
      });
      if (!res.ok || !res.body) throw new Error('Request failed.');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            handleEvent(JSON.parse(line.slice(6)) as EventData);
          } catch {
            /* skip */
          }
        }
      }
    } catch (err) {
      setStatus('error', err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  confirmNo?.addEventListener('click', () => {
    if (confirmBox) confirmBox.hidden = true;
    // Cancel everything from this request — conservative and clear.
    void (async () => {
      const res = await fetch(`${BASE}api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo' }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      setStatus('info', data.message ?? 'Cancelled.');
      endInteraction();
      refreshPreview();
      void loadHistory();
    })();
  });

  undoBtn?.addEventListener('click', () => {
    void (async () => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await fetch(`${BASE}api/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'undo' }),
        });
        const data = (await res.json()) as { ok?: boolean; message?: string };
        setStatus(data.ok ? 'success' : 'info', data.message ?? 'Done.');
        if (data.ok) refreshPreview();
        void loadHistory();
      } finally {
        setBusy(false);
      }
    })();
  });

  refreshBtn?.addEventListener('click', () => refreshPreview());

  void loadHistory();
  void loadStatus();
}
