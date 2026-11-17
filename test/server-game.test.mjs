import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, RESPAWN_DURATION, RESULTS_DURATION } from '../server/game.mjs';

function duel() {
  const game = new Game('J2KW4H', 100);
  const a = game.join('Ember', 100);
  const b = game.join('Iris', 100);
  return { game, a, b };
}

test('practice switches to a fresh PvP match and back when the opponent leaves', () => {
  const game = new Game('J2KW4H', 100);
  const a = game.join('Mage', 100);
  assert.equal(game.snapshot().players.filter(p => p.bot).length, 1);
  a.kills = 9;
  const b = game.join('Guest', 125);
  assert.equal(game.round.mode, 'pvp');
  assert.equal(game.players.size, 2);
  assert.equal(a.kills, 0);
  game.leave(b.id, 150);
  assert.equal(game.round.mode, 'practice');
  assert.equal(game.snapshot().players.filter(p => p.bot).length, 1);
  game.leave(a.id, 200);
  assert.equal(game.players.size, 0);
});

test('movement and blink stop at cover, bolts and nova cannot cross a wall', () => {
  const { game, a, b } = duel();
  Object.assign(a, { x: 455, y: 350 });
  Object.assign(b, { x: 555, y: 350 });
  game.cast(a, 'nova', 0, 101);
  assert.equal(b.hp, 100);
  game.cast(a, 'bolt', 0, 102);
  game.cast(a, 'blink', 0, 103);
  assert.ok(a.x < 465);
  game.input(a, { dx: 1, dy: 0, angle: 0 });
  for (let frame = 1; frame <= 30; frame++) game.tick(0.025, 105 + frame * 25);
  assert.ok(a.x <= 465 && a.x >= 455);
  assert.equal(game.projectiles.length, 0);
  assert.equal(b.hp, 100);
});

test('spells obey cooldowns, award one knockout, then respawn and reset the round', () => {
  const { game, a, b } = duel();
  Object.assign(a, { x: 420, y: 255 });
  Object.assign(b, { x: 505, y: 255 });
  game.cast(a, 'nova', 0, 105);
  game.cast(a, 'nova', 0, 110);
  assert.equal(b.hp, 56);
  for (const start of [200, 700]) {
    game.cast(a, 'bolt', 0, start);
    game.cast(a, 'bolt', 0, start);
    assert.equal(game.projectiles.length, 1);
    for (let frame = 1; frame <= 8; frame++) game.tick(0.025, start + frame * 25);
  }
  assert.equal(b.hp, 0);
  assert.equal(b.deaths, 1);
  assert.equal(a.kills, 1);
  assert.ok(b.respawnAt >= 700 + RESPAWN_DURATION);
  game.cast(b, 'bolt', Math.PI, 1001);
  assert.equal(game.projectiles.length, 0);
  game.tick(0.025, b.respawnAt);
  assert.equal(b.hp, 100);
  assert.equal(b.respawnAt, 0);
  game.tick(0.025, game.round.endsAt);
  assert.equal(game.round.phase, 'results');
  assert.equal(game.round.winnerId, a.id);
  const next = game.round.endsAt;
  game.cast(a, 'nova', 0, next - RESULTS_DURATION + 1);
  game.tick(0.025, next);
  assert.equal(game.round.phase, 'playing');
  assert.equal(game.round.number, 2);
  assert.equal(a.kills, 0);
});

test('diagonal input is normalized and invalid spell names or nonnumeric inputs are ignored', () => {
  const { game, a } = duel();
  const initial = { x: a.x, y: a.y };
  game.input(a, { dx: 90, dy: 4, angle: 0 });
  game.input(a, { dx: Infinity, dy: 0, angle: NaN });
  game.cast(a, '__proto__', 0, 105);
  game.cast(a, 'toString', 0, 105);
  game.tick(0.025, 125);
  assert.ok(Math.abs(Math.hypot(a.x - initial.x, a.y - initial.y) - 236 * 0.025) < 1e-9);
  assert.equal(game.projectiles.length, 0);
});

test('practice golem walks around cover to reach a stationary player', () => {
  const game = new Game('J2KW4H', 0);
  const player = game.join('', 0);
  const golem = [...game.players.values()].find(p => p.bot);
  assert.equal(player.name, 'Астра');
  assert.equal(golem.name, 'Голем');
  Object.assign(golem, { x: 330, y: 150 });
  Object.assign(player, { x: 330, y: 250 });
  for (let frame = 1; frame < 480 && player.hp === 100; frame++) game.tick(0.025, frame * 25);
  assert.ok(player.hp < 100);
});

test('the result retains the winning name if the winner leaves before the next round', () => {
  const { game, a } = duel();
  a.kills = 1;
  const end = game.round.endsAt;
  game.tick(0.025, end);
  game.leave(a.id, end + 10);
  assert.equal(game.round.phase, 'results');
  assert.equal(game.round.winnerName, 'Ember');
  game.tick(0.025, end + RESULTS_DURATION);
  assert.equal(game.round.winnerName, null);
  assert.equal(game.round.mode, 'practice');
  assert.ok([...game.players.values()].some(p => p.bot));
});
