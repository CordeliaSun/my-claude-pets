const stage = document.getElementById('stage')

const WALK_SPEED = 55 // px per second at speed 1
const PET_WIDTH = 72
const DRAG_THRESHOLD = 4 // px of movement before a press becomes a drag

function formatTokens(n) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
}

// ---------- search panel (singleton) ----------

const OPEN_CHOICES = [
  { label: '새 탭으로 열기', hint: '지금 iTerm 창에 추가', mode: 'tab' },
  { label: '새 창으로 열기', hint: '별도 iTerm 창', mode: 'window' },
]

const panel = {
  el: null,
  input: null,
  list: null,
  open: false,
  mode: 'search', // 'search' | 'choose'
  pending: null, // project awaiting tab/window choice
  choiceSel: 0,
  projects: [],
  filtered: [],
  selected: 0,

  build() {
    this.el = document.createElement('div')
    this.el.id = 'search-panel'
    this.input = document.createElement('input')
    this.input.placeholder = '프로젝트 검색… (Enter로 열기, Esc로 닫기)'
    this.input.spellcheck = false
    this.list = document.createElement('ul')
    this.el.appendChild(this.input)
    this.el.appendChild(this.list)
    this.el.addEventListener('mouseenter', () => window.deskPets.setIgnoreMouse(false))
    this.input.addEventListener('input', () => {
      if (this.mode !== 'search') return
      this.selected = 0
      this.render()
    })
    this.input.addEventListener('keydown', (e) => {
      if (this.mode === 'choose') {
        if (e.key === 'Escape') { this.backToSearch(); return }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          this.choiceSel = (this.choiceSel + 1) % OPEN_CHOICES.length
          this.renderChoice()
          return
        }
        if (e.key === 'Enter') this.launch(this.pending, OPEN_CHOICES[this.choiceSel].mode)
        return
      }
      if (e.key === 'Escape') { this.close(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); return }
      if (e.key === 'Enter') {
        const target = this.filtered[this.selected]
        if (target) this.openProject(target)
      }
    })
    window.addEventListener('blur', () => { if (this.open) this.close() })
    // Esc anywhere (even when the input lost focus) closes the panel,
    // as does clicking outside of it.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.open) return
      if (this.mode === 'choose') this.backToSearch()
      else this.close()
    })
    document.addEventListener('mousedown', (e) => {
      if (!this.open || this.el.contains(e.target)) return
      if (e.target.closest && e.target.closest('.pet')) return // pet click toggles
      this.close()
    })
    stage.appendChild(this.el)
  },

  filter(query) {
    const q = (query || '').trim().toLowerCase()
    if (!q) return this.projects
    const starts = []
    const contains = []
    for (const p of this.projects) {
      const name = p.name.toLowerCase()
      if (name.startsWith(q)) starts.push(p)
      else if (name.includes(q)) contains.push(p)
    }
    return [...starts, ...contains]
  },

  move(delta) {
    if (!this.filtered.length) return
    this.selected = (this.selected + delta + this.filtered.length) % this.filtered.length
    this.render()
  },

  render() {
    this.filtered = this.filter(this.input.value)
    this.list.textContent = ''
    this.filtered.slice(0, 100).forEach((p, i) => {
      const li = document.createElement('li')
      if (i === this.selected) li.className = 'selected'
      const name = document.createElement('span')
      name.textContent = p.name
      const dir = document.createElement('span')
      dir.className = 'dir'
      dir.textContent = p.path.replace(/^\/Users\/[^/]+/, '~')
      li.appendChild(name)
      li.appendChild(dir)
      li.addEventListener('mouseenter', () => { this.selected = i; this.render() })
      li.addEventListener('click', () => this.openProject(p))
      this.list.appendChild(li)
    })
    const sel = this.list.querySelector('.selected')
    if (sel) sel.scrollIntoView({ block: 'nearest' })
  },

  // iTerm이 이미 떠 있으면 새 탭/새 창 선택 단계를 거치고, 아니면 바로 새 창.
  async openProject(p) {
    const running = await window.deskPets.itermRunning()
    if (!running) { this.launch(p, 'window'); return }
    this.mode = 'choose'
    this.pending = p
    this.choiceSel = 0
    this.input.readOnly = true
    this.input.value = `${p.name} 열기:`
    this.renderChoice()
  },

  renderChoice() {
    this.list.textContent = ''
    OPEN_CHOICES.forEach((choice, i) => {
      const li = document.createElement('li')
      if (i === this.choiceSel) li.className = 'selected'
      const name = document.createElement('span')
      name.textContent = choice.label
      const hint = document.createElement('span')
      hint.className = 'dir'
      hint.textContent = choice.hint
      li.appendChild(name)
      li.appendChild(hint)
      li.addEventListener('mouseenter', () => { this.choiceSel = i; this.renderChoice() })
      li.addEventListener('click', () => this.launch(this.pending, choice.mode))
      this.list.appendChild(li)
    })
  },

  backToSearch() {
    this.mode = 'search'
    this.pending = null
    this.input.readOnly = false
    this.input.value = ''
    this.selected = 0
    this.render()
    this.input.focus()
  },

  launch(p, mode) {
    if (p) window.deskPets.openPath(p.path, mode)
    this.close()
  },

  async toggle(pet) {
    if (this.open) { this.close(); return }
    if (!this.el) this.build()
    this.projects = await window.deskPets.getProjects()
    this.selected = 0
    this.input.value = ''
    // 키티 바로 아래에 붙이고, 아래 공간이 모자라면(바닥에 있으면) 위에 띄운다.
    const rect = pet.el.getBoundingClientRect()
    const PANEL_H = 290
    const left = Math.min(Math.max(rect.left + rect.width / 2 - 170, 8), window.innerWidth - 356)
    this.el.style.left = left + 'px'
    if (window.innerHeight - rect.bottom >= PANEL_H + 16) {
      this.el.style.top = Math.round(rect.bottom + 10) + 'px'
      this.el.style.bottom = 'auto'
    } else {
      this.el.style.bottom = Math.round(window.innerHeight - rect.top + 10) + 'px'
      this.el.style.top = 'auto'
    }
    this.el.classList.add('open')
    this.open = true
    window.deskPets.setIgnoreMouse(false)
    window.deskPets.setFocusable(true)
    this.render()
    setTimeout(() => this.input.focus(), 60)
  },

  close() {
    if (!this.open) return
    this.open = false
    this.mode = 'search'
    this.pending = null
    if (this.input) this.input.readOnly = false
    this.el.classList.remove('open')
    window.deskPets.setFocusable(false)
    window.deskPets.setIgnoreMouse(true)
  },
}

// ---------- pets ----------

class Pet {
  constructor(config, index) {
    this.config = config
    this.x = 80 + index * 140
    this.y = 0 // lift above the bottom while being carried
    this.dir = Math.random() < 0.5 ? -1 : 1
    this.state = 'idle'
    this.stateUntil = 0
    this.dragging = false
    this.crossPending = false

    this.el = document.createElement('div')
    this.el.className = 'pet idle'

    this.graphEl = document.createElement('div')
    this.graphEl.className = 'graph'
    this.barsEl = document.createElement('div')
    this.barsEl.className = 'bars'
    this.captionEl = document.createElement('div')
    this.captionEl.className = 'caption'
    this.captionEl.textContent = 'tokens: …'
    this.meterEl = document.createElement('div')
    this.meterEl.className = 'meter'
    this.meterFillEl = document.createElement('div')
    this.meterFillEl.className = 'fill'
    this.meterEl.appendChild(this.meterFillEl)
    this.caption2El = document.createElement('div')
    this.caption2El.className = 'caption'
    this.graphEl.appendChild(this.barsEl)
    this.graphEl.appendChild(this.captionEl)
    this.graphEl.appendChild(this.meterEl)
    this.graphEl.appendChild(this.caption2El)
    this.el.appendChild(this.graphEl)

    const flip = document.createElement('span')
    flip.className = 'flip'
    if (config.image) {
      const img = document.createElement('img')
      img.className = 'body'
      img.src = 'file://' + encodeURI(config.image)
      img.style.width = 64 * config.scale + 'px'
      img.style.height = 64 * config.scale + 'px'
      img.draggable = false
      flip.appendChild(img)
    } else {
      const span = document.createElement('span')
      span.className = 'body'
      span.textContent = config.emoji
      span.style.fontSize = 48 * config.scale + 'px'
      flip.appendChild(span)
    }
    this.el.appendChild(flip)

    this.el.addEventListener('mouseenter', () => window.deskPets.setIgnoreMouse(false))
    this.el.addEventListener('mouseleave', () => {
      if (!this.dragging && !panel.open) window.deskPets.setIgnoreMouse(true)
    })
    this.el.addEventListener('mousedown', (e) => this.onGrab(e))
    this.el.addEventListener('click', () => {
      panel.toggle(this)
    })
    stage.appendChild(this.el)
  }

  setUsage(usage) {
    const block = usage.block || { tokens: 0, active: false, resetAt: null }
    this.captionEl.textContent = `오늘 ${formatTokens(usage.today)} tok`

    const hm = (iso) => {
      const d = new Date(iso)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }

    let line2
    let ratio = 0
    const quotaLimits = usage.quota && usage.quota.limits
    if (quotaLimits && quotaLimits.length) {
      // 공식 플랜 사용량 % (Claude Code /usage와 동일한 API)
      const session = quotaLimits.find((l) => l.kind === 'session')
      const others = quotaLimits.filter((l) => l.kind !== 'session')
      if (session) {
        ratio = Math.min(1, session.percent / 100)
        line2 = `5h ${session.percent}%`
        if (session.resetsAt) line2 += ` · ${hm(session.resetsAt)} 리셋`
      } else {
        line2 = `5h ?`
      }
      if (others.length) {
        line2 += '\n' + others.map((l) => `${l.label} ${l.percent}%`).join(' · ')
      }
    } else if (usage.limit) {
      // 폴백: 트랜스크립트 기반 추정 (한도 = 역대 최대 5시간 블록)
      const remain = Math.max(0, usage.limit - block.tokens)
      ratio = Math.min(1, block.tokens / usage.limit)
      line2 = `5h 남음 ${formatTokens(remain)}/${formatTokens(usage.limit)}`
      if (block.active && block.resetAt) line2 += ` · ${hm(block.resetAt)} 리셋`
    } else {
      line2 = `5h 사용 ${formatTokens(block.tokens)}`
      if (block.active && block.resetAt) line2 += ` · ${hm(block.resetAt)} 리셋`
    }
    this.caption2El.textContent = ''
    line2.split('\n').forEach((text) => {
      const row = document.createElement('div')
      row.textContent = text
      this.caption2El.appendChild(row)
    })
    this.meterFillEl.style.width = Math.round(ratio * 100) + '%'
    this.meterFillEl.classList.toggle('hot', ratio > 0.85)

    if (!usage.daily) return
    this.barsEl.textContent = ''
    const max = Math.max(...usage.daily.map((d) => d.tokens), 1)
    for (const day of usage.daily) {
      const col = document.createElement('div')
      col.className = 'col'
      const bar = document.createElement('div')
      bar.className = 'bar'
      bar.style.height = Math.max(2, Math.round((day.tokens / max) * 34)) + 'px'
      bar.title = `${day.label}: ${formatTokens(day.tokens)} tokens`
      const lab = document.createElement('div')
      lab.className = 'day'
      lab.textContent = day.label.split('/')[1]
      col.appendChild(bar)
      col.appendChild(lab)
      this.barsEl.appendChild(col)
    }
  }

  // Once the press moves past the threshold, hand the drag session to the
  // main process: it follows the global cursor across every display and
  // renders the pet on whichever monitor the cursor is over. This window
  // keeps mouse capture until release, so it reports the drop.
  onGrab(e) {
    e.preventDefault()
    const downX = e.clientX
    const downY = e.clientY
    const gx = downX - this.x
    const gy = (window.innerHeight - downY) - this.y
    let started = false

    const onMove = (ev) => {
      if (started) return
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) < DRAG_THRESHOLD) return
      started = true
      window.deskPets.dragStart(this.config.name, gx, gy)
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (started) {
        window.deskPets.dragEnd()
        if (!panel.open) window.deskPets.setIgnoreMouse(true)
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // At a screen edge: ask main whether a neighboring display exists.
  // If it does, this window soon receives 'pet-remove' and the neighbor
  // receives 'pet-arrive'; otherwise turn around.
  tryCross(edge) {
    if (this.crossPending) return
    this.crossPending = true
    window.deskPets.requestCross(this.config.name, edge).then((res) => {
      if (!res || !res.transfer) {
        // no neighboring display: turn around toward a new in-screen target
        this.dir = edge === 'left' ? 1 : -1
        this.target = Math.random() * (window.innerWidth - PET_WIDTH)
        this.crossPending = false
      }
    })
  }

  // Walk toward a chosen destination instead of wandering aimlessly, so the
  // pet roams the whole screen. Sometimes the destination is past a screen
  // edge, which walks her onto a neighboring display.
  pickState(now) {
    // While placed up in the air the pet stays put and just breathes.
    if (this.y === 0 && Math.random() < 0.7) {
      this.state = 'walking'
      const max = window.innerWidth - PET_WIDTH
      const r = Math.random()
      if (r < 0.1) this.target = -PET_WIDTH * 2
      else if (r < 0.2) this.target = max + PET_WIDTH * 2
      else this.target = Math.random() * max
      this.dir = this.target > this.x ? 1 : -1
      this.stateUntil = now + 120_000 // safety cap; arrival ends the walk
    } else {
      this.state = 'idle'
      this.stateUntil = now + 1500 + Math.random() * 4000
    }
    this.el.classList.toggle('walking', this.state === 'walking')
    this.el.classList.toggle('idle', this.state === 'idle')
  }

  tick(now, dt) {
    if (!this.dragging && !panel.open) {
      if (now >= this.stateUntil) this.pickState(now)
      if (this.state === 'walking' && this.y === 0) {
        this.x += this.dir * WALK_SPEED * this.config.speed * (dt / 1000)
        const max = window.innerWidth - PET_WIDTH
        if (this.x <= 0) {
          this.x = 0
          this.tryCross('left')
        } else if (this.x >= max) {
          this.x = max
          this.tryCross('right')
        } else if (
          (this.dir === 1 && this.x >= this.target) ||
          (this.dir === -1 && this.x <= this.target)
        ) {
          this.stateUntil = 0 // arrived: choose the next behavior
        }
      }
    }
    this.el.classList.toggle('facing-left', this.dir === -1)
    this.el.style.transform = `translate(${this.x}px, ${-this.y}px)`
  }
}

let pets = []
let lastUsage = {}

function setPets(configs) {
  for (const p of pets) p.el.remove()
  pets = configs.map((c, i) => new Pet(c, i))
  for (const p of pets) if (lastUsage[p.config.name]) p.setUsage(lastUsage[p.config.name])
}

let last = performance.now()
function loop(now) {
  const dt = Math.min(now - last, 100)
  last = now
  for (const p of pets) p.tick(now, dt)
  requestAnimationFrame(loop)
}

function addArrivingPet({ pet, edge }) {
  const p = new Pet(pet, 0)
  p.x = edge === 'left' ? 0 : window.innerWidth - PET_WIDTH
  p.dir = edge === 'left' ? 1 : -1
  p.state = 'walking'
  p.target = Math.random() * (window.innerWidth - PET_WIDTH)
  p.stateUntil = performance.now() + 120_000
  p.el.classList.add('walking')
  p.el.classList.remove('idle')
  if (lastUsage[pet.name]) p.setUsage(lastUsage[pet.name])
  pets.push(p)
}

function removePet(name) {
  const idx = pets.findIndex((p) => p.config.name === name)
  if (idx < 0) return
  pets[idx].el.remove()
  pets.splice(idx, 1)
}

// ---------- cross-display drag ghost ----------

let ghost = null

function ensureGhost(pet) {
  if (ghost && ghost.config.name === pet.name) return ghost
  if (ghost) removeGhost()
  ghost = new Pet(pet, 0)
  ghost.dragging = true
  ghost.el.classList.add('grabbed')
  if (lastUsage[pet.name]) ghost.setUsage(lastUsage[pet.name])
  pets.push(ghost)
  return ghost
}

function removeGhost() {
  if (!ghost) return
  removePet(ghost.config.name)
  ghost = null
}

window.deskPets.onDragGhost(({ pet, x, y }) => {
  const g = ensureGhost(pet)
  g.x = x
  g.y = y
})

window.deskPets.onDragGhostRemove(removeGhost)

window.deskPets.onDragFinal(({ pet, x, y }) => {
  const g = ensureGhost(pet)
  g.x = x
  g.y = y < 40 ? 0 : y // near the ground: snap down and walk again
  g.dragging = false
  g.el.classList.remove('grabbed')
  g.stateUntil = 0
  ghost = null
})

// 유실 감시용: 이 창에 살아있는 pet 이름 목록 (main이 주기적으로 조회)
window.__petNames = () => pets.map((p) => p.config.name)

window.deskPets.getPets().then(setPets)
window.deskPets.onPetsUpdated(setPets)
window.deskPets.onPetArrive(addArrivingPet)
window.deskPets.onPetRemove(removePet)
window.deskPets.onUsageUpdated((usage) => {
  lastUsage = usage
  for (const p of pets) if (usage[p.config.name]) p.setUsage(usage[p.config.name])
})
requestAnimationFrame(loop)
