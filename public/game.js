import { arenaRenderer, playerColor } from './arena-render.js'
import { bindControls } from './arena-controls.js'
import { arenaSound } from './arena-sound.js'

const canvas = document.getElementById('arena')
const sound = arenaSound()
const spellIds = ['bolt', 'nova', 'blink']
const defaultSpells = { bolt: { cooldown: 400 }, nova: { cooldown: 4200 }, blink: { cooldown: 3500 } }
const roomFromURL = /^\/r\/([a-z0-9]{6})\/?$/i.exec(location.pathname)?.[1]?.toUpperCase()
let room = roomFromURL || ''
let self = ''
let socket = null
let snapshot = null
let received = 0
let spells = defaultSpells
let pendingCasts = {}
let status = 'connecting'
let message = ''
let ping = 0
let attempt = 0
let retry = null
let stopped = false
let creating = false
let lastSent = ''
let lastInputAt = 0
let controls
let name = ''
try {
  name = localStorage.getItem('rift:name') || ''
} catch {}

const notice = (message, kind = 'info') =>
  window.dispatchEvent(new CustomEvent('game:notice', { detail: { message, kind } }))
function send(data) {
  if (socket?.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(data))
  return true
}
function serverNow() {
  return snapshot ? snapshot.time + performance.now() - received : Date.now()
}
function selfPlayer() {
  return snapshot?.players.find((p) => p.id === self)
}
function hud() {
  const player = selfPlayer()
  const clock = serverNow()
  const map = (snapshot?.players || []).map((p) => ({
    id: p.id,
    name: p.name,
    color: playerColor(p, self),
    score: p.kills,
    hp: p.hp,
    maxHp: p.maxHp,
    kills: p.kills,
    deaths: p.deaths,
    isBot: p.bot,
    alive: p.hp > 0,
    x: p.x,
    y: p.y,
    angle: p.angle,
    respawn: Math.max(0, (p.respawnAt - clock) / 1000),
    slot: p.slot,
  }))
  window.dispatchEvent(
    new CustomEvent('game:state', {
      detail: {
        status,
        message,
        room,
        you: self,
        players: map,
        ping,
        sound: sound.enabled,
        remaining: snapshot ? Math.max(0, Math.ceil((snapshot.round.endsAt - clock) / 1000)) : 180,
        phase: snapshot?.round.phase || 'playing',
        mode: snapshot?.round.mode || 'practice',
        winnerId: snapshot?.round.winnerId || null,
        winnerName: snapshot?.round.winnerName || null,
        roundNumber: snapshot?.round.number || 1,
        spells: spellIds.map((id) => ({
          id,
          remaining: Math.max(0, Math.max(player?.cooldowns[id] || 0, pendingCasts[id] || 0) - clock) / 1000,
          duration: spells[id].cooldown / 1000,
        })),
      },
    }),
  )
}
function changeStatus(value, reason = '') {
  status = value
  message = reason
  hud()
}
function input({ dx, dy, angle }) {
  if (status !== 'online') return
  const now = performance.now()
  const message = JSON.stringify({ type: 'input', dx, dy, angle: +angle.toFixed(3) })
  if (message === lastSent && now - lastInputAt < 560) return
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(message)
    lastSent = message
    lastInputAt = now
  }
}
function cast(id, angle) {
  const player = selfPlayer()
  const time = serverNow()
  if (!spellIds.includes(id) || status !== 'online' || !player?.hp || snapshot.round.phase !== 'playing')
    return false
  if (Math.max(player.cooldowns[id], pendingCasts[id] || 0) > time) return false
  if (!send({ type: 'cast', spell: id, angle })) return false
  pendingCasts[id] = time + spells[id].cooldown
  sound.play(id)
  hud()
  return true
}
function nearest() {
  const p = renderer.localPosition()
  if (!p || !snapshot) return null
  return snapshot.players
    .filter((g) => g.id !== self && g.hp > 0)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
}

const renderer = arenaRenderer(canvas, {
  ping: () => ping,
  input: () => controls?.steer() || { dx: 0, dy: 0, angle: 0 },
  visuals: () => controls?.visuals() || {},
  sound: (type) => sound.play(type),
})
controls = bindControls(canvas, {
  worldWidth: renderer.worldWidth,
  point: renderer.point,
  position: renderer.localPosition,
  target: nearest,
  boltDelay: () => spells.bolt.cooldown,
  unlock: sound.unlock,
  input,
  cast,
})

async function createRoom() {
  const response = await fetch('/api/room', { method: 'POST', cache: 'no-store' })
  if (!response.ok) throw new Error('Комната недоступна')
  return response.json()
}

async function start() {
  if (stopped) return
  changeStatus(attempt ? 'reconnecting' : 'connecting')
  if (!room) {
    try {
      const entry = await createRoom()
      room = entry.code
      history.replaceState({}, '', entry.path)
    } catch {
      scheduleRetry()
      return
    }
  }
  const url = new URL('/ws', location.origin)
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('room', room)
  if (name) url.searchParams.set('name', name)
  const peer = new WebSocket(url)
  socket = peer
  let refused = false
  peer.addEventListener('message', (event) => {
    if (socket !== peer) return
    const data = JSON.parse(event.data)
    if (data.type === 'welcome') {
      self = data.id
      spells = data.spells
      pendingCasts = {}
      snapshot = null
      renderer.configure(data.arena, self)
      attempt = 0
      ping = 0
      lastSent = ''
      changeStatus('online')
      send({ type: 'ping', nonce: Math.round(performance.now()) })
    }
    if (data.type === 'state') {
      const before = snapshot
      snapshot = data
      received = performance.now()
      if (before?.players.find((p) => p.id === self)?.hp === 0 && selfPlayer()?.hp > 0) pendingCasts = {}
      if (
        before &&
        (before.round.phase !== data.round.phase ||
          before.round.mode !== data.round.mode ||
          before.round.number !== data.round.number)
      )
        pendingCasts = {}
      renderer.update(data)
      if (
        !before ||
        before.players.length !== data.players.length ||
        before.round.mode !== data.round.mode ||
        before.round.phase !== data.round.phase
      )
        hud()
    }
    if (data.type === 'pong') {
      ping = Math.max(1, Math.round(performance.now() - data.nonce))
      hud()
    }
    if (data.type === 'error') {
      refused = ['room_full', 'room_missing'].includes(data.code)
      if (refused) {
        const reason =
          data.code === 'room_full'
            ? 'Комната заполнена. Создай новую для игры.'
            : 'Комната недоступна. Создай новую для игры.'
        changeStatus('error', reason)
        notice(reason, 'error')
      }
    }
  })
  peer.addEventListener('close', () => {
    if (socket !== peer || stopped || refused) return
    scheduleRetry()
  })
}
function scheduleRetry() {
  if (stopped || retry) return
  changeStatus('reconnecting', 'Восстанавливаем соединение с ареной…')
  const delay = Math.min(8000, 500 * 2 ** Math.min(attempt++, 4)) + Math.random() * 200
  retry = setTimeout(() => {
    retry = null
    start()
  }, delay)
}
async function copyRoom() {
  if (!room) return notice('Ссылка на комнату ещё загружается.')
  const link = new URL('/r/' + room, location.origin).href
  try {
    if (!navigator.clipboard?.writeText) throw new Error()
    await navigator.clipboard.writeText(link)
  } catch {
    const box = document.createElement('textarea')
    box.value = link
    box.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.append(box)
    box.select()
    let copied = false
    try {
      copied = document.execCommand('copy')
    } finally {
      box.remove()
    }
    if (!copied) {
      window.prompt('Скопируй ссылку на комнату', link)
      return
    }
  }
  notice('Ссылка на комнату скопирована.', 'success')
}
document.addEventListener('click', (event) => {
  const element = event.target.closest?.('[data-cast],[data-game-action]')
  if (!element) return
  if (element.dataset.cast) {
    controls.cast(element.dataset.cast, true)
    return
  }
  if (element.dataset.gameAction === 'sound') {
    sound.toggle()
    hud()
  }
  if (element.dataset.gameAction === 'copy') void copyRoom()
  if (element.dataset.gameAction === 'new-room' && !creating) {
    creating = true
    createRoom()
      .then((entry) => location.assign(entry.path))
      .catch(() => {
        creating = false
        notice('Не удалось создать комнату. Попробуй ещё раз.', 'error')
      })
  }
})
window.addEventListener('game:name', (event) => {
  const newName = event.detail?.name
  if (typeof newName !== 'string') return
  name = Array.from(newName.trim()).slice(0, 20).join('')
  try {
    localStorage.setItem('rift:name', name)
  } catch {}
  send({ type: 'name', name })
})
window.addEventListener('pagehide', () => {
  stopped = true
  clearTimeout(retry)
  retry = null
  socket?.close()
})
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    stopped = false
    void start()
  }
})
window.addEventListener('online', () => {
  if (status === 'reconnecting' && retry) {
    clearTimeout(retry)
    retry = null
    void start()
  }
})
setInterval(() => {
  if (!document.hidden) controls.tick()
}, 40)
setInterval(() => {
  if (!document.hidden) hud()
}, 130)
setInterval(() => {
  if (!document.hidden && status === 'online') send({ type: 'ping', nonce: Math.round(performance.now()) })
}, 5000)
void start()
