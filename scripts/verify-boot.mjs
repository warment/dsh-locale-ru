/**
 * Spike verification: confirm the deepseek-harness-locale-ru browser half made it into the
 * web boot graph and is served to the browser.
 *
 * Usage: node scripts/verify-boot.mjs <token> [port]
 */
const token = process.argv[2]
if (!token) {
  console.error('usage: node scripts/verify-boot.mjs <token> [port]')
  process.exit(2)
}
const port = process.argv[3] ?? '3080'
const base = `http://127.0.0.1:${port}`

// Step 1: exchange the launch token for the session cookie (303 + set-cookie).
const first = await fetch(`${base}/?token=${token}`, { redirect: 'manual' })
const setCookie = first.headers.get('set-cookie') ?? ''
const cookie = setCookie.split(';')[0]
console.log('token exchange status:', first.status, '| cookie minted:', cookie !== '')
const authHeaders = cookie ? { cookie } : {}

// Step 2: fetch the index with the cookie.
const html = await fetch(`${base}/`, { headers: authHeaders }).then((r) => r.text())
console.log('index length:', html.length)
console.log('boot graph mentions deepseek-harness-locale-ru:', html.includes('deepseek-harness-locale-ru'))

// Step 3: collect plugin script URLs (href/src attributes), unescape HTML entities.
const urls = [...html.matchAll(/(?:href|src)="(\/plugins\/[^"]+)"/g)].map((m) => m[1].replaceAll('&amp;', '&'))
console.log('plugin script urls:', urls.length)

// Step 4: fetch each combo, look for our module body.
let served = false
for (const url of urls) {
  const response = await fetch(`${base}${url}`, { headers: authHeaders })
  if (!response.ok) continue
  const body = await response.text()
  if (body.includes('deepseek-harness-locale-ru')) {
    served = true
    console.log('combo OK:', url.slice(0, 100), `(${body.length} bytes)`)
    console.log('contains "Русский" label:', body.includes('Русский'))
    console.log('contains addLanguage call:', body.includes('addLanguage'))
    console.log('registers ru common keys:', body.includes("'Отмена'") || body.includes('"Отмена"'))
    // The browser loads the combo as a classic script; a parse failure kills
    // the whole boot, so check the bundle actually parses.
    try {
      new Function(body)
      console.log('combo parses as classic script: true')
    } catch (error) {
      served = false
      console.log('combo parses as classic script: FALSE —', error.message)
    }
    break
  }
}
console.log('served to browser:', served)

if (html.includes('deepseek-harness-locale-ru') && served) {
  console.log('SPIKE OK: locale pack reaches the browser boot graph')
} else {
  console.log('SPIKE INCOMPLETE: see flags above')
  process.exit(1)
}
