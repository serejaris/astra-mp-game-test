import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';
import { createGameServer } from '../server/index.mjs';

async function instance(t) {
  const dir = await mkdtemp(join(tmpdir(), 'rift-brawl-test-'));
  await writeFile(join(dir, 'index.html'), '<main>Rift Brawl</main>');
  const game = createGameServer({ publicDir: dir });
  game.server.listen(0, '127.0.0.1');
  await once(game.server, 'listening');
  t.after(async () => { await game.close(); await rm(dir, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + game.server.address().port;
  const room = async () => {
    const response = await fetch(base + '/api/room', { method: 'POST' });
    assert.equal(response.status, 201);
    return response.json();
  };
  function peer(code, name = 'player') {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws?room=' + code + '&name=' + encodeURIComponent(name));
    const history = [];
    const pending = new Set();
    ws.on('message', data => {
      const message = JSON.parse(data.toString());
      history.push(message);
      for (const wait of pending) {
        if (wait.filter(message)) {
          clearTimeout(wait.timer);
          pending.delete(wait);
          wait.resolve(message);
        }
      }
    });
    const until = filter => {
      const match = history.find(filter);
      if (match) return Promise.resolve(match);
      return new Promise((resolve, reject) => {
        const wait = { filter, resolve, timer: null };
        wait.timer = setTimeout(() => { pending.delete(wait); reject(new Error('Timed out waiting for server message')); }, 3500);
        pending.add(wait);
      });
    };
    return { ws, until, send: value => ws.send(JSON.stringify(value)) };
  }
  return { base, room, peer };
}

test('shared invite serves game, syncs spells and motion, and isolates a separate room', async t => {
  const { base, room, peer } = await instance(t);
  const first = await room();
  const second = await room();
  assert.notEqual(first.code, second.code);
  assert.equal(first.path, '/r/' + first.code);
  const document = await fetch(base + first.path);
  assert.match(await document.text(), /Rift Brawl/);
  const cached = await fetch(base + first.path, { headers: { 'if-none-match': document.headers.get('etag') } });
  assert.equal(cached.status, 304);
  assert.equal(await cached.text(), '');
  assert.equal((await fetch(base + '/healthz')).status, 200);
  const a = peer(first.code, 'Alpha');
  const welcomeA = await a.until(m => m.type === 'welcome');
  assert.equal(welcomeA.arena.width, 1200);
  const practice = await a.until(m => m.type === 'state' && m.round.mode === 'practice');
  assert.ok(practice.players.some(p => p.bot));
  const b = peer(first.code, 'Beta');
  const welcomeB = await b.until(m => m.type === 'welcome');
  const c = peer(second.code, 'Observer');
  const separate = await c.until(m => m.type === 'state');
  assert.ok(separate.players.every(p => p.id !== welcomeA.id && p.id !== welcomeB.id));
  const pvp = await a.until(m => m.type === 'state' && m.round.mode === 'pvp');
  assert.equal(pvp.players.length, 2);
  const shooter = pvp.players.find(p => p.id === welcomeA.id);
  const target = pvp.players.find(p => p.id === welcomeB.id);
  const angle = Math.atan2(target.y - shooter.y, target.x - shooter.x);
  a.send({ type: 'cast', spell: 'bolt', angle });
  await Promise.all([a, b].map(client => client.until(m => m.type === 'state' && m.players.some(p => p.id === welcomeB.id && p.hp === 72))));
  b.send({ type: 'input', dx: 0, dy: 1, angle: Math.PI / 2 });
  await a.until(m => m.type === 'state' && m.players.some(p => p.id === welcomeB.id && p.y > target.y + 8));
  b.send({ type: 'name', name: 'Iris' });
  await a.until(m => m.type === 'state' && m.players.some(p => p.name === 'Iris'));
  b.send({ type: 'ping', nonce: 456 });
  await b.until(m => m.type === 'pong' && m.nonce === 456);
  const left = once(b.ws, 'close');
  b.ws.close();
  await left;
  await a.until(m => m.type === 'state' && m.round.mode === 'practice' && m.time > pvp.time);
});

test('old links reopen, eight seats are independent, and a freed seat can be reused', async t => {
  const { peer } = await instance(t);
  const code = 'J2KW4H';
  const players = [];
  for (let i = 0; i < 8; i++) {
    const current = peer(code, 'Guest ' + i);
    await current.until(m => m.type === 'welcome');
    players.push(current);
  }
  const full = peer(code);
  await full.until(m => m.type === 'error' && m.code === 'room_full');
  await players[0].until(m => m.type === 'state' && m.players.length === 8 && m.players.every(p => !p.bot));
  const left = once(players[3].ws, 'close');
  players[3].ws.close();
  await left;
  const replacement = peer(code, 'Replacement');
  await replacement.until(m => m.type === 'welcome');
  const final = await replacement.until(m => m.type === 'state');
  assert.equal(final.players.length, 8);
  assert.equal(new Set(final.players.map(p => p.slot)).size, 8);
  const invalid = peer('bad');
  await invalid.until(m => m.type === 'error' && m.code === 'room_missing');
});
