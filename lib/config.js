const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DEFAULT_EMOJIS = ['🐱', '🦊', '🐶', '🐹', '🐸', '🐧', '🦉', '🐢', '🐰', '🐯']

function expandHome(p) {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

function normalizePet(raw, index, configDir) {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) {
    throw new Error(`pets[${index}]: "name" is required`)
  }
  if (typeof raw.project !== 'string' || !raw.project.trim()) {
    throw new Error(`pets[${index}] (${raw.name}): "project" is required`)
  }
  const pet = {
    name: raw.name.trim(),
    project: path.resolve(expandHome(raw.project.trim())),
    emoji: raw.emoji || DEFAULT_EMOJIS[index % DEFAULT_EMOJIS.length],
    scale: typeof raw.scale === 'number' && raw.scale > 0 ? raw.scale : 1,
    speed: typeof raw.speed === 'number' && raw.speed > 0 ? raw.speed : 1,
    command: typeof raw.command === 'string' && raw.command.trim() ? raw.command.trim() : 'claude',
    image: null,
  }
  if (typeof raw.image === 'string' && raw.image.trim()) {
    const resolved = path.resolve(configDir, expandHome(raw.image.trim()))
    pet.image = fs.existsSync(resolved) ? resolved : null
    if (!pet.image) pet.imageMissing = resolved
  }
  return pet
}

// Config file accepts two shapes:
//   [ ...pets ]                                       (legacy)
//   { "pets": [...], "searchRoots": [...], "defaultCommand": "claude" }
function loadPets(configPath) {
  const pets = []
  const errors = []
  const base = { pets, errors, searchRoots: null, defaultCommand: 'claude' }
  let raw
  try {
    raw = fs.readFileSync(configPath, 'utf8')
  } catch (err) {
    return { ...base, errors: [`cannot read ${configPath}: ${err.message}`] }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return { ...base, errors: [`invalid JSON in ${configPath}: ${err.message}`] }
  }

  let petList
  if (Array.isArray(parsed)) {
    petList = parsed
  } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.pets)) {
    petList = parsed.pets
    if (Array.isArray(parsed.searchRoots) && parsed.searchRoots.length > 0) {
      base.searchRoots = parsed.searchRoots
        .filter((r) => typeof r === 'string' && r.trim())
        .map((r) => expandHome(r.trim()))
    }
    if (typeof parsed.defaultCommand === 'string' && parsed.defaultCommand.trim()) {
      base.defaultCommand = parsed.defaultCommand.trim()
    }
  } else {
    return { ...base, errors: [`${configPath} must be a pets array or { pets: [...] }`] }
  }

  const configDir = path.dirname(configPath)
  petList.forEach((entry, i) => {
    try {
      pets.push(normalizePet(entry, i, configDir))
    } catch (err) {
      errors.push(err.message)
    }
  })
  return base
}

module.exports = { loadPets, normalizePet }
