#!/usr/bin/env node
/**
 * extract.mjs — extract the zh/en translation corpus from a deepseek-harness clone.
 *
 * Usage (from the clone root, so tsx from the clone's node_modules is active):
 *
 *   cd /path/to/deepseek-harness && node --import tsx/esm /path/to/dsh-locale-ru/scripts/extract.mjs
 *
 * Strategy:
 *   - Discovery is filesystem-based: walk the clone (source .ts/.tsx only, tests
 *     excluded) and parse every `locale.register(...)` call site.
 *   - Values are read by DYNAMICALLY IMPORTING the dictionary .ts modules through
 *     tsx — exact keys and values, no escaping bugs.
 *   - If a module cannot be imported, dictionary entries fall back to careful
 *     literal parsing of the `export const zh = {...}` text (WARNING emitted).
 *   - Every register() call whose namespace or dictionary cannot be resolved is
 *     reported as a warning in upstream/report.json.
 *
 * Outputs (idempotent, sorted):
 *   <project>/upstream/corpus.json  { "<ns>": { "<key>": { "en": "...", "zh": "..." } } }
 *   <project>/upstream/report.json  per-namespace counts, files, warnings, notes
 *
 * Flags:
 *   --root <dir>   clone root (default: cwd if it looks like the clone, else the
 *                  well-known clone path)
 *   --out <dir>    output directory (default: <project>/upstream)
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..')
const DEFAULT_CLONE = '/Users/sergey/ai/Deepseek/deepseek-harness'

/* ------------------------------------------------------------------ CLI -- */

const argv = process.argv.slice(2)
function argValue(flag) {
  const i = argv.indexOf(flag)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined
}
function looksLikeClone(dir) {
  return existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'packages'))
}

const CLONE_ROOT = resolve(
  argValue('--root')
  ?? (looksLikeClone(process.cwd()) ? process.cwd() : DEFAULT_CLONE),
)
const OUT_DIR = resolve(argValue('--out') ?? join(PROJECT_ROOT, 'upstream'))

if (!looksLikeClone(CLONE_ROOT)) {
  console.error(`error: '${CLONE_ROOT}' does not look like a deepseek-harness clone (missing packages/).`)
  console.error('Run from the clone root or pass --root <clone dir>.')
  process.exit(1)
}

const relToClone = (abs) => relative(CLONE_ROOT, abs).split('\\').join('/')

/* ----------------------------------------------------- lexical helpers -- */

/** Skip a quoted string literal starting at pos (' or "). Returns index after it. */
function skipQuoted(text, pos) {
  const q = text[pos]
  let i = pos + 1
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') { i += 2; continue }
    if (ch === q) return i + 1
    if (ch === '\n') return i + 1 // unterminated; bail at newline
    i++
  }
  return i
}

/** Skip a template literal starting at pos (`), including ${...} groups. */
function skipTemplate(text, pos) {
  let i = pos + 1
  let braceDepth = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') { i += 2; continue }
    if (braceDepth > 0) {
      if (ch === '{') braceDepth++
      else if (ch === '}') braceDepth--
      i++
      continue
    }
    if (ch === '$' && text[i + 1] === '{') { braceDepth = 1; i += 2; continue }
    if (ch === '`') return i + 1
    i++
  }
  return i
}

/** Skip a comment starting at pos ('//' or slash-star). Returns index after it. */
function skipComment(text, pos) {
  if (text[pos + 1] === '/') {
    const nl = text.indexOf('\n', pos + 2)
    return nl === -1 ? text.length : nl + 1
  }
  const end = text.indexOf('*/', pos + 2)
  return end === -1 ? text.length : end + 2
}

/** Advance over whitespace and comments; returns the new index. */
function skipTrivia(text, pos) {
  while (pos < text.length) {
    const ch = text[pos]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { pos++; continue }
    if (ch === '/' && (text[pos + 1] === '/' || text[pos + 1] === '*')) { pos = skipComment(text, pos); continue }
    break
  }
  return pos
}

const OPEN_TO_CLOSE = { '(': ')', '{': '}', '[': ']' }
const CLOSE_BRACKETS = new Set(Object.values(OPEN_TO_CLOSE))

/**
 * Extract the balanced bracket group starting at text[openPos] (one of ( { [),
 * honoring strings, templates and comments. Returns { text, end } or null.
 */
function extractBalanced(text, openPos) {
  const open = text[openPos]
  const close = OPEN_TO_CLOSE[open]
  if (!close) return null
  let depth = 0
  let i = openPos
  while (i < text.length) {
    const ch = text[i]
    if (ch === "'" || ch === '"') { i = skipQuoted(text, i); continue }
    if (ch === '`') { i = skipTemplate(text, i); continue }
    if (ch === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) { i = skipComment(text, i); continue }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return { text: text.slice(openPos, i + 1), end: i + 1 }
    }
    i++
  }
  return null
}

/** Split the inside of a bracket group at top-level separators (default ','). */
function splitTopLevel(inside, sep = ',') {
  const parts = []
  let depth = 0
  let start = 0
  let i = 0
  while (i < inside.length) {
    const ch = inside[i]
    if (ch === "'" || ch === '"') { i = skipQuoted(inside, i); continue }
    if (ch === '`') { i = skipTemplate(inside, i); continue }
    if (ch === '/' && (inside[i + 1] === '/' || inside[i + 1] === '*')) { i = skipComment(inside, i); continue }
    if (OPEN_TO_CLOSE[ch]) depth++
    else if (CLOSE_BRACKETS.has(ch)) depth--
    else if (ch === sep && depth === 0) { parts.push(inside.slice(start, i)); start = i + 1 }
    i++
  }
  parts.push(inside.slice(start))
  return parts.map(p => p.trim()).filter(p => p.length > 0)
}

/** Read a quoted string literal at pos; returns { value, end }. */
function readStringLiteral(text, pos) {
  const q = text[pos]
  if (q !== "'" && q !== '"') throw new Error(`expected quote at: ${truncate(text.slice(pos, pos + 20), 20)}`)
  let i = pos + 1
  let out = ''
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      const n = text[i + 1]
      i += 2
      switch (n) {
        case 'n': out += '\n'; break
        case 't': out += '\t'; break
        case 'r': out += '\r'; break
        case 'b': out += '\b'; break
        case 'f': out += '\f'; break
        case 'v': out += '\v'; break
        case '0': out += '\0'; break
        case 'x': out += String.fromCharCode(parseInt(text.slice(i, i + 2), 16)); i += 2; break
        case 'u':
          if (text[i] === '{') {
            const end = text.indexOf('}', i)
            out += String.fromCodePoint(parseInt(text.slice(i + 1, end), 16))
            i = end + 1
          } else {
            out += String.fromCharCode(parseInt(text.slice(i, i + 4), 16))
            i += 4
          }
          break
        case '\n': break // line continuation
        default: out += n
      }
      continue
    }
    if (ch === q) return { value: out, end: i + 1 }
    if (ch === '\n') break // unterminated
    out += ch
    i++
  }
  throw new Error('unterminated string literal')
}

function truncate(s, n) {
  return s.length <= n ? s : s.slice(0, n) + '…'
}

/* ------------------------------------------------- expression evaluator -- */

const MAX_DEPTH = 32

/**
 * Evaluate a TS/JS expression fragment (object/array literal, string, template,
 * number, identifier or identifier member chain). Identifiers resolve through
 * the file context (imports + local constants), importing modules as needed.
 */
async function evalExpr(expr, ctx, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error('expression nesting too deep')
  let t = expr.trim()
  while (t.endsWith(';')) t = t.slice(0, -1).trimEnd()
  if (t.length === 0) throw new Error('empty expression')
  if (t[0] === "'" || t[0] === '"') return readStringLiteral(t, 0).value
  if (t[0] === '`') return decodeTemplate(t)
  if (t === 'true') return true
  if (t === 'false') return false
  if (t === 'null' || t === 'undefined') return undefined
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  if (t[0] === '{') return evalObjectLiteral(t, ctx, depth)
  if (t[0] === '[') return evalArrayLiteral(t, ctx, depth)

  const idMatch = /^([A-Za-z_$][\w$]*)/.exec(t)
  if (idMatch) {
    let value = await resolveIdentifier(idMatch[1], ctx, depth)
    let pos = idMatch[1].length
    while (pos < t.length) {
      const rest = t.slice(pos)
      let m
      if ((m = /^\s*\.\s*([A-Za-z_$][\w$]*)/.exec(rest))) {
        pos += m[0].length
        value = value == null ? undefined : value[m[1]]
      } else if ((m = /^\s*\[\s*(['"])(?:\\.|(?!\1).)*\1\s*\]/.exec(rest))) {
        const key = readStringLiteral(m[0], m[0].indexOf(m[1])).value
        pos += m[0].length
        value = value == null ? undefined : value[key]
      } else {
        throw new Error(`unsupported expression: ${truncate(t, 80)}`)
      }
      if (value === undefined) throw new Error(`member access resolves to undefined in: ${truncate(t, 80)}`)
    }
    return value
  }
  throw new Error(`unsupported expression: ${truncate(t, 80)}`)
}

/** Cook a substitution-free template literal. */
function decodeTemplate(raw) {
  let i = 1
  let out = ''
  while (i < raw.length) {
    const ch = raw[i]
    if (ch === '\\') {
      const n = raw[i + 1]
      if (n === 'n') out += '\n'
      else if (n === 't') out += '\t'
      else out += n
      i += 2
      continue
    }
    if (ch === '$' && raw[i + 1] === '{') throw new Error(`template substitution unsupported: ${truncate(raw, 60)}`)
    if (ch === '`') return out
    out += ch
    i++
  }
  throw new Error('unterminated template literal')
}

async function evalObjectLiteral(objText, ctx, depth) {
  const inside = objText.slice(1, -1)
  const out = {}
  for (const part of splitTopLevel(inside)) {
    if (part.startsWith('...')) throw new Error(`spread in object literal unsupported: ${truncate(part, 60)}`)
    let key
    let valueText
    let m
    if (part[0] === '[') {
      const bal = extractBalanced(part, 0)
      if (!bal || !/^\s*:/.test(part.slice(bal.end))) throw new Error(`unsupported property: ${truncate(part, 60)}`)
      key = String(await evalExpr(bal.text, ctx, depth + 1))
      valueText = part.slice(bal.end + 1)
    } else if (part[0] === "'" || part[0] === '"') {
      const lit = readStringLiteral(part, 0)
      if (!/^\s*:/.test(part.slice(lit.end))) throw new Error(`unsupported property: ${truncate(part, 60)}`)
      key = lit.value
      valueText = part.slice(lit.end + 1)
    } else if ((m = /^([A-Za-z_$][\w$]*)\s*:/.exec(part))) {
      key = m[1]
      valueText = part.slice(m[0].length)
    } else if (/^[A-Za-z_$][\w$]*$/.test(part)) {
      // shorthand property
      out[part] = await resolveIdentifier(part, ctx, depth + 1)
      continue
    } else {
      throw new Error(`unsupported property: ${truncate(part, 60)}`)
    }
    out[key] = await evalExpr(valueText, ctx, depth + 1)
  }
  return out
}

async function evalArrayLiteral(arrText, ctx, depth) {
  const inside = arrText.slice(1, -1)
  const out = []
  for (const part of splitTopLevel(inside)) {
    if (part.startsWith('...')) throw new Error(`spread in array literal unsupported: ${truncate(part, 60)}`)
    out.push(await evalExpr(part, ctx, depth + 1))
  }
  return out
}

/* ---------------------------------------- module loading and resolution -- */

const SIDE_EFFECT_RE = /\blocale\s*\.\s*register\s*\(|\bctx\s*\.\s*effect\s*\(|\bexport\s+function\s+apply\s*\(/

const moduleCache = new Map()   // cache key -> Promise<module>
const usedModules = new Set()   // absolute paths of dictionary modules consumed
let moduleCapture = null        // per-registration capture set (or null)

function resolveSpecifier(spec, importerFile) {
  if (!spec.startsWith('.')) return null // bare specifier: handled by import(spec)
  const base = resolve(dirname(importerFile), spec)
  const candidates = [base]
  if (base.endsWith('.js')) candidates.push(base.slice(0, -3) + '.ts', base.slice(0, -3) + '.tsx')
  if (base.endsWith('.mjs')) candidates.push(base.slice(0, -4) + '.mts')
  if (!/\.(m?ts|tsx)$/.test(base)) {
    candidates.push(base + '.ts', base + '.tsx', base + '.mts', base + '.js', join(base, 'index.ts'), join(base, 'index.tsx'))
  }
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

/** Import a module referenced by `importerFile`, with a side-effect guard. */
function importModule(spec, importerFile) {
  const resolved = resolveSpecifier(spec, importerFile)
  const key = resolved ?? `bare:${spec}`
  if (moduleCache.has(key)) return moduleCache.get(key)
  const promise = (async () => {
    if (resolved === null) {
      // Bare package specifier: node would resolve it from THIS script's
      // location (outside the clone). Dictionary modules are never
      // bare-imported in this repo, so treat it as best-effort.
      return import(spec)
    }
    const text = readFileSync(resolved, 'utf8')
    if (SIDE_EFFECT_RE.test(text)) {
      throw new Error(`refusing to import side-effectful module '${relToClone(resolved)}'`)
    }
    const mod = await import(pathToFileURL(resolved).href)
    usedModules.add(resolved)
    if (moduleCapture) moduleCapture.add(resolved)
    markReexportTargets(resolved)
    return mod
  })()
  const guarded = promise.catch((err) => {
    moduleCache.delete(key)
    err.message = `import failed for '${spec}' (from ${relToClone(importerFile)}): ${err.message}`
    throw err
  })
  moduleCache.set(key, guarded)
  return guarded
}

/** Mark modules reachable through `export ... from '...'` re-exports as used. */
function markReexportTargets(absPath, depth = 0) {
  if (depth > 4) return
  const text = readFileSync(absPath, 'utf8')
  const re = /(?:^|\n)\s*export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s*from\s*(['"])([^'"]+)\1/g
  for (const m of text.matchAll(re)) {
    const target = resolveSpecifier(m[2], absPath)
    if (target && !usedModules.has(target)) {
      usedModules.add(target)
      if (moduleCapture) moduleCapture.add(target)
      markReexportTargets(target, depth + 1)
    }
  }
}

/** Per-file context: import map + local constant definitions. */
function makeContext(file, text) {
  return {
    file,
    importMap: collectImportMap(text),
    localConsts: collectLocalConsts(text),
    localCache: new Map(),
  }
}

/** Map of local binding name -> { source, imported }. */
function collectImportMap(text) {
  const map = new Map()
  const re = /(?:^|\n)\s*import\s+([\s\S]*?)\s*from\s*(['"])([^'"]+)\2/g
  for (const m of text.matchAll(re)) {
    if (/^import\s+type\b/.test(m[0].trim())) continue
    const clause = m[1].trim()
    const source = m[3]
    const braceStart = clause.indexOf('{')
    if (braceStart === -1) {
      const ns = /^\*\s+as\s+([A-Za-z_$][\w$]*)$/.exec(clause)
      if (ns) map.set(ns[1], { source, imported: '*' })
      else {
        const def = /^([A-Za-z_$][\w$]*)$/.exec(clause)
        if (def) map.set(def[1], { source, imported: 'default' })
      }
      continue
    }
    const braceEnd = clause.indexOf('}', braceStart)
    if (braceEnd === -1) continue
    const before = clause.slice(0, braceStart).trim().replace(/,$/, '')
    const def = /^([A-Za-z_$][\w$]*)$/.exec(before)
    if (def) map.set(def[1], { source, imported: 'default' })
    const inside = clause.slice(braceStart + 1, braceEnd)
    for (let item of inside.split(',')) {
      item = item.trim()
      if (!item || /^type\s/.test(item)) continue
      const aliased = /^(.+?)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(item)
      if (aliased) map.set(aliased[2], { source, imported: aliased[1].trim() })
      else map.set(item, { source, imported: item })
    }
  }
  return map
}

/** Map of local const name -> literal initializer ({ kind, value?, text? }). */
function collectLocalConsts(text) {
  const map = new Map()
  const re = /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*/g
  for (const m of text.matchAll(re)) {
    const i = skipTrivia(text, m.index + m[0].length)
    try {
      if (text[i] === "'" || text[i] === '"') {
        const lit = readStringLiteral(text, i)
        map.set(m[1], { kind: 'value', value: lit.value })
      } else if (text[i] === '{' || text[i] === '[') {
        const bal = extractBalanced(text, i)
        if (bal) map.set(m[1], { kind: 'expr', text: bal.text })
      }
    } catch { /* not a literal initializer */ }
  }
  return map
}

async function resolveIdentifier(name, ctx, depth) {
  const imp = ctx.importMap.get(name)
  if (imp) {
    const mod = await importModule(imp.source, ctx.file)
    if (imp.imported === '*') return mod
    const value = mod[imp.imported]
    if (value === undefined) {
      throw new Error(`module '${imp.source}' has no export '${imp.imported}' (imported as '${name}')`)
    }
    return value
  }
  const local = ctx.localConsts.get(name)
  if (local) {
    if (ctx.localCache.has(name)) return ctx.localCache.get(name)
    if (local.kind === 'value') {
      ctx.localCache.set(name, local.value)
      return local.value
    }
    const value = await evalExpr(local.text, ctx, depth + 1)
    ctx.localCache.set(name, value)
    return value
  }
  throw new Error(`cannot resolve identifier '${name}'`)
}

/* -------------------------------------------------- discovery & parsing -- */

const SOURCE_EXT_RE = /\.(m?ts|tsx)$/
const DTS_RE = /\.d\.ts$/
const TEST_PATH_RE = /(^|\/)(tests?|__tests__|fixtures|mocks?|testing)(\/|$)|\.(spec|test|stories|bench)\.[cm]?[jt]sx?$/
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.turbo', '.cache',
  '.next', 'snapshots', '__pycache__', 'target', '.venv', 'test-results',
])

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(abs, out)
    } else if (entry.isFile()) {
      if (SOURCE_EXT_RE.test(entry.name) && !DTS_RE.test(entry.name)) out.push(abs)
    }
  }
  return out
}

const REGISTER_RE = /\blocale\s*\.\s*register\s*\(/g

function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++
  return line
}

/* ---------------------------------------------------------- main flow -- */

const warnings = []
const notes = []
const corpus = {}            // ns -> { key -> { locale -> value } }
const nsRegisterFiles = {}   // ns -> Set of registering files
const nsDictFiles = {}       // ns -> Set of dictionary module files

function warn(message) {
  warnings.push(message)
}
function note(message) {
  notes.push(message)
}

function addEntries(ns, locale, entries, file, line) {
  if (typeof locale !== 'string' || locale.length === 0) {
    warn(`[${relToClone(file)}:${line}] locale id is not a string; skipping`)
    return
  }
  if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) {
    warn(`[${relToClone(file)}:${line}] dictionary for locale '${locale}' is not an object; skipping`)
    return
  }
  corpus[ns] ??= {}
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value !== 'string') {
      if (value === undefined || value === null || typeof value === 'object') {
        warn(`[${relToClone(file)}:${line}] ${ns}/${key}: non-scalar value (${typeof value}); skipped`)
        continue
      }
      warn(`[${relToClone(file)}:${line}] ${ns}/${key}: non-string value (${typeof value}); coerced with String()`)
    }
    const v = typeof value === 'string' ? value : String(value)
    corpus[ns][key] ??= {}
    if (corpus[ns][key][locale] !== undefined && corpus[ns][key][locale] !== v) {
      warn(`[${relToClone(file)}:${line}] ${ns}/${key}[${locale}]: conflicting duplicate value; keeping the first`)
      continue
    }
    corpus[ns][key][locale] = v
  }
}

function recordFiles(ns, registerFile) {
  nsRegisterFiles[ns] ??= new Set()
  nsRegisterFiles[ns].add(registerFile)
  if (moduleCapture && moduleCapture.size > 0) {
    nsDictFiles[ns] ??= new Set()
    for (const f of moduleCapture) nsDictFiles[ns].add(f)
  }
}

/**
 * Parse one register call's arguments and merge its dictionaries.
 * Returns true when the call was fully resolved.
 */
async function processRegistration(file, text, ctx, matchIndex, args) {
  const line = lineOf(text, matchIndex)
  const relFile = relToClone(file)
  moduleCapture = new Set()
  try {
    if (args.length === 2) {
      const [nsExpr, dictExpr] = args
      let ns
      try {
        ns = await evalExpr(nsExpr, ctx)
      } catch (err) {
        warn(`[${relFile}:${line}] unresolved namespace (${err.message}); register call not extracted`)
        return false
      }
      if (typeof ns !== 'string' || ns.length === 0) {
        warn(`[${relFile}:${line}] namespace expression is not a string literal: ${truncate(nsExpr, 60)}`)
        return false
      }
      let dict
      try {
        dict = await evalExpr(dictExpr, ctx)
      } catch (err) {
        warn(`[${relFile}:${line}] ns '${ns}': unresolved dictionary object (${err.message})`)
        return false
      }
      if (dict === null || typeof dict !== 'object' || Array.isArray(dict)) {
        warn(`[${relFile}:${line}] ns '${ns}': dictionary argument is not an object literal`)
        return false
      }
      for (const [locale, entries] of Object.entries(dict)) {
        addEntries(ns, locale, entries, file, line)
      }
      recordFiles(ns, file)
      return true
    }

    if (args.length === 3) {
      const [nsExpr, localeExpr, dictExpr] = args
      let ns
      try {
        ns = await evalExpr(nsExpr, ctx)
      } catch (err) {
        warn(`[${relFile}:${line}] unresolved namespace (${err.message}); register call not extracted`)
        return false
      }
      if (typeof ns !== 'string' || ns.length === 0) {
        warn(`[${relFile}:${line}] namespace expression is not a string literal: ${truncate(nsExpr, 60)}`)
        return false
      }
      let locale
      try {
        locale = await evalExpr(localeExpr, ctx)
      } catch { locale = undefined }

      if (typeof locale === 'string') {
        let entries
        try {
          entries = await evalExpr(dictExpr, ctx)
        } catch (err) {
          warn(`[${relFile}:${line}] ns '${ns}': unresolved dictionary for locale '${locale}' (${err.message})`)
          return false
        }
        addEntries(ns, locale, entries, file, line)
        recordFiles(ns, file)
        return true
      }

      // Loop form, e.g. `for (const [locale, dict] of dictionaries) register(NS, locale, dict)`.
      const pairs = findInlineDictionaryArrays(text).flatMap(candidate => candidate.pairs)
      if (pairs.length > 0) {
        for (const { locale: loc, objText } of pairs) {
          try {
            const entries = await evalExpr(objText, ctx)
            addEntries(ns, loc, entries, file, line)
          } catch (err) {
            warn(`[${relFile}:${line}] ns '${ns}': inline dictionary for locale '${loc}' failed to parse (${err.message})`)
          }
        }
        note(`[${relFile}:${line}] ns '${ns}': dictionaries resolved from an inline [locale, dict][] array (loop-form register call)`)
        recordFiles(ns, file)
        return true
      }
      warn(`[${relFile}:${line}] ns '${ns}': 3-argument register with dynamic locale and no resolvable dictionary array`)
      return false
    }

    warn(`[${relFile}:${line}] unexpected register signature with ${args.length} arguments; skipping`)
    return false
  } finally {
    moduleCapture = null
  }
}

/** Find `const x: ... = [['zh', {...}], ['en', {...}]]` inline dictionary arrays. */
function findInlineDictionaryArrays(text) {
  const arrays = []
  const re = /(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)[^=;\n]*=\s*/g
  for (const m of text.matchAll(re)) {
    const open = skipTrivia(text, m.index + m[0].length)
    if (text[open] !== '[') continue
    const bal = extractBalanced(text, open)
    if (!bal) continue
    const parts = splitTopLevel(bal.text.slice(1, -1))
    if (parts.length === 0) continue
    const pairs = []
    let ok = true
    for (const part of parts) {
      const pm = /^\[\s*(['"])(?:\\.|(?!\1).)*\1\s*,\s*\{[\s\S]*\}\s*\]$/.exec(part)
      if (!pm) { ok = false; break }
      const litStart = part.indexOf(pm[1])
      const lit = readStringLiteral(part, litStart)
      const braceAt = part.indexOf('{', lit.end)
      const objBal = extractBalanced(part, braceAt)
      if (!objBal) { ok = false; break }
      pairs.push({ locale: lit.value, objText: objBal.text })
    }
    if (ok && pairs.length > 0) arrays.push({ name: m[1], pairs })
  }
  return arrays
}

/** Regex fallback for a dictionary module that cannot be imported. */
async function fallbackParseDictModule(absPath) {
  const text = readFileSync(absPath, 'utf8')
  const ctx = makeContext(absPath, text)
  const out = {}
  for (const m of text.matchAll(/\bexport\s+const\s+(zh|en)\b/g)) {
    const name = m[1]
    const eq = skipTrivia(text, m.index + m[0].length)
    if (text[eq] !== '{') continue
    const bal = extractBalanced(text, eq)
    if (!bal) continue
    out[name] = await evalExpr(bal.text, ctx)
  }
  return out
}

/* -------------------------------------------------------------- runner -- */

const allFiles = walk(CLONE_ROOT).filter((f) => {
  const rel = '/' + relToClone(f)
  return !TEST_PATH_RE.test(rel)
})

// Baseline: every source file exporting a zh/en dictionary (for the orphan check).
const dictBaselineFiles = new Set()
for (const f of allFiles) {
  const text = readFileSync(f, 'utf8')
  if (/\bexport\s+const\s+(zh|en)\b/.test(text)) dictBaselineFiles.add(f)
}

let registerSites = 0
let resolvedSites = 0

for (const file of allFiles) {
  const text = readFileSync(file, 'utf8')
  REGISTER_RE.lastIndex = 0
  const matches = [...text.matchAll(REGISTER_RE)]
  if (matches.length === 0) continue
  const ctx = makeContext(file, text)
  for (const m of matches) {
    registerSites++
    const openParen = text.indexOf('(', m.index + m[0].length - 1)
    const bal = extractBalanced(text, openParen)
    if (!bal) {
      warn(`[${relToClone(file)}:${lineOf(text, m.index)}] unbalanced register(...) arguments; skipping`)
      continue
    }
    const args = splitTopLevel(bal.text.slice(1, -1))
    if (await processRegistration(file, text, ctx, m.index, args)) resolvedSites++
  }
}

// Orphan check: dictionary files never consumed through a resolved register call.
for (const f of dictBaselineFiles) {
  if (usedModules.has(f)) continue
  // Try the regex fallback to confirm the file really is a dictionary.
  let parses = false
  try {
    const parsed = await fallbackParseDictModule(f)
    parses = Object.keys(parsed).length > 0
  } catch { parses = false }
  if (parses) {
    warn(`dictionary file '${relToClone(f)}' exports zh/en but was never resolved through any register() call — verify discovery`)
  } else {
    warn(`file '${relToClone(f)}' exports zh/en but could not be parsed, and no register() call references it`)
  }
}

/* -------------------------------------------------------------- output -- */

const sortedNs = Object.keys(corpus).sort()
const sortedCorpus = {}
for (const ns of sortedNs) {
  const entry = {}
  for (const key of Object.keys(corpus[ns]).sort()) {
    const locales = corpus[ns][key]
    const fixed = {}
    if (locales.en !== undefined) fixed.en = locales.en
    if (locales.zh !== undefined) fixed.zh = locales.zh
    for (const loc of Object.keys(locales).sort()) {
      if (loc !== 'en' && loc !== 'zh') fixed[loc] = locales[loc]
    }
    entry[key] = fixed
  }
  sortedCorpus[ns] = entry
}

const nsReport = {}
let totalKeys = 0
for (const ns of sortedNs) {
  const keys = Object.keys(sortedCorpus[ns]).length
  totalKeys += keys
  const files = new Set([...(nsRegisterFiles[ns] ?? []), ...(nsDictFiles[ns] ?? [])])
  nsReport[ns] = {
    keys,
    files: [...files].map(relToClone).sort(),
  }
}

const report = {
  totals: { namespaces: sortedNs.length, keys: totalKeys, warnings: warnings.length, notes: notes.length },
  namespaces: nsReport,
  warnings: [...warnings].sort(),
  notes: [...notes].sort(),
}

mkdirSync(OUT_DIR, { recursive: true })
const corpusPath = join(OUT_DIR, 'corpus.json')
const reportPath = join(OUT_DIR, 'report.json')
writeFileSync(corpusPath, JSON.stringify(sortedCorpus, null, 2) + '\n')
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')

/* ------------------------------------------------------------- summary -- */

console.log('deepseek-harness translation corpus extraction')
console.log(`  clone:   ${CLONE_ROOT}`)
console.log(`  output:  ${corpusPath}`)
console.log('')
console.log('  namespace                                 keys  source files')
console.log(`  ${'-'.repeat(110)}`)
for (const ns of sortedNs) {
  const { keys, files } = nsReport[ns]
  console.log(`  ${ns.padEnd(41)}${String(keys).padStart(5)}  ${files[0] ?? ''}`)
  for (const f of files.slice(1)) console.log(`  ${' '.repeat(41)}${' '.repeat(5)}  ${f}`)
}
console.log(`  ${'-'.repeat(110)}`)
console.log(`  ${'TOTAL'.padEnd(41)}${String(totalKeys).padStart(5)}  ${sortedNs.length} namespace(s) · ${registerSites} register call(s) · ${resolvedSites} resolved`)
console.log('')

if (notes.length > 0) {
  console.log(`Notes (${notes.length}):`)
  for (const n of notes) console.log(`  - ${n}`)
  console.log('')
}
if (warnings.length > 0) {
  console.log(`Warnings (${warnings.length}):`)
  for (const w of warnings) console.log(`  - ${w}`)
  console.log('')
}
if (totalKeys < 800) {
  console.log(`WARNING: total key count (${totalKeys}) is below the expected ~1200-1500; discovery may have missed files.`)
}
