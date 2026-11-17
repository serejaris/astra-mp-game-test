import { arena } from '../shared/arena.mjs';

export const PLAYER_RADIUS = 19;
const cornerMargin = PLAYER_RADIUS + 8;

export function blocked(x, y, radius) {
  if (x < radius || y < radius || x > arena.width - radius || y > arena.height - radius) return true;
  return arena.obstacles.some(wall => {
    const closestX = Math.max(wall.x, Math.min(x, wall.x + wall.w));
    const closestY = Math.max(wall.y, Math.min(y, wall.y + wall.h));
    return (x - closestX) ** 2 + (y - closestY) ** 2 <= radius ** 2;
  });
}

export function canSee(a, b, radius = 1) {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  const steps = Math.ceil(distance / 7);
  for (let i = 1; i < steps; i++) {
    if (blocked(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps, radius)) return false;
  }
  return true;
}

const waypoints = arena.obstacles.flatMap(wall => {
  const xs = [wall.x - cornerMargin, wall.x + wall.w + cornerMargin];
  const ys = [wall.y - cornerMargin, wall.y + wall.h + cornerMargin];
  return xs.flatMap(x => ys.map(y => ({ x, y })));
}).filter(point => !blocked(point.x, point.y, PLAYER_RADIUS));

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const links = waypoints.map((point, index) => waypoints.flatMap((next, id) =>
  id !== index && canSee(point, next, PLAYER_RADIUS + 2) ? [{ id, length: distance(point, next) }] : []
));

export function coverRoute(start, goal) {
  const costs = waypoints.map(point => canSee(start, point, PLAYER_RADIUS + 1) ? distance(start, point) : Infinity);
  const remaining = waypoints.map(point => distance(point, goal));
  const parents = waypoints.map(() => -1);
  const visited = new Set();
  while (visited.size < waypoints.length) {
    let best = -1, estimate = Infinity;
    for (let i = 0; i < costs.length; i++) {
      if (!visited.has(i) && costs[i] + remaining[i] < estimate) {
        best = i;
        estimate = costs[i] + remaining[i];
      }
    }
    if (best < 0) break;
    if (canSee(waypoints[best], goal, PLAYER_RADIUS + 1)) {
      const route = [];
      for (let i = best; i >= 0; i = parents[i]) route.unshift(waypoints[i]);
      return route;
    }
    visited.add(best);
    for (const link of links[best]) {
      const cost = costs[best] + link.length;
      if (cost < costs[link.id]) {
        costs[link.id] = cost;
        parents[link.id] = best;
      }
    }
  }
  return [];
}
