import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { RoomCoordinator } from './rooms.js';

// COMRADE_PORT wins over PORT so dev launchers that set PORT for the web app cannot steal it.
const PORT = process.env.COMRADE_PORT || process.env.PORT || 3001;

const publicRoot = resolve(process.env.STATIC_ROOT || 'public');
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.txt': 'text/plain' };
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ status: 'ok', commit: process.env.COMRADE_COMMIT || 'development' }));
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
      const file = resolve(publicRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(publicRoot + sep)) throw new Error('Invalid path');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  } else {
    res.writeHead(405);
    res.end('Method not allowed');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 65536 });
const rooms = new RoomCoordinator();

wss.on('connection', (ws) => {
  // Receiver errors (oversized frames, invalid UTF-8) belong to this peer.
  ws.on('error', () => ws.terminate());
  if (wss.clients.size > 128) { ws.close(1013, 'Connection capacity reached'); return; }
  const id = rooms.connect(message => ws.send(message));
  let messages = 0;
  const interval = setInterval(() => { messages = 0; }, 1000);

  ws.on('message', (data) => {
    if (++messages > 30) { ws.close(1008, 'Message rate exceeded'); return; }
    rooms.receive(id, data.toString());
  });

  ws.on('close', () => {
    clearInterval(interval);
    rooms.disconnect(id);
  });
});

server.listen(PORT, () => {
  console.log(`COMRADE service running on port ${PORT}`);
});
