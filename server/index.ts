import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { initPhysics } from '../src/sim/physics';
import { DEFAULT_PORT, WS_PATH } from '../src/net/protocol';
import { Hub } from './hub';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** Start the game server: serves the built client (if present) and the WebSocket endpoint. */
export async function startServer(port = Number(process.env.PORT) || DEFAULT_PORT, staticDir = resolve(process.cwd(), 'dist')) {
  await initPhysics();
  const hub = new Hub();
  hub.start();

  const http = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, rooms: hub.rooms.size, players: hub.conns.size }));
        return;
      }
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (!path || path.endsWith('/')) path += 'index.html';
      const file = resolve(staticDir, path);
      if (!file.startsWith(staticDir)) {
        res.writeHead(403).end();
        return;
      }
      let target = file;
      const info = await stat(target).catch(() => null);
      if (!info || !info.isFile()) target = join(staticDir, 'index.html'); // SPA fallback (e.g. ?room= links)
      const body = await readFile(target);
      res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found — build the client with `npm run build`, or use `npm run dev` for development.');
    }
  });

  const wss = new WebSocketServer({ server: http, path: WS_PATH, maxPayload: 16 * 1024 });
  wss.on('connection', (ws) => {
    ws.binaryType = 'nodebuffer';
    hub.connect(ws);
  });
  // Drop dead connections.
  const heartbeat = setInterval(() => {
    for (const c of hub.conns) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, 15000);

  await new Promise<void>((ok) => http.listen(port, ok));
  const addr = http.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  return {
    port: actualPort,
    hub,
    close: () =>
      new Promise<void>((ok) => {
        clearInterval(heartbeat);
        hub.stop();
        for (const c of hub.conns) c.ws.terminate();
        wss.close();
        http.close(() => ok());
      }),
  };
}

// Run directly (node dist-server/index.js).
const isMain = typeof process !== 'undefined' && process.argv[1] && /index\.(js|ts)$/.test(process.argv[1]) && !process.env.VITEST;
if (isMain) {
  startServer().then(({ port }) => {
    console.log(`Wobble Weights server listening on http://localhost:${port} (WebSocket ${WS_PATH})`);
  });
}
