#!/usr/bin/env node
/**
 * check.mjs — dictionary validator for the dsh-locale-ru project (CI contract).
 *
 * Reads:
 *   upstream/corpus.json          { "<ns>": { "<key>": { "en": "...", "zh": "..." } } }
 *   dict/ru/<namespace>.json      { "<key>": "<ru>" }   (dir may not exist yet)
 *
 * Structural violations (exit code 1):
 *   - a ru namespace not present in the upstream corpus
 *   - a ru key not present in that upstream namespace
 *   - a ru value that is not a non-empty string
 *   - placeholder mismatch: every {token} in the en value must appear in the ru
 *     value and vice versa (missing-in-ru and extra-in-ru are both errors)
 * A ru value identical to its en value is a WARNING (probably untranslated).
 * Keys present in the corpus but not yet translated are NOT errors by default.
 *
 * Flags:
 *   --strict         additionally exit 1 when any corpus key is missing
 *   --corpus <path>  override corpus location (default <project>/upstream/corpus.json)
 *   --dict <dir>     override ru dictionary dir (default <project>/dict/ru)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..')

/* ------------------------------------------------------------------ CLI -- */

const argv = process.argv.slice(2)
const hasFlag = (name) => argv.includes(name)
function argValue(flag) {
  const i = argv.indexOf(flag)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined
}

const strict = hasFlag('--strict')
const corpusPath = resolve(argValue('--corpus') ?? join(PROJECT_ROOT, 'upstream', 'corpus.json'))
const dictDir = resolve(argValue('--dict') ?? join(PROJECT_ROOT, 'dict', 'ru'))

const PLACEHOLDER_RE = /\{[^{}]+\}/g
const UNKNOWN = '(unknown)'

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

/* ----------------------------------------------------------------- load -- */

if (!existsSync(corpusPath)) {
  fail(`upstream corpus not found at ${corpusPath} — run scripts/extract.mjs first`)
}
let corpus
try {
  corpus = JSON.parse(readFileSync(corpusPath, 'utf8'))
} catch (err) {
  fail(`upstream corpus is not valid JSON (${corpusPath}): ${err.message}`)
}
if (corpus === null || typeof corpus !== 'object' || Array.isArray(corpus)) {
  fail(`upstream corpus must be an object of namespaces (${corpusPath})`)
}

/** @type {Map<string, object>} ru namespace name -> parsed dict */
const ruDicts = new Map()
/** @type {string[]} namespace files that failed to parse */
const parseFailures = []

if (!existsSync(dictDir) || !statSync(dictDir).isDirectory()) {
  console.log(`note: ru dictionary directory ${dictDir} does not exist yet — nothing translated so far`)
} else {
  const files = readdirSync(dictDir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.json'))
    .map(e => e.name)
    .sort()
  for (const name of files) {
    const ns = name.slice(0, -'.json'.length)
    let parsed
    try {
      parsed = JSON.parse(readFileSync(join(dictDir, name), 'utf8'))
    } catch (err) {
      parseFailures.push(`${ns}: invalid JSON (${err.message})`)
      continue
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      parseFailures.push(`${ns}: dictionary root must be an object`)
      continue
    }
    ruDicts.set(ns, parsed)
  }
}

/* ------------------------------------------------------------- validate -- */

/** @type {string[]} */
const errors = []
/** @type {string[]} */
const warnings = []

for (const failure of parseFailures) errors.push(`dict/ru/${failure}`)

// Track coverage only for ru namespaces known to the corpus.
const coverage = []

for (const [ns, dict] of ruDicts) {
  const upstream = corpus[ns]
  if (upstream === undefined || upstream === null || typeof upstream !== 'object') {
    errors.push(`[${ns}] namespace is not present in the upstream corpus (stale or mistyped file name?)`)
    continue
  }
  let translated = 0
  for (const [key, value] of Object.entries(dict)) {
    const entry = upstream[key]
    if (entry === undefined || entry === null || typeof entry !== 'object') {
      errors.push(`[${ns}] key '${key}' is not present in the upstream corpus (removed or renamed upstream?)`)
      continue
    }
    if (typeof value !== 'string' || value.length === 0) {
      errors.push(`[${ns}] '${key}': ru value must be a non-empty string (got ${value === '' ? "''" : typeof value})`)
      continue
    }
    translated++
    const en = typeof entry.en === 'string' ? entry.en : ''
    const enTokens = new Set(en.match(PLACEHOLDER_RE) ?? [])
    const ruTokens = new Set(value.match(PLACEHOLDER_RE) ?? [])
    const missingInRu = [...enTokens].filter(t => !ruTokens.has(t))
    const extraInRu = [...ruTokens].filter(t => !enTokens.has(t))
    if (missingInRu.length > 0) {
      errors.push(`[${ns}] '${key}': placeholder(s) present in en but missing in ru: ${missingInRu.join(', ')}`)
    }
    if (extraInRu.length > 0) {
      errors.push(`[${ns}] '${key}': placeholder(s) present in ru but not in en: ${extraInRu.join(', ')}`)
    }
    if (missingInRu.length === 0 && extraInRu.length === 0 && value === en) {
      warnings.push(`[${ns}] '${key}': ru value is identical to en (probably untranslated)`)
    }
  }
  coverage.push({ ns, total: Object.keys(upstream).length, translated })
}

// Namespaces that exist upstream but have no ru file yet (reported, not errors).
const untranslated = Object.keys(corpus)
  .filter(ns => !ruDicts.has(ns))
  .sort()

/* ---------------------------------------------------------------- table -- */

const pad = (s, n) => String(s).padEnd(n)
const padStart = (s, n) => String(s).padStart(n)

console.log('ru dictionary coverage vs upstream corpus')
console.log('')
console.log(`  ${pad('namespace', 30)}${padStart('total', 7)}${padStart('translated', 12)}${padStart('coverage', 10)}`)
console.log(`  ${'-'.repeat(59)}`)
const rows = [...coverage].sort((a, b) => a.ns.localeCompare(b.ns))
for (const { ns, total, translated } of rows) {
  const pct = total === 0 ? '100%' : `${Math.floor((translated / total) * 100)}%`
  console.log(`  ${pad(ns, 30)}${padStart(total, 7)}${padStart(translated, 12)}${padStart(pct, 10)}`)
}
if (untranslated.length > 0) {
  for (const ns of untranslated) {
    const total = Object.keys(corpus[ns]).length
    console.log(`  ${pad(ns, 30)}${padStart(total, 7)}${padStart(0, 12)}${padStart('0%', 10)}`)
  }
}
const grandTotal = rows.reduce((acc, r) => acc + r.total, 0)
  + untranslated.reduce((acc, ns) => acc + Object.keys(corpus[ns]).length, 0)
const grandTranslated = rows.reduce((acc, r) => acc + r.translated, 0)
const grandPct = grandTotal === 0 ? '100%' : `${Math.floor((grandTranslated / grandTotal) * 100)}%`
console.log(`  ${'-'.repeat(59)}`)
console.log(`  ${pad('TOTAL', 30)}${padStart(grandTotal, 7)}${padStart(grandTranslated, 12)}${padStart(grandPct, 10)}`)
console.log('')

if (untranslated.length > 0) {
  console.log(`No ru dictionary yet for ${untranslated.length} namespace(s): ${untranslated.join(', ')}`)
  console.log('')
}

if (errors.length > 0) {
  console.log(`Structural violations (${errors.length}):`)
  for (const e of errors) console.log(`  ERROR  ${e}`)
  console.log('')
}
if (warnings.length > 0) {
  console.log(`Warnings (${warnings.length}):`)
  for (const w of warnings) console.log(`  WARN   ${w}`)
  console.log('')
}

const missingCount = grandTotal - grandTranslated
if (strict && missingCount > 0) {
  console.log(`--strict: ${missingCount} corpus key(s) still missing a ru translation.`)
  process.exit(1)
}
if (errors.length > 0) process.exit(1)
console.log('OK: no structural violations.')
