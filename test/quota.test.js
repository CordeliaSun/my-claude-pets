const { test } = require('node:test')
const assert = require('node:assert')
const { parseQuota } = require('../lib/quota')

const SAMPLE = {
  five_hour: { utilization: 8.0 },
  limits: [
    { kind: 'session', group: 'session', percent: 8, resets_at: '2026-07-20T09:40:00+00:00', scope: null },
    { kind: 'weekly_all', group: 'weekly', percent: 7, resets_at: '2026-07-21T00:00:00+00:00', scope: null },
    {
      kind: 'weekly_scoped',
      group: 'weekly',
      percent: 13,
      resets_at: '2026-07-21T00:00:00+00:00',
      scope: { model: { id: null, display_name: 'Fable' }, surface: null },
    },
  ],
}

test('parses official limits with labels', () => {
  const quota = parseQuota(SAMPLE)
  assert.strictEqual(quota.limits.length, 3)
  assert.deepStrictEqual(quota.limits.map((l) => l.label), ['5h', '주간', 'Fable'])
  assert.deepStrictEqual(quota.limits.map((l) => l.percent), [8, 7, 13])
  assert.ok(quota.limits[0].resetsAt)
})

test('drops entries without a numeric percent', () => {
  const quota = parseQuota({ limits: [{ kind: 'session', percent: null }, { kind: 'weekly_all', percent: 3 }] })
  assert.strictEqual(quota.limits.length, 1)
  assert.strictEqual(quota.limits[0].kind, 'weekly_all')
})

test('returns null for malformed or empty payloads', () => {
  assert.strictEqual(parseQuota(null), null)
  assert.strictEqual(parseQuota({}), null)
  assert.strictEqual(parseQuota({ limits: [] }), null)
  assert.strictEqual(parseQuota({ limits: [{ kind: 'session', percent: null }] }), null)
})
