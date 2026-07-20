const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { scanProjects, searchProjects } = require('../lib/projects')

function makeRoot(dirs, files = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-pets-scan-'))
  for (const d of dirs) fs.mkdirSync(path.join(root, d), { recursive: true })
  for (const f of files) fs.writeFileSync(path.join(root, f), '')
  return root
}

test('scans directories, skipping hidden, node_modules and worktrees', () => {
  const root = makeRoot(
    ['alpha', 'beta', '.hidden', 'node_modules', 'alpha.worktrees'],
    ['some-file.txt']
  )
  const projects = scanProjects([root])
  assert.deepStrictEqual(projects.map((p) => p.name), ['alpha', 'beta'])
  assert.strictEqual(projects[0].path, path.join(root, 'alpha'))
})

test('merges multiple roots, dedupes and ignores missing roots', () => {
  const a = makeRoot(['proj1'])
  const b = makeRoot(['proj2'])
  const projects = scanProjects([a, b, a, '/no/such/root'])
  assert.deepStrictEqual(projects.map((p) => p.name), ['proj1', 'proj2'])
})

test('search ranks prefix matches before substring matches', () => {
  const projects = [
    { name: 'acme-suite-storage', path: '/a' },
    { name: 'storage-utils', path: '/b' },
    { name: 'unrelated', path: '/c' },
  ]
  const result = searchProjects(projects, 'stor')
  assert.deepStrictEqual(result.map((p) => p.name), ['storage-utils', 'acme-suite-storage'])
})

test('empty query returns everything', () => {
  const projects = [{ name: 'x', path: '/x' }]
  assert.strictEqual(searchProjects(projects, '  ').length, 1)
})
