const motionKeys = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
])
const spellKeys = {
  Digit1: 'bolt',
  Space: 'bolt',
  KeyQ: 'nova',
  Digit2: 'nova',
  KeyE: 'blink',
  Digit3: 'blink',
}

export function bindControls(canvas, hooks) {
  const pressed = new Set()
  let movementPointer = null
  let castPointer = null
  let stick = null
  let aimPoint = null
  let aimPad = null
  let angle = 0
  let holding = false
  let boltTime = 0

  function vector() {
    const x =
      Number(pressed.has('KeyD') || pressed.has('ArrowRight')) -
      Number(pressed.has('KeyA') || pressed.has('ArrowLeft')) +
      (stick?.dx || 0)
    const y =
      Number(pressed.has('KeyS') || pressed.has('ArrowDown')) -
      Number(pressed.has('KeyW') || pressed.has('ArrowUp')) +
      (stick?.dy || 0)
    const length = Math.max(1, Math.hypot(x, y))
    return { dx: x / length, dy: y / length }
  }

  function steer() {
    const me = hooks.position()
    if (aimPad?.directed) angle = Math.atan2(aimPad.dy, aimPad.dx)
    else if (aimPoint && me) angle = Math.atan2(aimPoint.y - me.y, aimPoint.x - me.x)
    return { ...vector(), angle }
  }

  function cast(spell, targetWhenIdle = false) {
    const player = hooks.position()
    if (targetWhenIdle && player && !aimPoint) {
      const { dx, dy } = vector()
      if (spell === 'blink' && (dx || dy)) angle = Math.atan2(dy, dx)
      else {
        const target = hooks.target()
        if (target) angle = Math.atan2(target.y - player.y, target.x - player.x)
      }
    } else steer()
    hooks.unlock()
    if (hooks.cast(spell, angle) && spell === 'bolt') boltTime = performance.now()
  }

  function send() {
    hooks.input(steer())
  }

  function clear() {
    pressed.clear()
    movementPointer = null
    castPointer = null
    stick = null
    aimPad = null
    aimPoint = null
    holding = false
    send()
  }

  function editable(el) {
    return (
      el instanceof Element &&
      Boolean(el.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
    )
  }

  window.addEventListener('keydown', (event) => {
    if (
      document.querySelector('dialog[open]') ||
      editable(event.target) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.defaultPrevented
    )
      return
    if (!motionKeys.has(event.code) && !spellKeys[event.code]) return
    if (event.code === 'Space' && event.target instanceof Element && event.target.closest('button, a')) return
    event.preventDefault()
    hooks.unlock()
    if (motionKeys.has(event.code)) {
      pressed.add(event.code)
      if (!event.repeat) send()
    } else if (!event.repeat) cast(spellKeys[event.code], true)
  })
  window.addEventListener('keyup', (event) => {
    if (pressed.delete(event.code)) send()
  })
  canvas.addEventListener('contextmenu', (event) => event.preventDefault())
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    hooks.unlock()
    canvas.focus({ preventScroll: true })
    canvas.setPointerCapture(event.pointerId)
    const p = hooks.point(event.clientX, event.clientY)
    if (event.pointerType !== 'mouse' && p.x < hooks.worldWidth() * 0.46 && movementPointer === null) {
      movementPointer = event.pointerId
      stick = { x: p.x, y: p.y, dx: 0, dy: 0 }
    } else if (castPointer === null) {
      castPointer = event.pointerId
      aimPoint = p
      if (event.pointerType !== 'mouse') aimPad = { x: p.x, y: p.y, dx: 0, dy: 0, directed: false }
      holding = true
      cast('bolt')
    }
    send()
  })
  canvas.addEventListener('pointermove', (event) => {
    const p = hooks.point(event.clientX, event.clientY)
    const pad = movementPointer === event.pointerId ? stick : castPointer === event.pointerId ? aimPad : null
    if (pad) {
      const cssRadius = Math.min(48, canvas.clientWidth * 0.12)
      const radius = Math.max(1, hooks.point(cssRadius, 0).x - hooks.point(0, 0).x)
      const x = (p.x - pad.x) / radius
      const y = (p.y - pad.y) / radius
      const limit = Math.max(1, Math.hypot(x, y))
      Object.assign(pad, { radius, dx: x / limit, dy: y / limit })
      if (pad === aimPad && Math.hypot(x, y) > 0.15) pad.directed = true
    } else if (event.pointerType === 'mouse' || castPointer === event.pointerId) {
      aimPoint = p
      steer()
    }
  })
  function release(event) {
    if (event.pointerId === movementPointer) {
      movementPointer = null
      stick = null
    }
    if (event.pointerId === castPointer) {
      castPointer = null
      holding = false
      aimPad = null
      if (event.pointerType !== 'mouse') aimPoint = null
    }
    send()
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)
  canvas.addEventListener('lostpointercapture', release)
  canvas.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse' && castPointer === null) aimPoint = null
  })
  document.addEventListener('focusin', (event) => {
    if (event.target.closest?.('dialog[open]')) clear()
  })
  window.addEventListener('blur', clear)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clear()
  })
  return {
    cast,
    steer,
    visuals: () => ({ aimPoint, stick, aimPad }),
    tick() {
      send()
      if (holding && performance.now() - boltTime >= hooks.boltDelay()) cast('bolt')
    },
  }
}
