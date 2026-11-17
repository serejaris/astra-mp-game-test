import { randomUUID } from 'node:crypto';
import { arena, spells, spawnPoints } from '../shared/arena.mjs';
import { blocked, canSee, coverRoute, PLAYER_RADIUS } from './navigation.mjs';

export const ROUND_DURATION = 180_000;
export const RESULTS_DURATION = 6_000;
export const RESPAWN_DURATION = 2_500;
export const PLAYER_SPEED = 236;
const BOLT_RADIUS = 7;
const EFFECT_DURATION = 700;
const BOT_ID = 'training-golem';

export function playerName(name, slot) {
  const clean = typeof name === 'string' ? name.replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim() : '';
  return Array.from(clean).slice(0, 20).join('') || ['Астра', 'Эмбер', 'Никс', 'Флинт', 'Сол', 'Векс', 'Ирис', 'Руна'][slot];
}

function clearMotion() {
  return { dx: 0, dy: 0 };
}

function makePlayer(slot, name, bot = false) {
  return {
    id: bot ? BOT_ID : randomUUID(),
    name: bot ? 'Голем' : playerName(name, slot),
    slot, bot, ...spawnPoints[slot], angle: slot % 2 ? Math.PI : 0,
    maxHp: 100, hp: 100, kills: 0, deaths: 0, respawnAt: 0,
    cooldowns: { bolt: 0, nova: 0, blink: 0 },
    input: clearMotion(), nextBotCast: 0
  };
}

function move(player, dx, dy) {
  if (!blocked(player.x + dx, player.y, PLAYER_RADIUS)) player.x += dx;
  if (!blocked(player.x, player.y + dy, PLAYER_RADIUS)) player.y += dy;
}

export class Game {
  constructor(code, now = Date.now()) {
    this.code = code;
    this.players = new Map();
    this.projectiles = [];
    this.effects = [];
    this.round = { number: 1, mode: 'practice', phase: 'playing', endsAt: now + ROUND_DURATION, winnerId: null, winnerName: null };
    this.lastActive = now;
    this.sequence = 0;
    this.trainingPath = null;
  }

  get humans() {
    return [...this.players.values()].filter(p => !p.bot);
  }

  join(name, now = Date.now()) {
    const humans = this.humans;
    if (humans.length >= spawnPoints.length) return null;
    this.deletePlayer(BOT_ID);
    const occupied = new Set(humans.map(p => p.slot));
    const slot = spawnPoints.findIndex((_, i) => !occupied.has(i));
    const player = makePlayer(slot, name);
    this.players.set(player.id, player);
    if (humans.length === 0) this.addBot();
    if (humans.length === 0 || (humans.length === 1 && this.round.mode === 'practice')) this.resetRound(now, true);
    else this.respawn(player, now, true);
    this.lastActive = now;
    return player;
  }

  leave(id, now = Date.now()) {
    this.deletePlayer(id);
    this.lastActive = now;
    const remaining = this.humans.length;
    if (remaining === 0) this.deletePlayer(BOT_ID);
    if (remaining === 1 && this.round.phase !== 'results') {
      this.addBot();
      this.resetRound(now, true);
    }
  }

  deletePlayer(id) {
    this.players.delete(id);
    this.projectiles = this.projectiles.filter(projectile => projectile.owner !== id);
  }

  addBot() {
    const slot = this.humans[0].slot === 1 ? 0 : 1;
    this.players.set(BOT_ID, makePlayer(slot, 'Голем', true));
  }

  emit(kind, player, now, owner = player.id) {
    this.effects.push({ id: ++this.sequence, kind, x: player.x, y: player.y, owner, at: now });
  }

  resetRound(now, first = false) {
    this.round = {
      number: first ? 1 : this.round.number + 1,
      mode: this.humans.length < 2 ? 'practice' : 'pvp',
      phase: 'playing', endsAt: now + ROUND_DURATION, winnerId: null, winnerName: null
    };
    this.projectiles = [];
    this.effects = [];
    this.trainingPath = null;
    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      this.respawn(p, now, false);
    }
  }

  respawn(player, now, spread) {
    let spawn = spawnPoints[player.slot];
    if (spread) {
      const enemies = [...this.players.values()].filter(p => p.id !== player.id && p.hp > 0);
      const clearance = point => Math.min(...enemies.map(p => Math.hypot(p.x - point.x, p.y - point.y)));
      if (clearance(spawn) < 145) spawn = spawnPoints.reduce((best, candidate) => clearance(best) >= clearance(candidate) ? best : candidate);
    }
    Object.assign(player, spawn, { hp: 100, respawnAt: 0, input: clearMotion(), nextBotCast: now + 1400 });
    player.angle = Math.atan2(arena.height / 2 - player.y, arena.width / 2 - player.x);
    player.cooldowns = { bolt: 0, nova: 0, blink: 0 };
    this.emit('spawn', player, now);
  }

  input(player, message) {
    if (![message.dx, message.dy, message.angle].every(Number.isFinite)) return;
    const dx = Math.min(1, Math.max(-1, message.dx));
    const dy = Math.min(1, Math.max(-1, message.dy));
    const magnitude = Math.max(1, Math.hypot(dx, dy));
    player.input = { dx: dx / magnitude, dy: dy / magnitude };
    player.angle = Math.atan2(Math.sin(message.angle), Math.cos(message.angle));
  }

  cast(player, spell, angle, now = Date.now()) {
    if (!Object.hasOwn(spells, spell) || !Number.isFinite(angle) || !player.hp || this.round.phase !== 'playing' || now >= this.round.endsAt) return;
    if (player.cooldowns[spell] > now) return;
    player.angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    player.cooldowns[spell] = now + spells[spell].cooldown;
    if (spell === 'nova') {
      this.emit('nova', player, now);
      for (const target of this.players.values()) {
        if (target.id !== player.id && target.hp && Math.hypot(player.x - target.x, player.y - target.y) <= spells.nova.radius + PLAYER_RADIUS && canSee(player, target)) {
          this.damage(player, target, spells.nova.damage, now);
        }
      }
    } else if (spell === 'blink') {
      this.emit('blink', player, now);
      const steps = Math.ceil(spells.blink.range / 5);
      const dx = Math.cos(angle) * spells.blink.range / steps;
      const dy = Math.sin(angle) * spells.blink.range / steps;
      for (let i = 0; i < steps; i++) {
        if (blocked(player.x + dx, player.y + dy, PLAYER_RADIUS)) break;
        player.x += dx;
        player.y += dy;
      }
      this.emit('blink', player, now);
    } else {
      this.projectiles.push({ id: ++this.sequence, owner: player.id, spell: 'bolt', x: player.x, y: player.y, angle: player.angle, remaining: spells.bolt.range });
    }
  }

  damage(source, target, amount, now) {
    target.hp = Math.max(0, target.hp - amount);
    this.emit('hit', target, now, source.id);
    if (target.hp === 0) {
      target.deaths++;
      source.kills++;
      target.input = clearMotion();
      target.respawnAt = now + RESPAWN_DURATION;
      this.emit('ko', target, now, source.id);
    }
  }

  advanceBolt(bolt, seconds, now) {
    const source = this.players.get(bolt.owner);
    if (!source) return false;
    const distance = Math.min(bolt.remaining, spells.bolt.speed * seconds);
    const steps = Math.max(1, Math.ceil(distance / BOLT_RADIUS));
    for (let i = 0; i < steps; i++) {
      bolt.x += Math.cos(bolt.angle) * distance / steps;
      bolt.y += Math.sin(bolt.angle) * distance / steps;
      if (blocked(bolt.x, bolt.y, BOLT_RADIUS)) return false;
      for (const target of this.players.values()) {
        if (target.id !== source.id && target.hp && Math.hypot(target.x - bolt.x, target.y - bolt.y) <= PLAYER_RADIUS + BOLT_RADIUS) {
          this.damage(source, target, spells.bolt.damage, now);
          return false;
        }
      }
    }
    bolt.remaining -= distance;
    return bolt.remaining > 0;
  }

  train(bot, now) {
    const target = this.humans[0];
    if (!target?.hp) {
      bot.input = clearMotion();
      return;
    }
    const distance = Math.hypot(target.x - bot.x, target.y - bot.y);
    const aim = Math.atan2(target.y - bot.y, target.x - bot.x);
    if (!canSee(bot, target, BOLT_RADIUS)) {
      const path = this.trainingPath;
      if (!path || now >= path.refreshAt || Math.hypot(path.targetX - target.x, path.targetY - target.y) > 55) {
        this.trainingPath = { points: coverRoute(bot, target), targetX: target.x, targetY: target.y, refreshAt: now + 1200 };
      }
      const points = this.trainingPath.points;
      while (points.length && Math.hypot(points[0].x - bot.x, points[0].y - bot.y) < 8) points.shift();
      const destination = points[0] || target;
      const heading = Math.atan2(destination.y - bot.y, destination.x - bot.x);
      bot.angle = heading;
      bot.input = { dx: Math.cos(heading) * 0.7, dy: Math.sin(heading) * 0.7 };
      return;
    }
    this.trainingPath = null;
    const direction = Math.floor(now / 1700) % 2 ? 1 : -1;
    const side = distance > 360 ? 0.35 : distance < 150 ? 2.6 : 1.4;
    bot.angle = aim;
    bot.input = { dx: Math.cos(aim + direction * side) * 0.55, dy: Math.sin(aim + direction * side) * 0.55 };
    if (now >= bot.nextBotCast) {
      this.cast(bot, distance < 95 && bot.cooldowns.nova <= now ? 'nova' : 'bolt', aim + Math.sin(now / 607) * 0.1, now);
      bot.nextBotCast = now + 1300;
    }
  }

  tick(seconds, now = Date.now()) {
    this.effects = this.effects.filter(effect => now - effect.at < EFFECT_DURATION);
    if (!this.players.size) return;
    if (now >= this.round.endsAt) {
      if (this.round.phase === 'results') {
        if (this.players.size === 1 && this.humans.length === 1) this.addBot();
        this.resetRound(now);
      }
      else {
        const ranked = [...this.players.values()].sort((a, b) => b.kills - a.kills);
        this.round.phase = 'results';
        this.round.endsAt = now + RESULTS_DURATION;
        const winner = ranked[0].kills > ranked[1]?.kills ? ranked[0] : null;
        this.round.winnerId = winner?.id ?? null;
        this.round.winnerName = winner?.name ?? null;
        this.projectiles = [];
      }
      return;
    }
    if (this.round.phase !== 'playing') return;
    const dt = Math.min(0.06, Math.max(0, seconds));
    for (const p of this.players.values()) {
      if (p.respawnAt && now >= p.respawnAt) this.respawn(p, now, true);
      if (!p.hp) continue;
      if (p.bot) this.train(p, now);
      move(p, p.input.dx * PLAYER_SPEED * dt, p.input.dy * PLAYER_SPEED * dt);
    }
    this.projectiles = this.projectiles.filter(bolt => this.advanceBolt(bolt, dt, now));
  }

  snapshot(now = Date.now()) {
    return {
      type: 'state', time: now, round: this.round,
      players: [...this.players.values()].map(({ input, nextBotCast, ...publicPlayer }) => publicPlayer),
      projectiles: this.projectiles.map(({ remaining, ...bolt }) => bolt),
      effects: this.effects
    };
  }
}
