/**
 * Fresh Muse Command Center — dev-only API middleware.
 *
 * Registered through a Vite plugin's configureServer hook, which runs ONLY
 * under `astro dev` (the studio environment) and has zero effect on the
 * production static build — no adapters, no prerender flags, no server in
 * production. GitHub Pages keeps serving pure static files; the Command
 * Center API simply does not exist there.
 *
 * Endpoints (all dev-only):
 *   GET  /api/command        → liveness info
 *   POST /api/command        → {action: run | undo | history | status}
 *                              run streams Server-Sent Events
 *
 * The engine modules are loaded through Vite's SSR loader, so they are
 * transformed on the fly and share one module instance (the run-lock works).
 */

const MAX_BODY = 1_000_000; // 1 MB is plenty for instructions + thread

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(new Error('Malformed request — expected a JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sanitizeThread(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(-20)) {
    if (!item || typeof item !== 'object') continue;
    const { role, content } = item;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      out.push({ role, content: content.slice(0, 8000) });
    }
  }
  return out;
}

export function commandApiPlugin() {
  return {
    name: 'fresh-muse-command-center-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (url !== '/api/command') return next();

        try {
          if (req.method === 'GET') {
            sendJson(res, {
              service: 'fresh-muse-command-center',
              live: true,
              note: 'POST a JSON body with an action.',
            });
            return;
          }
          if (req.method !== 'POST') {
            sendJson(res, { error: 'Use POST.' }, 405);
            return;
          }

          const body = await readJsonBody(req);
          const action = String(body.action || '');

          const [engine, history, tools, provider] = await Promise.all([
            server.ssrLoadModule('/command-center/engine/index.ts'),
            server.ssrLoadModule('/command-center/engine/history.ts'),
            server.ssrLoadModule('/command-center/engine/tools.ts'),
            server.ssrLoadModule('/command-center/engine/provider.ts'),
          ]);

          if (action === 'status') {
            sendJson(res, {
              live: true,
              hasKey: provider.hasKey(),
              connections: await tools.getConnections(),
            });
            return;
          }

          if (action === 'history') {
            const entries = await history.readHistory();
            sendJson(res, { entries: entries.slice().reverse() });
            return;
          }

          if (action === 'undo') {
            sendJson(res, await history.undoLast());
            return;
          }

          if (action !== 'run') {
            sendJson(res, { error: `Unknown action: ${action}` }, 400);
            return;
          }

          const commandId =
            typeof body.commandId === 'string' && /^[a-z0-9-]{4,64}$/i.test(body.commandId)
              ? body.commandId
              : null;
          if (!commandId) {
            sendJson(res, { error: 'Missing command id.' }, 400);
            return;
          }
          const instruction = typeof body.instruction === 'string' ? body.instruction.slice(0, 4000) : '';
          const thread = sanitizeThread(body.thread);
          const approved = body.approved === true;
          if (!instruction && thread.length === 0) {
            sendJson(res, { error: 'Empty instruction.' }, 400);
            return;
          }

          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          });

          const emit = (event) => {
            try {
              res.write(`data: ${JSON.stringify(event)}\n\n`);
            } catch {
              /* client disconnected */
            }
          };

          try {
            await engine.runCommand({ commandId, instruction, thread, approved }, emit);
          } catch (err) {
            emit({
              type: 'error',
              message: err && err.message ? err.message : 'Unexpected failure.',
            });
          } finally {
            emit({ type: 'done' });
            res.end();
          }
        } catch (err) {
          if (!res.headersSent) {
            sendJson(
              res,
              { error: err && err.message ? err.message : 'Request failed.' },
              400,
            );
          } else {
            res.end();
          }
        }
      });
    },
  };
}
