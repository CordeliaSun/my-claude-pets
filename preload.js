const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('deskPets', {
  getPets: () => ipcRenderer.invoke('get-pets'),
  openProject: (name) => ipcRenderer.invoke('open-project', name),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  onPetsUpdated: (cb) => ipcRenderer.on('pets-updated', (_e, pets) => cb(pets)),
  onUsageUpdated: (cb) => ipcRenderer.on('usage-updated', (_e, usage) => cb(usage)),
  getProjects: () => ipcRenderer.invoke('get-projects'),
  openPath: (p, mode) => ipcRenderer.invoke('open-path', p, mode),
  itermRunning: () => ipcRenderer.invoke('iterm-running'),
  setFocusable: (focusable) => ipcRenderer.send('set-focusable', focusable),
  requestCross: (name, edge) => ipcRenderer.invoke('pet-cross', name, edge),
  dragStart: (name, gx, gy) => ipcRenderer.send('drag-start', name, gx, gy),
  dragEnd: () => ipcRenderer.send('drag-end'),
  onDragGhost: (cb) => ipcRenderer.on('drag-ghost', (_e, data) => cb(data)),
  onDragGhostRemove: (cb) => ipcRenderer.on('drag-ghost-remove', () => cb()),
  onDragFinal: (cb) => ipcRenderer.on('drag-final', (_e, data) => cb(data)),
  onPetArrive: (cb) => ipcRenderer.on('pet-arrive', (_e, data) => cb(data)),
  onPetRemove: (cb) => ipcRenderer.on('pet-remove', (_e, name) => cb(name)),
})
