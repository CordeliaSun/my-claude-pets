const { test } = require('node:test')
const assert = require('node:assert')
const { buildOsascriptArgs } = require('../lib/iterm')

test('builds osascript args with project path and command as argv', () => {
  const args = buildOsascriptArgs('/Users/me/Desktop/my proj', 'claude')
  assert.strictEqual(args[0], '-e')
  const script = args[1]
  assert.match(script, /tell application "iTerm"/)
  assert.match(script, /quoted form of \(item 1 of argv\)/)
  // path and command are passed as argv, never interpolated into the script
  assert.ok(!script.includes('/Users/me'))
  assert.deepStrictEqual(args.slice(2), ['/Users/me/Desktop/my proj', 'claude'])
})

test('command with quotes stays out of the script body', () => {
  const args = buildOsascriptArgs('/tmp', `claude "do stuff"; rm -rf /`)
  assert.ok(!args[1].includes('rm -rf'))
  assert.strictEqual(args[3], `claude "do stuff"; rm -rf /`)
})

test('tab mode creates a tab in the current window, with empty-window fallback', () => {
  const args = buildOsascriptArgs('/tmp', 'claude', 'tab')
  assert.match(args[1], /create tab with default profile/)
  assert.match(args[1], /count of windows\) = 0/)
  assert.deepStrictEqual(args.slice(2), ['/tmp', 'claude'])
})

test('window mode is the default', () => {
  assert.match(buildOsascriptArgs('/tmp', 'claude')[1], /create window with default profile/)
  assert.ok(!buildOsascriptArgs('/tmp', 'claude')[1].includes('create tab'))
})
