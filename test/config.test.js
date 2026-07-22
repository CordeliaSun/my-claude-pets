const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadPets, normalizePet } = require('../lib/config')

function tmpConfig(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-pets-'))
  const file = path.join(dir, 'pets.json')
  fs.writeFileSync(file, content)
  return { dir, file }
}

test('loads valid pets and applies defaults', () => {
  const { dir, file } = tmpConfig('[]')
  fs.writeFileSync(file, JSON.stringify([{ name: 'demo', project: dir }]))
  const { pets, errors } = loadPets(file)
  assert.strictEqual(errors.length, 0)
  assert.strictEqual(pets.length, 1)
  assert.strictEqual(pets[0].name, 'demo')
  assert.strictEqual(pets[0].scale, 1)
  assert.strictEqual(pets[0].speed, 1)
  assert.strictEqual(pets[0].command, 'claude')
  assert.strictEqual(typeof pets[0].emoji, 'string')
})

test('expands ~ in project path', () => {
  const { file } = tmpConfig(JSON.stringify([
    { name: 'home', project: '~/Desktop' },
  ]))
  const { pets } = loadPets(file)
  assert.strictEqual(pets[0].project, path.join(os.homedir(), 'Desktop'))
})

test('skips entries missing name or project, with reasons', () => {
  const { dir, file } = tmpConfig('[]')
  fs.writeFileSync(file, JSON.stringify([
    { project: dir },
    { name: 'no-project' },
    { name: 'ok', project: dir },
  ]))
  const { pets, errors } = loadPets(file)
  assert.strictEqual(pets.length, 1)
  assert.strictEqual(pets[0].name, 'ok')
  assert.strictEqual(errors.length, 2)
  assert.match(errors[0], /name/)
  assert.match(errors[1], /project/)
})

test('missing config file returns error, not throw', () => {
  const { pets, errors } = loadPets('/nonexistent/pets.json')
  assert.strictEqual(pets.length, 0)
  assert.strictEqual(errors.length, 1)
})

test('invalid JSON returns error, not throw', () => {
  const { file } = tmpConfig('not json {')
  const { pets, errors } = loadPets(file)
  assert.strictEqual(pets.length, 0)
  assert.strictEqual(errors.length, 1)
})

test('config must be an array or an object with pets', () => {
  const { file } = tmpConfig(JSON.stringify({ name: 'x' }))
  const { errors } = loadPets(file)
  assert.strictEqual(errors.length, 1)
})

test('object config carries searchRoots and defaultCommand', () => {
  const { dir, file } = tmpConfig('[]')
  fs.writeFileSync(file, JSON.stringify({
    searchRoots: ['~/Projects', dir],
    defaultCommand: 'claude --continue',
    pets: [{ name: 'ok', project: dir }],
  }))
  const result = loadPets(file)
  assert.strictEqual(result.pets.length, 1)
  assert.strictEqual(result.defaultCommand, 'claude --continue')
  assert.deepStrictEqual(result.searchRoots, [path.join(os.homedir(), 'Projects'), dir])
})

test('array config keeps defaults for roots and command', () => {
  const { dir, file } = tmpConfig('[]')
  fs.writeFileSync(file, JSON.stringify([{ name: 'ok', project: dir }]))
  const result = loadPets(file)
  assert.strictEqual(result.searchRoots, null)
  assert.strictEqual(result.defaultCommand, 'claude')
})

test('image path resolves relative to config directory', () => {
  const { dir, file } = tmpConfig('[]')
  fs.mkdirSync(path.join(dir, 'images'))
  fs.writeFileSync(path.join(dir, 'images', 'cat.png'), 'x')
  fs.writeFileSync(file, JSON.stringify([
    { name: 'img', project: dir, image: './images/cat.png' },
  ]))
  const { pets } = loadPets(file)
  assert.strictEqual(pets[0].image, path.join(dir, 'images/cat.png'))
})

test('balloonImage resolves like image and is null when missing', () => {
  const { dir, file } = tmpConfig('[]')
  fs.mkdirSync(path.join(dir, 'images'))
  fs.writeFileSync(path.join(dir, 'images', 'balloon.png'), 'x')
  fs.writeFileSync(file, JSON.stringify([
    { name: 'a', project: dir, balloonImage: './images/balloon.png' },
    { name: 'b', project: dir, balloonImage: './images/nope.png' },
    { name: 'c', project: dir },
  ]))
  const { pets } = loadPets(file)
  assert.strictEqual(pets[0].balloonImage, path.join(dir, 'images/balloon.png'))
  assert.strictEqual(pets[1].balloonImage, null)
  assert.strictEqual(pets[2].balloonImage, null)
})

test('each pet gets a distinct default emoji', () => {
  const a = normalizePet({ name: 'a', project: '/tmp' }, 0, '/tmp')
  const b = normalizePet({ name: 'b', project: '/tmp' }, 1, '/tmp')
  assert.notStrictEqual(a.emoji, b.emoji)
})
