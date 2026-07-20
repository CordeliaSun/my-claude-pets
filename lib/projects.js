const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DEFAULT_ROOTS = [
  '~/Desktop',
  '~/Documents',
  '~/Developer',
  '~/Projects',
  '~/workspace',
]

const SKIP = new Set(['node_modules'])

function expandHome(p) {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

function scanProjects(roots = DEFAULT_ROOTS) {
  const seen = new Set()
  const projects = []
  for (const rawRoot of roots) {
    const root = expandHome(rawRoot)
    let entries
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
      if (entry.name.endsWith('.worktrees')) continue
      const full = path.join(root, entry.name)
      if (seen.has(full)) continue
      seen.add(full)
      projects.push({ name: entry.name, path: full })
    }
  }
  projects.sort((a, b) => a.name.localeCompare(b.name))
  return projects
}

function searchProjects(projects, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return projects
  const starts = []
  const contains = []
  for (const p of projects) {
    const name = p.name.toLowerCase()
    if (name.startsWith(q)) starts.push(p)
    else if (name.includes(q)) contains.push(p)
  }
  return [...starts, ...contains]
}

module.exports = { scanProjects, searchProjects, DEFAULT_ROOTS }
