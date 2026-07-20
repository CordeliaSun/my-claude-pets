const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, screen, nativeImage } = require('electron')
const { execFile } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { loadPets } = require('./lib/config')
const { buildOsascriptArgs } = require('./lib/iterm')
const { collectAccountUsage, estimateBlockLimit } = require('./lib/usage')
const { fetchQuota } = require('./lib/quota')
const { scanProjects } = require('./lib/projects')

const CONFIG_PATH = path.join(__dirname, 'pets.json')
const EXAMPLE_CONFIG_PATH = path.join(__dirname, 'pets.example.json')
const USAGE_REFRESH_MS = 2 * 60 * 1000

const PET_WIDTH = 72

let wins = [] // one overlay window per display, sorted left-to-right
let winAreas = [] // matching workArea for each window
let tray = null
let state = { pets: [], errors: [], searchRoots: null, defaultCommand: 'claude' }
const petLocations = new Map() // pet name -> window index
let activeDrag = null // { name, pet, gx, gy, sourceIndex, winIndex, timer }

function windowIndexOf(webContents) {
  return wins.findIndex((w) => w.webContents === webContents)
}

function petsForWindow(index) {
  return state.pets.filter((p) => (petLocations.get(p.name) || 0) === index)
}

function sendPetsToWindows() {
  wins.forEach((win, i) => {
    if (!win.isDestroyed()) win.webContents.send('pets-updated', petsForWindow(i))
  })
}

let blockLimit = null // 역대 최대 5시간 블록 = 한도 추정치 (시작 시 1회 계산)

async function refreshUsage() {
  if (!wins.length) return
  const [account, quota] = await Promise.all([
    collectAccountUsage(),
    state.officialQuota !== false ? fetchQuota() : Promise.resolve(null),
  ])
  const usage = {}
  for (const pet of state.pets) {
    usage[pet.name] = { ...account, limit: blockLimit, quota }
  }
  for (const win of wins) {
    if (!win.isDestroyed()) win.webContents.send('usage-updated', usage)
  }
}

function reloadConfig() {
  // first run: seed pets.json from the bundled example
  if (!fs.existsSync(CONFIG_PATH) && fs.existsSync(EXAMPLE_CONFIG_PATH)) {
    try {
      fs.copyFileSync(EXAMPLE_CONFIG_PATH, CONFIG_PATH)
    } catch (err) {
      console.warn('[desk-pets] cannot seed pets.json:', err.message)
    }
  }
  state = loadPets(CONFIG_PATH)
  for (const err of state.errors) console.warn('[desk-pets]', err)
  if (state.errors.length > 0) {
    new Notification({
      title: 'desk-pets 설정 경고',
      body: state.errors.join('\n').slice(0, 200),
    }).show()
  }
  for (const pet of state.pets) {
    const loc = petLocations.get(pet.name) || 0
    petLocations.set(pet.name, Math.min(loc, Math.max(wins.length - 1, 0)))
  }
  sendPetsToWindows()
  refreshUsage()
}

function createWindows() {
  for (const win of wins) {
    if (!win.isDestroyed()) win.destroy()
  }
  wins = []
  winAreas = []
  const displays = [...screen.getAllDisplays()].sort((a, b) => a.workArea.x - b.workArea.x)
  displays.forEach((display, index) => {
    const { workArea } = display
    // Full work-area height so the pet can be lifted anywhere on screen;
    // everything except the pet stays click-through.
    const win = new BrowserWindow({
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height,
      transparent: true,
      frame: false,
      resizable: false,
      movable: false,
      hasShadow: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.setIgnoreMouseEvents(true, { forward: true })
    win.webContents.on('console-message', (_e, level, message) => {
      if (level >= 2) console.error(`[renderer:${index}]`, message)
    })
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('pets-updated', petsForWindow(index))
      refreshUsage()
    })
    wins.push(win)
    winAreas.push({ ...workArea })
  })
}

let rebuildTimer = null
function scheduleRebuild() {
  clearTimeout(rebuildTimer)
  if (activeDrag) {
    clearInterval(activeDrag.timer)
    activeDrag = null
  }
  rebuildTimer = setTimeout(() => {
    for (const name of petLocations.keys()) petLocations.set(name, 0)
    createWindows()
  }, 500)
}

function createTray() {
  // 16x16 transparent placeholder; the title text is the visible part
  tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('🐾')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '설정 리로드', click: reloadConfig },
    { label: 'pets.json 열기', click: () => execFile('open', [CONFIG_PATH]) },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]))
}

function openInITerm(projectPath, command, mode = 'window') {
  if (!fs.existsSync(projectPath)) {
    new Notification({
      title: '프로젝트를 찾을 수 없어요',
      body: `경로 없음: ${projectPath}`,
    }).show()
    return { ok: false, error: 'project path missing' }
  }
  execFile('osascript', buildOsascriptArgs(projectPath, command, mode), (err) => {
    if (err) {
      console.error('[desk-pets] osascript failed:', err.message)
      new Notification({ title: 'iTerm 실행 실패', body: err.message.slice(0, 200) }).show()
    }
  })
  return { ok: true }
}

ipcMain.handle('get-pets', (event) => petsForWindow(windowIndexOf(event.sender)))

ipcMain.on('set-ignore-mouse', (event, ignore) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.setIgnoreMouseEvents(ignore, { forward: true })
})

ipcMain.on('set-focusable', (event, focusable) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  win.setFocusable(focusable)
  if (focusable) {
    win.focus()
    win.webContents.focus()
  }
})

ipcMain.handle('open-project', (_event, name) => {
  const pet = state.pets.find((p) => p.name === name)
  if (!pet) return { ok: false, error: `unknown pet: ${name}` }
  return openInITerm(pet.project, pet.command)
})

function activeSearchRoots() {
  return state.searchRoots && state.searchRoots.length ? state.searchRoots : undefined
}

// The renderer may only open a configured pet project or a folder that the
// project search itself would list — never an arbitrary path.
function isAllowedProject(projectPath) {
  if (typeof projectPath !== 'string' || !projectPath.trim()) return false
  const resolved = path.resolve(projectPath)
  if (state.pets.some((pet) => pet.project === resolved)) return true
  return scanProjects(activeSearchRoots()).some((project) => project.path === resolved)
}

ipcMain.handle('open-path', (_event, projectPath, mode) => {
  if (!isAllowedProject(projectPath)) {
    return { ok: false, error: 'path is not a known project' }
  }
  return openInITerm(path.resolve(projectPath), state.defaultCommand || 'claude', mode)
})

// iTerm의 실행 여부에 따라 렌더러가 새 탭/새 창 선택지를 보여줄지 결정한다.
ipcMain.handle('iterm-running', () => new Promise((resolve) => {
  execFile('pgrep', ['-xq', 'iTerm2'], (err) => resolve(!err))
}))

ipcMain.handle('get-projects', () => scanProjects(activeSearchRoots()))

// ---------- cross-display drag ----------
// The grabbing window keeps mouse capture until release, but its coordinates
// stop at its own display. So while a drag is active, the main process tracks
// the global cursor and tells whichever display the cursor is on to render
// the pet ("ghost") — letting a drag carry the pet across monitors.

function dragPosition() {
  const p = screen.getCursorScreenPoint()
  let idx = winAreas.findIndex((a) =>
    p.x >= a.x && p.x < a.x + a.width && p.y >= a.y && p.y < a.y + a.height)
  if (idx < 0) {
    const d = screen.getDisplayNearestPoint(p)
    idx = winAreas.findIndex((a) => a.x === d.workArea.x && a.y === d.workArea.y)
    if (idx < 0) idx = Math.max(0, activeDrag ? activeDrag.winIndex : 0)
  }
  const a = winAreas[idx]
  const x = Math.min(Math.max(p.x - a.x - activeDrag.gx, 0), a.width - PET_WIDTH)
  const lift = (a.y + a.height) - p.y
  const y = Math.min(Math.max(lift - activeDrag.gy, 0), a.height - 140)
  return { idx, x, y }
}

function leaveGhostWindow(index) {
  const win = wins[index]
  if (!win || win.isDestroyed()) return
  win.webContents.send('drag-ghost-remove')
  // the source window still holds mouse capture and must keep its events
  if (index !== activeDrag.sourceIndex) win.setIgnoreMouseEvents(true, { forward: true })
}

ipcMain.on('drag-start', (event, name, gx, gy) => {
  const pet = state.pets.find((p) => p.name === name)
  if (!pet || activeDrag) return
  const from = windowIndexOf(event.sender)
  if (from < 0) return
  activeDrag = { name, pet, gx, gy, sourceIndex: from, winIndex: from }
  wins[from].webContents.send('pet-remove', name)
  activeDrag.timer = setInterval(() => {
    const { idx, x, y } = dragPosition()
    if (idx !== activeDrag.winIndex) {
      leaveGhostWindow(activeDrag.winIndex)
      activeDrag.winIndex = idx
    }
    const win = wins[idx]
    if (win && !win.isDestroyed()) win.webContents.send('drag-ghost', { pet, x, y })
  }, 16)
})

ipcMain.on('drag-end', () => {
  if (!activeDrag) return
  clearInterval(activeDrag.timer)
  const { idx, x, y } = dragPosition()
  if (idx !== activeDrag.winIndex) leaveGhostWindow(activeDrag.winIndex)
  petLocations.set(activeDrag.name, idx)
  const win = wins[idx]
  if (win && !win.isDestroyed()) win.webContents.send('drag-final', { pet: activeDrag.pet, x, y })
  activeDrag = null
})

// 유실 감시: 이동/드래그 레이스 등으로 pet이 모든 창에서 사라지면 주 창에 되살린다.
async function ensurePetsPresent() {
  if (activeDrag || !wins.length || !state.pets.length) return
  const lists = await Promise.all(wins.map((win) =>
    win.isDestroyed()
      ? []
      : win.webContents
        .executeJavaScript('window.__petNames ? window.__petNames() : []')
        .catch(() => [])))
  const present = new Set(lists.flat())
  let lost = false
  for (const pet of state.pets) {
    if (!present.has(pet.name)) {
      console.warn(`[desk-pets] pet "${pet.name}" lost — respawning on primary window`)
      petLocations.set(pet.name, 0)
      lost = true
    }
  }
  if (lost) sendPetsToWindows()
}

// A pet reached a screen edge: move it to the neighboring display if one exists.
ipcMain.handle('pet-cross', (event, name, edge) => {
  const from = windowIndexOf(event.sender)
  if (from < 0) return { transfer: false }
  const to = edge === 'right' ? from + 1 : from - 1
  if (to < 0 || to >= wins.length || wins[to].isDestroyed()) return { transfer: false }
  const pet = state.pets.find((p) => p.name === name)
  if (!pet) return { transfer: false }
  petLocations.set(name, to)
  wins[from].webContents.send('pet-remove', name)
  wins[to].webContents.send('pet-arrive', { pet, edge: edge === 'right' ? 'left' : 'right' })
  return { transfer: true }
})

app.whenReady().then(() => {
  if (app.dock) app.dock.hide()
  createWindows()
  reloadConfig()
  createTray()
  setInterval(refreshUsage, USAGE_REFRESH_MS)
  setInterval(ensurePetsPresent, 30_000)
  estimateBlockLimit().then((max) => {
    blockLimit = max > 0 ? max : null
    refreshUsage()
  }).catch((err) => console.warn('[desk-pets] limit estimate failed:', err.message))
  screen.on('display-added', scheduleRebuild)
  screen.on('display-removed', scheduleRebuild)
  screen.on('display-metrics-changed', scheduleRebuild)
})

app.on('window-all-closed', () => app.quit())
