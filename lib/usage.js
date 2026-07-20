const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

// Claude Code stores transcripts under ~/.claude/projects/<munged-path>/,
// where every non-alphanumeric character of the absolute path becomes '-'.
function mungeProjectPath(projectPath) {
  return projectPath.replace(/[^a-zA-Z0-9]/g, '-')
}

function usageTokens(usage) {
  return (usage.input_tokens || 0)
    + (usage.output_tokens || 0)
    + (usage.cache_creation_input_tokens || 0)
    + (usage.cache_read_input_tokens || 0)
}

function localDayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function emptyDaily(now, days) {
  const daily = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    daily.push({ key: localDayKey(d), label: `${d.getMonth() + 1}/${d.getDate()}`, tokens: 0 })
  }
  return daily
}

async function collectUsage(projectPath, opts = {}) {
  const projectsRoot = opts.projectsRoot || path.join(os.homedir(), '.claude', 'projects')
  const now = opts.now || new Date()
  const days = opts.days || 7
  const dir = path.join(projectsRoot, mungeProjectPath(projectPath))
  const result = { today: 0, total: 0, daily: emptyDaily(now, days) }
  const byDay = new Map(result.daily.map((d) => [d.key, d]))

  let files
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return result
  }

  const todayKey = localDayKey(now)
  const seen = new Set()
  for (const file of files) {
    let content
    try {
      content = await fs.readFile(path.join(dir, file), 'utf8')
    } catch {
      continue
    }
    for (const rawLine of content.split('\n')) {
      if (!rawLine.includes('"usage"')) continue
      let entry
      try {
        entry = JSON.parse(rawLine)
      } catch {
        continue
      }
      const usage = entry.message && entry.message.usage
      if (!usage) continue
      const id = entry.message.id || entry.requestId
      if (id) {
        if (seen.has(id)) continue
        seen.add(id)
      }
      const tokens = usageTokens(usage)
      result.total += tokens
      if (entry.timestamp) {
        const dayKey = localDayKey(new Date(entry.timestamp))
        if (dayKey === todayKey) result.today += tokens
        const bucket = byDay.get(dayKey)
        if (bucket) bucket.tokens += tokens
      }
    }
  }
  return result
}

function formatTokens(n) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
}

// ---------- account-wide usage & 5-hour billing window ----------
// Claude 플랜의 5시간 한도는 계정 단위이므로 모든 프로젝트 트랜스크립트를 합산한다.
// 실제 플랜 한도는 로컬에 기록되지 않으므로, ccusage처럼 역대 최대 블록 사용량을
// 한도 추정치로 쓴다 (5시간 블록: 첫 활동 시각을 정시로 내림, 5시간 지나면 새 블록).

const BLOCK_MS = 5 * 3600_000
const HOUR_MS = 3600_000

function floorToHour(ms) {
  return Math.floor(ms / HOUR_MS) * HOUR_MS
}

// entries: [{ t, tokens }] sorted ascending by t
function computeBlocks(entries, blockMs = BLOCK_MS) {
  const blocks = []
  let cur = null
  for (const e of entries) {
    if (!cur || e.t >= cur.start + blockMs) {
      cur = { start: floorToHour(e.t), tokens: 0 }
      blocks.push(cur)
    }
    cur.tokens += e.tokens
  }
  return blocks
}

// Every usage entry across every project, deduped by message id.
// sinceMs limits work by skipping transcript files not modified since then.
async function scanEntries(projectsRoot, sinceMs = 0) {
  const entries = []
  const seen = new Set()
  let dirs
  try {
    dirs = await fs.readdir(projectsRoot)
  } catch {
    return entries
  }
  for (const dirName of dirs) {
    const dir = path.join(projectsRoot, dirName)
    let files
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const file of files) {
      const full = path.join(dir, file)
      try {
        if (sinceMs > 0) {
          const stat = await fs.stat(full)
          if (stat.mtimeMs < sinceMs) continue
        }
        const content = await fs.readFile(full, 'utf8')
        for (const rawLine of content.split('\n')) {
          if (!rawLine.includes('"usage"')) continue
          let entry
          try {
            entry = JSON.parse(rawLine)
          } catch {
            continue
          }
          const usage = entry.message && entry.message.usage
          if (!usage || !entry.timestamp) continue
          const id = entry.message.id || entry.requestId
          if (id) {
            if (seen.has(id)) continue
            seen.add(id)
          }
          const t = new Date(entry.timestamp).getTime()
          if (Number.isNaN(t) || t < sinceMs) continue
          entries.push({ t, tokens: usageTokens(usage) })
        }
      } catch {
        continue
      }
    }
  }
  entries.sort((a, b) => a.t - b.t)
  return entries
}

// 역대 최대 5시간 블록 = 한도 추정치. 전체 기록 스캔이라 시작 시 한 번만 호출.
async function estimateBlockLimit(opts = {}) {
  const projectsRoot = opts.projectsRoot || path.join(os.homedir(), '.claude', 'projects')
  const entries = await scanEntries(projectsRoot, 0)
  return computeBlocks(entries).reduce((max, b) => Math.max(max, b.tokens), 0)
}

// 계정 전체의 오늘/최근 7일/현재 5시간 블록 사용량.
async function collectAccountUsage(opts = {}) {
  const projectsRoot = opts.projectsRoot || path.join(os.homedir(), '.claude', 'projects')
  const now = opts.now || new Date()
  const nowMs = now.getTime()
  const days = opts.days || 7
  const entries = await scanEntries(projectsRoot, nowMs - (days + 1) * 24 * 3600_000)

  const daily = emptyDaily(now, days)
  const byDay = new Map(daily.map((d) => [d.key, d]))
  const todayKey = localDayKey(now)
  let today = 0
  for (const e of entries) {
    const key = localDayKey(new Date(e.t))
    if (key === todayKey) today += e.tokens
    const bucket = byDay.get(key)
    if (bucket) bucket.tokens += e.tokens
  }

  const blocks = computeBlocks(entries.filter((e) => e.t >= nowMs - 24 * 3600_000))
  const last = blocks[blocks.length - 1]
  const active = Boolean(last && nowMs < last.start + BLOCK_MS)
  const block = active
    ? { tokens: last.tokens, resetAt: last.start + BLOCK_MS, active: true }
    : { tokens: 0, resetAt: null, active: false }

  return { today, daily, block }
}

module.exports = {
  collectUsage,
  collectAccountUsage,
  estimateBlockLimit,
  computeBlocks,
  mungeProjectPath,
  formatTokens,
}
