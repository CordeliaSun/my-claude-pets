// Official plan-usage percentages, fetched the same way Claude Code's
// /usage screen does: the locally stored OAuth token is sent to Anthropic's
// usage endpoint. This is the only network call the app ever makes, and it
// can be turned off with "officialQuota": false in pets.json.
const { execFile } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'

function tokenFromKeychain() {
  return new Promise((resolve) => {
    execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], (err, stdout) => {
      if (err) return resolve(null)
      try {
        resolve(JSON.parse(stdout).claudeAiOauth.accessToken || null)
      } catch {
        resolve(null)
      }
    })
  })
}

async function tokenFromFile() {
  try {
    const raw = await fs.readFile(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf8')
    return JSON.parse(raw).claudeAiOauth.accessToken || null
  } catch {
    return null
  }
}

async function getOAuthToken() {
  return (await tokenFromKeychain()) || (await tokenFromFile())
}

// -> { limits: [{ kind, label, percent, resetsAt }] } | null
function parseQuota(data) {
  if (!data || !Array.isArray(data.limits)) return null
  const limits = data.limits
    .map((l) => ({
      kind: l.kind,
      label: l.kind === 'session' ? '5h'
        : l.kind === 'weekly_all' ? '주간'
          : (l.scope && l.scope.model && l.scope.model.display_name) || l.kind,
      percent: typeof l.percent === 'number' ? l.percent : null,
      resetsAt: l.resets_at || null,
    }))
    .filter((l) => l.percent !== null)
  return limits.length ? { limits } : null
}

async function fetchQuota(opts = {}) {
  const token = opts.token || await getOAuthToken()
  if (!token) return null
  try {
    const res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    return parseQuota(await res.json())
  } catch {
    return null
  }
}

module.exports = { fetchQuota, parseQuota, getOAuthToken }
