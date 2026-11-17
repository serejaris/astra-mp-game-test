import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { arena, spells } from '../shared/arena.mjs';
import { Game, playerName } from './game.mjs';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const validCode = /^[A-HJ-NP-Z2-9]{6}$/;
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav'
};

function json(response, status, object) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(object));
}

export function createGameServer({ publicDir = fileURLToPath(new URL('../public/', import.meta.url)), maxRooms = 256 } = {}) {
  const games = new Map();
  const clients = new Map();
  const wsServer = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false, clientTracking: false });
  const root = resolve(publicDir);

  function getGame(code) {
    const existing = games.get(code);
    if (existing) return existing;
    if (games.size >= maxRooms) {
      const empty = [...games.values()].filter(game => !game.players.size).sort((a, b) => a.lastActive - b.lastActive)[0];
      if (!empty) return null;
      games.delete(empty.code);
    }
    const game = new Game(code);
    games.set(code, game);
    return game;
  }

  const server = createServer(async (request, response) => {
    response.setHeader('x-content-type-options', 'nosniff');
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname === '/healthz' || pathname === '/health') {
        return json(response, 200, { ok: true });
      }
      if (pathname === '/api/room') {
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST');
          return json(response, 405, { error: 'method_not_allowed' });
        }
        let code;
        do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (games.has(code));
        if (!getGame(code)) return json(response, 503, { error: 'server_busy' });
        return json(response, 201, { code, path: '/r/' + code });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { error: 'method_not_allowed' });
      const roomPath = /^\/r\/([A-Za-z0-9]+)\/?$/.exec(pathname);
      if (roomPath && !validCode.test(roomPath[1].toUpperCase())) return json(response, 404, { error: 'room_missing' });
      const requested = pathname === '/' || roomPath ? '/index.html' : pathname;
      const filename = resolve(root, '.' + requested);
      if (!filename.startsWith(root + sep)) return json(response, 404, { error: 'not_found' });
      const info = await stat(filename);
      if (!info.isFile()) return json(response, 404, { error: 'not_found' });
      const etag = 'W/"' + info.size.toString(16) + '-' + Math.trunc(info.mtimeMs).toString(16) + '"';
      response.setHeader('etag', etag);
      response.setHeader('cache-control', 'no-cache');
      const tags = (request.headers['if-none-match'] || '').split(',').map(tag => tag.trim());
      if (tags.includes(etag) || tags.includes('*')) {
        response.writeHead(304);
        return response.end();
      }
      response.writeHead(200, {
        'content-type': mime[extname(filename)] || 'application/octet-stream',
        'content-length': info.size
      });
      if (request.method === 'HEAD') return response.end();
      const file = createReadStream(filename);
      file.once('error', () => response.destroy());
      response.once('close', () => file.destroy());
      file.pipe(response);
    } catch (error) {
      if (response.headersSent) return response.destroy();
      if (error instanceof URIError || error.code === 'ERR_INVALID_ARG_VALUE') return json(response, 400, { error: 'invalid_path' });
      return json(response, 404, { error: 'not_found' });
    }
  });

  server.on('upgrade', (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      return socket.destroy();
    }
    if (url.pathname !== '/ws') return socket.destroy();
    wsServer.handleUpgrade(request, socket, head, ws => {
      ws.on('error', () => ws.terminate());
      const code = (url.searchParams.get('room') || '').toUpperCase();
      const game = validCode.test(code) ? getGame(code) : null;
      const player = game?.join(url.searchParams.get('name'));
      if (!player) {
        const reason = game ? 'room_full' : validCode.test(code) ? 'server_busy' : 'room_missing';
        ws.send(JSON.stringify({ type: 'error', code: reason }));
        return ws.close(1008, reason);
      }
      const peer = { game, player, alive: true, count: 0, window: Date.now(), ws };
      clients.set(ws, peer);
      ws.on('pong', () => { peer.alive = true; });
      ws.on('close', () => {
        clients.delete(ws);
        game.leave(player.id);
      });
      ws.on('message', (raw, binary) => {
        if (binary) return ws.close(1003, 'text_required');
        const now = Date.now();
        if (now - peer.window >= 1000) { peer.window = now; peer.count = 0; }
        if (++peer.count > 200) return ws.close(1008, 'rate_limit');
        let message;
        try { message = JSON.parse(raw.toString()); } catch { return ws.close(1007, 'invalid_json'); }
        if (!message || typeof message !== 'object') return;
        if (message.type === 'input') game.input(player, message);
        if (message.type === 'cast' && typeof message.spell === 'string') game.cast(player, message.spell, message.angle, now);
        if (message.type === 'name') player.name = playerName(message.name, player.slot);
        if (message.type === 'ping' && Number.isSafeInteger(message.nonce)) ws.send(JSON.stringify({ type: 'pong', nonce: message.nonce }));
      });
      ws.send(JSON.stringify({ type: 'welcome', id: player.id, code, arena, spells }));
      ws.send(JSON.stringify(game.snapshot()));
    });
  });

  let previous = Date.now();
  let frame = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    const seconds = (now - previous) / 1000;
    previous = now;
    const outgoing = new Map();
    for (const game of games.values()) {
      if (!game.players.size) {
        if (now - game.lastActive > 5 * 60_000) games.delete(game.code);
        continue;
      }
      game.tick(seconds, now);
      if (frame % 2 === 0) outgoing.set(game, JSON.stringify(game.snapshot(now)));
    }
    for (const { ws, game } of clients.values()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (ws.bufferedAmount > 256_000) { ws.terminate(); continue; }
      const state = outgoing.get(game);
      if (state) ws.send(state);
    }
    frame++;
  }, 1000 / 40);

  const heartbeat = setInterval(() => {
    for (const peer of clients.values()) {
      if (!peer.alive) peer.ws.terminate();
      else if (peer.ws.readyState === WebSocket.OPEN) { peer.alive = false; peer.ws.ping(); }
    }
  }, 30_000);

  async function close() {
    clearInterval(timer);
    clearInterval(heartbeat);
    for (const { ws } of clients.values()) ws.terminate();
    wsServer.close();
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }

  return { server, close };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { server, close } = createGameServer();
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => console.log('Rift Brawl listening on port ' + server.address().port));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void close(); });
}
