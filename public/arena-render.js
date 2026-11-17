const colors = ['#8bd8ff', '#ff84a7', '#ffcf6b', '#8ba7ff', '#aaf08d', '#df99ff', '#62e3d5', '#ff9f78']
export const playerColor = (player, you) =>
  player.id === you ? '#d0ff79' : colors[Math.max(0, player.slot ?? 0) % colors.length]
const tau = 2 * Math.PI
const constrain = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

function polygon(ctx, points, fill, stroke, width = 1) {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (const p of points.slice(1)) ctx.lineTo(p[0], p[1])
  ctx.closePath()
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = width
    ctx.stroke()
  }
}

function ellipse(ctx, x, y, w, h, fill, stroke, width = 1) {
  ctx.beginPath()
  ctx.ellipse(x, y, w, h, 0, 0, tau)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = width
    ctx.stroke()
  }
}

function line(ctx, points, color, width) {
  ctx.beginPath()
  ctx.moveTo(...points[0])
  for (const p of points.slice(1)) ctx.lineTo(...p)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function wall(ctx, r) {
  const { x, y, w, h } = r
  const rng = random(Math.round(x + y * 69))
  const corners = [
    [7, 0],
    [w - 9, 0],
    [w, 7],
    [w, h - 9],
    [w - 6, h],
    [8, h],
    [0, h - 7],
    [0, 7],
  ]
  const moved = (pts, dx, dy) => pts.map(([sx, sy]) => [sx + dx, sy + dy])
  ctx.save()
  ctx.translate(x, y)
  ctx.lineJoin = 'round'
  polygon(ctx, moved(corners, 6, 9), '#10153599')
  polygon(ctx, corners, '#2e4161', '#192b49', 3)
  const height = 10
  const roof = moved(corners, 0, -height)
  const cap = ctx.createLinearGradient(0, -height, w, h)
  cap.addColorStop(0, '#8293aa')
  cap.addColorStop(0.42, '#5c7692')
  cap.addColorStop(1, '#465c81')
  polygon(ctx, roof, cap, '#313c62', 3)
  line(
    ctx,
    [
      [4, -4],
      [8, -10],
      [w - 10, -10],
      [w - 4, -6],
    ],
    '#97abc1',
    2.4,
  )
  line(
    ctx,
    [
      [2, h - 18],
      [9, h - 11],
      [w - 7, h - 11],
      [w - 2, h - 17],
    ],
    '#7289a6',
    2,
  )
  const horiz = w > h
  const d = horiz ? w : h
  const breadth = horiz ? h : w
  const axes = (t, a) => (horiz ? [t, a - height] : [a, t - height])
  for (let t = 24 + rng() * 8; t < d - 8; t += 26 + rng() * 14) {
    const shift = rng() * 9 - 4
    const joint = [
      axes(t, 2),
      axes(t + shift, breadth * 0.34),
      axes(t - 3, breadth * 0.49),
      axes(t + 2, breadth - 1),
    ]
    line(ctx, joint, '#304762', 2.6)
    line(
      ctx,
      joint.map(([jx, jy]) => [jx + 1.5, jy]),
      '#8499af',
      0.9,
    )
    if (horiz)
      line(
        ctx,
        [
          [t + 2, h - height],
          [t + 2, h],
        ],
        '#1e3151',
        2,
      )
  }
  for (let i = 0; i < 4; i++) {
    const sx = 7 + rng() * (w - 20),
      sy = 9 + rng() * (h - 15) - height
    const fracture = [
      [sx, sy],
      [sx + 4, sy - 2],
      [sx + 7, sy + 1],
      [sx + 12, sy - 3],
    ]
    line(ctx, fracture, '#3d546c', 1.3)
  }
  for (let i = 0; i < 16; i++) {
    const sx = 6 + rng() * (w - 12),
      sy = 3 + rng() * (h - 8) - height
    line(
      ctx,
      [
        [sx, sy],
        [sx + 2 + rng() * 4, sy - 0.5],
      ],
      i % 2 ? '#839caf' : '#445e7a',
      1.2,
    )
  }
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? rng() * w : i % 2 ? w - 6 : 6
    const sy = i < 2 ? 1 - height + rng() * 2 : rng() * h - height
    ellipse(ctx, sx, sy, 8 + rng() * 6, 4.5, '#33757a')
    for (let j = 0; j < 5; j++) {
      const bx = sx + rng() * 15 - 7,
        by = sy + rng() * 3
      polygon(
        ctx,
        [
          [bx - 2, by],
          [bx - 2 - rng() * 3, by - 4 - rng() * 6],
          [bx + 2, by],
        ],
        j % 2 ? '#60a697' : '#3c8b85',
      )
    }
  }
  const bx = horiz ? w * 0.72 : w * 0.46,
    by = horiz ? h * 0.39 : h * 0.26
  for (const [ox, oy, size] of [
    [-7, 1, 10],
    [2, 2, 19],
    [9, 4, 9],
  ]) {
    const px = bx + ox,
      py = by + oy - height
    polygon(
      ctx,
      [
        [px - 3, py],
        [px - 3, py - size * 0.6],
        [px + 1, py - size],
        [px + 4, py - size * 0.35],
        [px + 3, py + 1],
      ],
      '#bb72eb',
      '#60416e',
    )
    polygon(
      ctx,
      [
        [px + 1, py - size],
        [px + 4, py - size * 0.35],
        [px + 3, py + 1],
        [px, py - 1],
      ],
      '#8b50ac',
    )
    line(
      ctx,
      [
        [px - 2, py - size * 0.56],
        [px + 1, py - size],
      ],
      '#efdfff',
      1.3,
    )
  }
  ctx.restore()
}

function ground(ctx, w, h) {
  const rng = random(7701)
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.44, 30, w * 0.5, h * 0.45, w * 0.6)
  grad.addColorStop(0, '#799781')
  grad.addColorStop(0.55, '#637f77')
  grad.addColorStop(1, '#394f60')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 11000; i++) {
    const x = rng() * w,
      y = rng() * h
    ctx.globalAlpha = 0.05 + rng() * 0.13
    ellipse(ctx, x, y, 1 + rng() * 5, 1 + rng() * 3, i % 2 ? '#e6eaa3' : '#183a47')
  }
  ctx.globalAlpha = 1
  for (const [radius, thick, color] of [
    [112, 15, '#4b6769'],
    [109, 6, '#899d88'],
    [59, 3, '#9aab90'],
  ]) {
    ellipse(ctx, w / 2, h / 2, radius, radius * 0.8, null, color, thick)
  }
  for (let i = 0; i < 16; i++) {
    const angle = (i * tau) / 16
    line(
      ctx,
      [
        [w / 2 + Math.cos(angle) * 103, h / 2 + Math.sin(angle) * 82],
        [w / 2 + Math.cos(angle) * 117, h / 2 + Math.sin(angle) * 94],
      ],
      '#435d61',
      3,
    )
  }
}

function spriteFallback(ctx, color) {
  polygon(
    ctx,
    [
      [-16, 4],
      [-12, 15],
      [0, 21],
      [13, 14],
      [17, 5],
      [12, -9],
      [-11, -9],
    ],
    '#35314c',
    '#242337',
    2,
  )
  polygon(
    ctx,
    [
      [-12, 3],
      [-11, -6],
      [10, -6],
      [14, 3],
      [9, 14],
      [0, 18],
      [-7, 14],
    ],
    color,
  )
  ellipse(ctx, 0, -4, 11, 12, '#c4a694', '#392f43', 2)
  polygon(
    ctx,
    [
      [-14, 2],
      [-12, -10],
      [-1, -22],
      [6, -19],
      [14, -8],
      [15, 3],
      [9, -2],
      [-8, -3],
    ],
    '#575075',
    '#322e45',
    2,
  )
  line(
    ctx,
    [
      [-10, -6],
      [-1, -15],
      [6, -13],
    ],
    '#8c81a8',
    2,
  )
  line(
    ctx,
    [
      [12, 12],
      [19, 2],
      [19, -11],
    ],
    '#5e485c',
    3,
  )
  polygon(
    ctx,
    [
      [16, -12],
      [19, -17],
      [22, -12],
      [19, -7],
    ],
    '#a1ffe3',
    '#4d837e',
  )
}

function character(ctx, player, pos, you, mage, t, scale, worldWidth) {
  if (player.hp <= 0) return
  const { x, y } = pos
  const color = playerColor(player, you),
    self = player.id === you
  const bodySize = Math.max(74, 32 / scale)
  const labelFont = Math.max(14, 10.5 / scale)
  const bob = pos.moving ? Math.sin(t * 0.015) * 1.7 : Math.sin(t * 0.002 + player.slot) * 0.65
  ctx.save()
  ctx.translate(x, y)
  ellipse(ctx, 3, 7, 22, 12, '#10233278')
  ellipse(ctx, 0, 3, 24, 20, '#20354239', '#172537b0', 3.7)
  ellipse(ctx, 0, 3, 24, 20, null, color, self ? 2.9 : 2.2)
  ctx.save()
  ctx.rotate(pos.angle)
  polygon(
    ctx,
    [
      [33, 0],
      [25, -4],
      [26, 0],
      [25, 4],
    ],
    color,
    '#263346',
    1.4,
  )
  ctx.restore()
  ctx.save()
  ctx.translate(0, bob - bodySize * 0.14)
  if (Math.cos(pos.angle) < 0) ctx.scale(-1, 1)
  if (mage) ctx.drawImage(mage, -bodySize / 2, -bodySize / 2, bodySize, bodySize)
  else spriteFallback(ctx, color)
  ctx.restore()
  const barWidth = Math.max(43, 26 / scale)
  const barHeight = Math.max(4, 2.7 / scale)
  const border = Math.max(1.8, 1.2 / scale)
  const above = bodySize * 0.65 + barHeight + border
  const below = bodySize * 0.4 + labelFont + 2 * border
  const by = y < above + labelFont + 3 * border ? below : -above
  const labelY = by - 2 * border
  ctx.font = '800 ' + labelFont + 'px system-ui,sans-serif'
  const margin = Math.max(barWidth/2, ctx.measureText(player.name).width/2) + 2 * border
  const labelX = constrain(x, margin, worldWidth - margin) - x
  const barX = labelX - barWidth / 2
  ctx.fillStyle = '#182332'
  ctx.beginPath()
  ctx.roundRect(barX - border, by - border, barWidth + 2 * border, barHeight + 2 * border, border * 1.4)
  ctx.fill()
  ctx.fillStyle = color
  ctx.fillRect(barX, by, barWidth * constrain(player.hp / player.maxHp, 0, 1), barHeight)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#182534'
  ctx.lineWidth = Math.max(4, 2.8 / scale)
  ctx.strokeText(player.name, labelX, labelY)
  ctx.fillStyle = self ? '#eeffcf' : '#fff2f7'
  ctx.fillText(player.name, labelX, labelY)
  ctx.restore()
}

function projectile(ctx, bullet, color, age) {
  ctx.save()
  ctx.translate(bullet.x, bullet.y)
  ctx.rotate(bullet.angle)
  const tail = 23 + Math.sin(age * 0.025 + bullet.x) * 3
  const g = ctx.createLinearGradient(-tail, 0, 7, 0)
  g.addColorStop(0, color + '00')
  g.addColorStop(0.55, color + 'ac')
  g.addColorStop(1, color)
  polygon(
    ctx,
    [
      [-tail, 0],
      [-5, -5],
      [5, -5],
      [8, 0],
      [4, 5],
      [-5, 5],
    ],
    g,
  )
  ellipse(ctx, 0, 0, 6.8, 5.2, '#f8fff0')
  ctx.restore()
}

function effect(ctx, fx, age, color) {
  const life = { nova: 590, blink: 420, hit: 230, ko: 630, spawn: 520 }[fx.kind] || 380
  const t = constrain(age / life, 0, 1)
  if (t >= 1 || age < -70) return
  const seed = String(fx.id)
    .split('')
    .reduce((n, c) => n * 31 + c.charCodeAt(0), 3)
  const rng = random(seed)
  ctx.save()
  ctx.translate(fx.x, fx.y)
  ctx.globalAlpha = 1 - t
  if (fx.kind === 'nova') {
    const r = 8 + 151 * (1 - (1 - t) ** 2.6)
    const g = ctx.createRadialGradient(0, 0, r * 0.56, 0, 0, r)
    g.addColorStop(0, '#fba6ff00')
    g.addColorStop(0.89, '#d184fd43')
    g.addColorStop(1, '#ed9cffaf')
    ellipse(ctx, 0, 0, r, r, g, '#f8c9ff', 3.5)
    ellipse(ctx, 0, 0, Math.max(2, r - 9), Math.max(2, r - 9), null, '#a981ff', 2)
  } else if (fx.kind === 'blink' || fx.kind === 'spawn') {
    const r = 9 + t * 29
    ellipse(ctx, 0, 0, r, r * 0.76, null, fx.kind === 'blink' ? '#a0edff' : color, 3 * (1 - t) + 0.5)
  }
  const count = fx.kind === 'hit' ? 6 : fx.kind === 'nova' ? 23 : 14
  const spread = fx.kind === 'nova' ? 163 : fx.kind === 'ko' ? 56 : 32
  for (let i = 0; i < count; i++) {
    const a = rng() * tau,
      d = (0.43 + rng() * 0.65) * spread * (0.13 + t),
      l = 4 + rng() * 7
    const vx = Math.cos(a),
      vy = Math.sin(a)
    line(
      ctx,
      [
        [vx * d, vy * d],
        [vx * (d + l), vy * (d + l)],
      ],
      i % 3 ? color : '#ffffff',
      1.7 + rng() * 1.7,
    )
  }
  ctx.restore()
}

function pointer(ctx, p, stick, aimPad) {
  if (p && matchMedia('(pointer:fine)').matches) {
    ctx.save()
    ctx.translate(p.x, p.y)
    ellipse(ctx, 0, 0, 8, 8, null, '#182433c4', 2.7)
    ellipse(ctx, 0, 0, 8, 8, null, '#f2ffdc', 1.4)
    for (let i = 0; i < 4; i++) {
      line(
        ctx,
        [
          [10, 0],
          [14, 0],
        ],
        '#efffdc',
        1.9,
      )
      ctx.rotate(Math.PI / 2)
    }
    ellipse(ctx, 0, 0, 1.35, 1.35, '#efffdc')
    ctx.restore()
  }
  for (const pad of [stick, aimPad]) {
    if (!pad) continue
    const r = pad.radius || 48
    const accent = pad === stick ? '#d0ff79' : '#f4b1ff'
    ellipse(ctx, pad.x, pad.y, r, r, '#1725387a', accent + 'bb', 2.5)
    ellipse(
      ctx,
      pad.x + pad.dx * r * 0.75,
      pad.y + pad.dy * r * 0.75,
      r * 0.34,
      r * 0.34,
      accent + 'aa',
      '#efffdc',
      2,
    )
  }
}

function loadArtwork(url, ready) {
  const img = new Image()
  img.addEventListener('load', () => ready(img), { once: true })
  img.src = url
}

function spriteSet(img) {
  const source = document.createElement('canvas')
  source.width = img.naturalWidth
  source.height = img.naturalHeight
  const ctx = source.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, source.width, source.height).data
  let left = source.width,
    top = source.height,
    right = 0,
    bottom = 0
  for (let y = 0; y < source.height; y += 2) {
    for (let x = 0; x < source.width; x += 2) {
      if (data[(y * source.width + x) * 4 + 3] < 35) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x + 2)
      bottom = Math.max(bottom, y + 2)
    }
  }
  if (right <= left || bottom <= top) return []
  const w = right - left,
    h = bottom - top,
    scale = 92 / Math.max(w, h)
  return [0, 288, 65, 131, 324, 192, 14, 258, 103].map((hue) => {
    const tile = document.createElement('canvas')
    tile.width = tile.height = 96
    const c = tile.getContext('2d')
    if (hue) c.filter = 'hue-rotate(' + hue + 'deg)'
    c.drawImage(source, left, top, w, h, (96 - w * scale) / 2, (96 - h * scale) / 2, w * scale, h * scale)
    return tile
  })
}

function allowed(x, y, arena) {
  const r = 19
  if (x < r || y < r || x > arena.width - r || y > arena.height - r) return false
  return !arena.obstacles.some(
    (b) => Math.hypot(x - constrain(x, b.x, b.x + b.w), y - constrain(y, b.y, b.y + b.h)) < r,
  )
}

export function arenaRenderer(canvas, hooks) {
  const ctx = canvas.getContext('2d', { alpha: false })
  canvas.style.touchAction = 'none'
  canvas.style.cursor = 'none'
  let arena = { width: 1200, height: 750, obstacles: [] }
  let env = null,
    tiles = [],
    layer = null
  let me = '',
    current = null,
    received = 0
  let prev = null,
    prevReceived = 0
  let local = null
  let renderTime = 0
  let layout = { scale: 1, x: 0, y: 0, dpr: 1 }
  const fxPool = new Map()
  const fine = matchMedia('(pointer:fine)')

  function rebuild() {
    layer = document.createElement('canvas')
    layer.width = arena.width
    layer.height = arena.height
    const c = layer.getContext('2d')
    if (env) c.drawImage(env, 0, 0, layer.width, layer.height)
    else ground(c, layer.width, layer.height)
    for (const obstacle of arena.obstacles) wall(c, obstacle)
  }

  function measure() {
    const box = canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(box.width * dpr))
    canvas.height = Math.max(1, Math.round(box.height * dpr))
    const scale = Math.min(box.width / arena.width, box.height / arena.height) || 1
    layout = {
      dpr,
      scale,
      x: (box.width - arena.width * scale) / 2,
      y: (box.height - arena.height * scale) / 2,
    }
  }
  loadArtwork('/assets/arena.webp', (img) => {
    env = img
    rebuild()
  })
  loadArtwork('/assets/mage.webp', (img) => {
    tiles = spriteSet(img)
  })
  rebuild()
  measure()
  new ResizeObserver(measure).observe(canvas)

  function position(player, dt, now) {
    const old = prev?.players.find((p) => p.id === player.id)
    const gap = old ? Math.hypot(player.x - old.x, player.y - old.y) : Infinity
    if (player.id !== me) {
      const t =
        old && gap < 90 && old.hp > 0
          ? constrain((now - received) / Math.max(20, received - prevReceived), 0, 1)
          : 1
      return {
        x: old && t < 1 ? old.x + (player.x - old.x) * t : player.x,
        y: old && t < 1 ? old.y + (player.y - old.y) * t : player.y,
        angle: player.angle,
        moving: gap > 0.7 && gap < 80,
      }
    }
    const input = hooks.input()
    if (!local || gap >= 90 || local.hp <= 0 || player.hp <= 0 || current.round.phase !== 'playing')
      local = { x: player.x, y: player.y, hp: player.hp }
    if (player.hp > 0 && current.round.phase === 'playing') {
      const active = Math.hypot(input.dx, input.dy) > 0.01
      const step = 236 * dt
      const predictedX = local.x + input.dx * step,
        predictedY = local.y + input.dy * step
      if (allowed(predictedX, local.y, arena)) local.x = predictedX
      if (allowed(local.x, predictedY, arena)) local.y = predictedY
      const lead = active ? constrain((now - received + hooks.ping() / 2 + 20) / 1000, 0, 0.16) * 236 : 0
      let anchorX = player.x + input.dx * lead,
        anchorY = player.y + input.dy * lead
      if (!allowed(anchorX, anchorY, arena)) {
        anchorX = player.x
        anchorY = player.y
      }
      const gain = 1 - Math.exp(-dt * (active ? 6 : 14))
      local.x += (anchorX - local.x) * gain
      local.y += (anchorY - local.y) * gain
    }
    local.hp = player.hp
    return { ...local, angle: input.angle, moving: Math.hypot(input.dx, input.dy) > 0.01 }
  }

  function frame(now) {
    const dt = Math.min((now - renderTime) / 1000, 0.055)
    renderTime = now
    const { dpr, scale, x, y } = layout
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#242b39'
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    ctx.drawImage(layer, 0, 0)
    if (current) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, arena.width, arena.height)
      ctx.clip()
      const epoch = current.time + now - received
      const colorsById = new Map(current.players.map((p) => [p.id, playerColor(p, me)]))
      for (const [id, fx] of fxPool) {
        const age = epoch - fx.at
        if (age > 750) {
          fxPool.delete(id)
          continue
        }
        effect(ctx, fx, age, colorsById.get(fx.owner) || '#d1f9ff')
      }
      const actors = current.players.map((p) => [p, position(p, dt, now)]).sort((a, b) => a[1].y - b[1].y)
      for (const [p, pos] of actors)
        character(ctx, p, pos, me, tiles[p.id === me ? 0 : ((p.slot ?? 0) % 8) + 1], now, scale, arena.width)
      for (const b of current.projectiles) {
        const next = constrain(now - received, 0, 45) * 0.64
        projectile(
          ctx,
          { ...b, x: b.x + Math.cos(b.angle) * next, y: b.y + Math.sin(b.angle) * next },
          colorsById.get(b.owner) || '#d9faff',
          now,
        )
      }
      const controls = hooks.visuals()
      pointer(ctx, fine.matches ? controls.aimPoint : null, controls.stick, controls.aimPad)
      ctx.restore()
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  return {
    configure(config, id) {
      arena = config
      me = id
      local = prev = current = null
      fxPool.clear()
      rebuild()
      measure()
    },
    update(state) {
      prev = current
      prevReceived = received
      current = state
      received = performance.now()
      for (const fx of state.effects) {
        if (!fxPool.has(fx.id) && state.time - fx.at < 650) {
          fxPool.set(fx.id, fx)
          if (fx.owner === me && ['hit', 'ko', 'spawn'].includes(fx.kind)) hooks.sound(fx.kind)
        }
      }
    },
    point(cx, cy) {
      const b = canvas.getBoundingClientRect()
      return { x: (cx - b.left - layout.x) / layout.scale, y: (cy - b.top - layout.y) / layout.scale }
    },
    worldWidth: () => arena.width,
    localPosition: () => local || current?.players.find((p) => p.id === me),
  }
}
