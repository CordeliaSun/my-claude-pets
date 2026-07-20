const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  collectUsage, collectAccountUsage, computeBlocks, mungeProjectPath, formatTokens,
} = require('../lib/usage')

function line(obj) { return JSON.stringify(obj) + '\n' }

function makeTranscripts(projectPath, lines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-pets-usage-'))
  const dir = path.join(root, mungeProjectPath(projectPath))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'session.jsonl'), lines.join(''))
  return root
}

test('munges project path like Claude Code', () => {
  assert.strictEqual(
    mungeProjectPath('/Users/me/Desktop/how_to_qa'),
    '-Users-me-Desktop-how-to-qa'
  )
})

test('sums usage tokens, split into today and total', async () => {
  const project = '/tmp/proj'
  const today = new Date()
  const oldDay = new Date(today.getTime() - 5 * 24 * 3600 * 1000)
  const root = makeTranscripts(project, [
    line({ type: 'assistant', timestamp: today.toISOString(), message: { id: 'm1', usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 40 } } }),
    line({ type: 'assistant', timestamp: oldDay.toISOString(), message: { id: 'm2', usage: { input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }),
    line({ type: 'user', timestamp: today.toISOString(), message: { id: 'u1' } }),
    'not json at all\n',
  ])
  const usage = await collectUsage(project, { projectsRoot: root, now: today })
  assert.strictEqual(usage.today, 100)
  assert.strictEqual(usage.total, 103)
  assert.strictEqual(usage.daily.length, 7)
  assert.strictEqual(usage.daily[6].tokens, 100) // today is the last bucket
  assert.strictEqual(usage.daily[1].tokens, 1 + 2) // 5 days ago
})

test('deduplicates repeated message ids', async () => {
  const project = '/tmp/proj2'
  const now = new Date()
  const entry = line({ type: 'assistant', timestamp: now.toISOString(), message: { id: 'dup', usage: { input_tokens: 5, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } })
  const root = makeTranscripts(project, [entry, entry])
  const usage = await collectUsage(project, { projectsRoot: root, now })
  assert.strictEqual(usage.total, 10)
})

test('missing transcript dir means zero usage', async () => {
  const usage = await collectUsage('/no/such/project', {
    projectsRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'desk-pets-empty-')),
    now: new Date(),
  })
  assert.strictEqual(usage.today, 0)
  assert.strictEqual(usage.total, 0)
  assert.strictEqual(usage.daily.length, 7)
  assert.ok(usage.daily.every((d) => d.tokens === 0))
})

test('computeBlocks groups entries into 5-hour blocks floored to the hour', () => {
  const H = 3600_000
  const base = Date.UTC(2026, 6, 20, 3, 30) // 03:30 → block starts 03:00
  const blocks = computeBlocks([
    { t: base, tokens: 10 },
    { t: base + H, tokens: 5 }, // 04:30, same block
    { t: base + 5 * H, tokens: 7 }, // 08:30 ≥ 03:00+5h → new block at 08:00
  ])
  assert.strictEqual(blocks.length, 2)
  assert.strictEqual(blocks[0].start, Date.UTC(2026, 6, 20, 3, 0))
  assert.strictEqual(blocks[0].tokens, 15)
  assert.strictEqual(blocks[1].start, Date.UTC(2026, 6, 20, 8, 0))
  assert.strictEqual(blocks[1].tokens, 7)
})

test('collectAccountUsage aggregates across projects and reports the active block', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-pets-acct-'))
  const now = new Date()
  const mkProject = (name, entries) => {
    const dir = path.join(root, name)
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 's.jsonl'), entries.map(line).join(''))
  }
  mkProject('-p-one', [
    { type: 'assistant', timestamp: now.toISOString(), message: { id: 'a1', usage: { input_tokens: 100, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } },
  ])
  mkProject('-p-two', [
    { type: 'assistant', timestamp: now.toISOString(), message: { id: 'a2', usage: { input_tokens: 50, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } },
    // 10 hours ago: not in the active block
    { type: 'assistant', timestamp: new Date(now.getTime() - 10 * 3600_000).toISOString(), message: { id: 'a3', usage: { input_tokens: 999, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } },
  ])
  const usage = await collectAccountUsage({ projectsRoot: root, now })
  assert.strictEqual(usage.block.active, true)
  assert.strictEqual(usage.block.tokens, 150)
  assert.ok(usage.block.resetAt > now.getTime())
  assert.ok(usage.today >= 150)
})

test('formatTokens renders compact numbers', () => {
  assert.strictEqual(formatTokens(0), '0')
  assert.strictEqual(formatTokens(999), '999')
  assert.strictEqual(formatTokens(12_345), '12.3k')
  assert.strictEqual(formatTokens(3_400_000), '3.4M')
})
