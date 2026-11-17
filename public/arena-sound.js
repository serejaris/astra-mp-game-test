function preference() {
  try {
    return localStorage.getItem('rift:sound') !== 'off'
  } catch {
    return true
  }
}

export function arenaSound() {
  let context
  let enabled = preference()
  function unlock() {
    if (!enabled) return
    try {
      context ||= new (window.AudioContext || window.webkitAudioContext)()
      if (context.state === 'suspended') context.resume().catch(() => {})
    } catch {}
  }

  const notes = {
    bolt: ['triangle', 470, 160, 0.14, 0.055],
    nova: ['sine', 220, 44, 0.46, 0.12],
    blink: ['sine', 230, 810, 0.25, 0.06],
    hit: ['triangle', 120, 54, 0.1, 0.05],
    ko: ['triangle', 330, 65, 0.34, 0.075],
    spawn: ['sine', 290, 620, 0.19, 0.055],
  }
  function play(type) {
    const note = notes[type]
    if (!note || !enabled || context?.state !== 'running') return
    const [wave, start, end, length, volume] = note
    const time = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = wave
    oscillator.frequency.setValueAtTime(start, time)
    oscillator.frequency.exponentialRampToValueAtTime(end, time + length)
    gain.gain.setValueAtTime(0.001, time)
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.016)
    gain.gain.exponentialRampToValueAtTime(0.001, time + length)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
    }
    oscillator.start(time)
    oscillator.stop(time + length + 0.01)
  }
  return {
    unlock,
    play,
    get enabled() {
      return enabled
    },
    toggle() {
      enabled = !enabled
      try {
        localStorage.setItem('rift:sound', enabled ? 'on' : 'off')
      } catch {}
      if (enabled) {
        unlock()
        play('spawn')
      }
      return enabled
    },
  }
}
