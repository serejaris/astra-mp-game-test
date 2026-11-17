const byId = id => document.getElementById(id)
const opponentHues = [288, 65, 131, 324, 192, 14, 258, 103]
const help = byId('help-dialog')
const profile = byId('profile-dialog')
const panel = byId('play-panel')
const overlay = byId('match-overlay')
const toast = byId('toast')
const spellButtons = new Map([...document.querySelectorAll('.spell[data-cast]')].map(button => [button.dataset.cast, button]))
let lastPlayers = ''
let toastTimeout

function label(id, text) {
  const node = byId(id)
  if (node.textContent !== text) node.textContent = text
}

function showToast(message) {
  toast.textContent = message
  toast.hidden = false
  clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => { toast.hidden = true }, 3200)
}

function fighterRow(player, self) {
  const row = document.createElement('li')
  row.className = 'fighter'
  const avatar = document.createElement('span')
  avatar.className = 'avatar'
  const image = document.createElement('img')
  image.src = '/assets/mage.webp'
  image.alt = ''
  avatar.append(image)
  const name = document.createElement('span')
  name.className = 'fighter-name'
  const badge = document.createElement('small')
  const score = document.createElement('strong')
  score.className = 'score'
  row.append(avatar, name, badge, score)
  name.textContent = player.name
  image.style.filter = player.id === self ? '' : 'hue-rotate(' + opponentHues[player.slot % opponentHues.length] + 'deg)'
  badge.textContent = player.id === self ? 'ВЫ' : player.isBot ? 'БОТ' : ''
  badge.hidden = !badge.textContent
  badge.className = player.isBot ? 'bot' : ''
  score.textContent = player.score
  return row
}

function roster(players, self) {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.slot - b.slot)
  const signature = JSON.stringify([self, sorted.map(p => [p.id, p.name, p.score, p.isBot])])
  if (signature === lastPlayers) return
  lastPlayers = signature
  const fragment = document.createDocumentFragment()
  for (const player of sorted) {
    const row = fighterRow(player, self)
    fragment.append(row)
  }
  byId('fighters').replaceChildren(fragment)
}

function matchMessage(eyebrow, title, detail, newRoom = false) {
  label('overlay-label', eyebrow)
  label('overlay-title', title)
  label('overlay-detail', detail)
  let action = overlay.querySelector('button')
  if (newRoom && !action) {
    action = document.createElement('button')
    action.className = 'invite'
    action.dataset.gameAction = 'new-room'
    action.textContent = 'Создать комнату'
    overlay.firstElementChild.append(action)
  }
  if (action) action.hidden = !newRoom
  overlay.hidden = false
}

function render(state) {
  const player = state.players.find(p => p.id === state.you)
  const online = state.status === 'online'
  label('room-code', state.room || '······')
  label('phase-label', online ? state.mode === 'practice' ? 'Разминка' : 'Матч' : 'Подключение')
  label('timer', Math.floor(state.remaining / 60).toString().padStart(2,'0') + ':' + (state.remaining % 60).toString().padStart(2,'0'))
  label('fighters-count', String(state.players.filter(p => !p.isBot).length) + ' / 8')
  label('network-label', online ? 'Сервер подключён' : state.status === 'error' ? 'Вход недоступен' : state.status === 'reconnecting' ? 'Восстанавливаем связь' : 'Подключение')
  label('ping', online && state.ping ? state.ping + ' мс' : '')
  byId('network-dot').classList.toggle('offline', !online)
  byId('practice-note').hidden = state.mode !== 'practice' || !online
  if (player) {
    label('account-name', player.name)
    label('my-name', player.name)
    label('hp-num', String(player.hp))
    label('my-kills', String(player.score))
    byId('hp-fill').style.width = 100 * player.hp / player.maxHp + '%'
  }
  for (const spell of state.spells) {
    const button = spellButtons.get(spell.id)
    if (button) button.querySelector('.cooldown').style.width = Math.min(100, 100 * spell.remaining / spell.duration) + '%'
  }
  roster(state.players, state.you)
  const sound = byId('sound')
  sound.querySelector('use').setAttribute('href', state.sound ? '#volume' : '#mute')
  sound.setAttribute('aria-label', state.sound ? 'Выключить звук' : 'Включить звук')
  sound.setAttribute('aria-pressed', String(state.sound))
  if (state.status === 'error') {
    matchMessage('Вход в комнату', 'Комната недоступна', state.message, true)
  } else if (state.status === 'reconnecting') {
    matchMessage('Соединение', 'Восстанавливаем связь', 'Ты вернёшься в эту комнату автоматически.')
  } else if (online && state.phase === 'results') {
    const winner = state.winnerName || state.players.find(p => p.id === state.winnerId)?.name
    matchMessage('Раунд завершён', winner ? 'Победа — ' + winner : 'Ничья', 'Следующий раунд через ' + state.remaining + ' с')
  } else if (online && player && !player.alive) {
    matchMessage('Нокаут', 'Возрождение через ' + Math.ceil(player.respawn) + ' с', 'Счёт сохранён до конца раунда.')
  } else overlay.hidden = true
}

window.addEventListener('game:state', event => render(event.detail))
window.addEventListener('game:notice', event => showToast(event.detail.message))
byId('help-open').addEventListener('click', () => help.showModal())
byId('profile-open').addEventListener('click', () => {
  const input = byId('name-input')
  input.value = byId('account-name').textContent
  profile.showModal()
  input.select()
})
for (const dialog of [help, profile]) {
  dialog.querySelectorAll('.dialog-done,.dialog-x').forEach(button => button.addEventListener('click', () => dialog.close()))
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return
    const bounds = dialog.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close()
  })
}
byId('name-form').addEventListener('submit', event => {
  event.preventDefault()
  const input = byId('name-input')
  const name = input.value.trim()
  if (!name) { input.focus(); return }
  window.dispatchEvent(new CustomEvent('game:name', { detail: { name } }))
  profile.close()
})
for (const button of document.querySelectorAll('[data-full-spell]')) {
  button.addEventListener('click', () => spellButtons.get(button.dataset.fullSpell).click())
}
const fullscreen = byId('fullscreen')
function updateFullscreen(active) {
  fullscreen.setAttribute('aria-label', active ? 'Свернуть поле' : 'Развернуть поле')
  fullscreen.title = fullscreen.getAttribute('aria-label')
  fullscreen.setAttribute('aria-pressed', String(active))
}
function expandInPage(active) {
  panel.classList.toggle('expanded', active)
  document.body.classList.toggle('field-expanded', active)
  updateFullscreen(active)
}
fullscreen.addEventListener('click', async () => {
  if (panel.classList.contains('expanded')) return expandInPage(false)
  if (document.fullscreenElement) return document.exitFullscreen()
  if (document.fullscreenEnabled) {
    try {
      await panel.requestFullscreen()
      return
    } catch {}
  }
  expandInPage(true)
})
document.addEventListener('fullscreenchange', () => updateFullscreen(Boolean(document.fullscreenElement)))
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && panel.classList.contains('expanded')) expandInPage(false)
})
