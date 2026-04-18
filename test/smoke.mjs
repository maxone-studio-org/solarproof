#!/usr/bin/env node
/**
 * SolarProof Smoke-Tests — post-deploy liveness check.
 *
 * Führt ALLE kritischen User-Flows durch. Exit 0 wenn alles grün, exit 1 sonst.
 * Muss laufen BEVOR "ist live" gesagt wird — Regel aus Inzident 2026-04-17.
 *
 * Run: npm run test:smoke
 */
import process from 'node:process'

const SITE = process.env.SITE || 'https://solarproof.voltfair.de'
const VECTOR = process.env.VECTOR || 'https://agent.maxone.one'
const SUPABASE = process.env.SUPABASE || 'https://panel.maxone.one'
const FEEDBACK_TABLE = 'solarproof_feedback'
const TIMEOUT = 15000

const results = []
function pass(name, detail = '') { results.push({ name, ok: true, detail }) }
function fail(name, detail) { results.push({ name, ok: false, detail }) }
function skip(name, detail) { results.push({ name, ok: true, skipped: true, detail }) }

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

// ─── 1. Site selbst ──────────────────────────────────────────
async function testSite() {
  try {
    const r = await fetchWithTimeout(SITE + '/')
    if (r.status !== 200) return fail('site-reachable', `HTTP ${r.status}`)
    pass('site-reachable', `HTTP 200`)
    const html = await r.text()
    // Widget-Tag eingebaut?
    if (!/<vector-chat[\s>]/.test(html)) return fail('site-has-widget-tag', 'kein <vector-chat> Element im HTML')
    pass('site-has-widget-tag')
    // Widget-Script lädt die .one URL (nicht veraltetes .studio)
    if (!/agent\.maxone\.one\/widget\/vector-chat\.js/.test(html)) return fail('site-widget-url', 'Widget-Script-URL zeigt nicht auf agent.maxone.one')
    if (/agent\.maxone\.studio/.test(html)) return fail('site-no-studio-refs', 'Seite enthält noch .studio-URLs')
    pass('site-widget-url')
    pass('site-no-studio-refs')
  } catch (e) {
    fail('site-reachable', e.message)
  }
}

// ─── 2. Widget-JS ───────────────────────────────────────────
async function testWidget() {
  try {
    const r = await fetchWithTimeout(VECTOR + '/widget/vector-chat.js')
    if (r.status !== 200) return fail('widget-served', `HTTP ${r.status}`)
    const js = await r.text()
    if (js.length < 10_000) return fail('widget-served', `zu klein: ${js.length} bytes`)
    pass('widget-served', `${js.length} bytes`)
    if (/agent\.maxone\.studio/.test(js)) return fail('widget-no-studio', '.studio URLs im Widget-JS')
    if (!/agent\.maxone\.one/.test(js)) return fail('widget-one-url', 'kein .one Endpoint im Widget-JS')
    pass('widget-no-studio')
    pass('widget-one-url')
    // Action-Handler drin? (feature-check)
    if (!/open_feedback|handleAction/.test(js)) fail('widget-has-action-handler', 'handleAction oder open_feedback nicht gefunden')
    else pass('widget-has-action-handler')
  } catch (e) {
    fail('widget-served', e.message)
  }
}

// ─── 3. CORS Preflight ──────────────────────────────────────
async function testCors() {
  try {
    const r = await fetchWithTimeout(VECTOR + '/chat', {
      method: 'OPTIONS',
      headers: {
        'Origin': SITE,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    })
    const allowOrigin = r.headers.get('access-control-allow-origin')
    if (!allowOrigin || allowOrigin !== SITE) {
      return fail('cors-preflight', `erwartet "${SITE}", bekommen: "${allowOrigin}"`)
    }
    pass('cors-preflight', allowOrigin)
  } catch (e) {
    fail('cors-preflight', e.message)
  }
}

// ─── 4. Chat-Endpoint ───────────────────────────────────────
async function testChat() {
  try {
    const r = await fetchWithTimeout(VECTOR + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': SITE },
      body: JSON.stringify({
        message: 'smoke-test ping',
        sessionId: 'smoke-test-' + Date.now(),
        instance: 'solarproof',
      }),
    })
    if (r.status !== 200) return fail('chat-endpoint', `HTTP ${r.status}`)
    const data = await r.json()
    if (!data.reply) return fail('chat-endpoint', 'keine reply im Response')
    if (!data.sessionId) return fail('chat-endpoint', 'keine sessionId im Response')
    pass('chat-endpoint', `reply: "${data.reply.slice(0, 40)}..."`)
  } catch (e) {
    fail('chat-endpoint', e.message)
  }
}

// ─── 5. Feedback-Intent triggert Action ─────────────────────
async function testFeedbackIntent() {
  // Valid wenn VECTOR eines von beiden tut:
  //   (a) open_feedback Action zurückgibt (Form-Öffnen-Flow)
  //   (b) im Chat nach Details/Namen fragt (inline-Sammel-Flow)
  // Beide sind gewünschtes Verhalten laut Bug-Fix 2026-04-17.
  try {
    const r = await fetchWithTimeout(VECTOR + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': SITE },
      body: JSON.stringify({
        message: 'Ich möchte ein Feedback abgeben',
        sessionId: 'smoke-intent-' + Date.now(),
        instance: 'solarproof',
      }),
    })
    if (r.status !== 200) return fail('chat-feedback-intent', `HTTP ${r.status}`)
    const data = await r.json()
    const hasAction = data.action && data.action.type === 'open_feedback'
    const asksInline = typeof data.reply === 'string' &&
      /feedback|bug|idee|vorschlag|ansprechen|name|melden|schreib/i.test(data.reply)
    if (!hasAction && !asksInline) {
      return fail('chat-feedback-intent', `VECTOR reagiert nicht auf Feedback-Intent. reply="${(data.reply || '').slice(0, 80)}" action=${JSON.stringify(data.action)}`)
    }
    const mode = hasAction ? 'form-action' : 'inline-collect'
    pass('chat-feedback-intent', `mode=${mode}`)
  } catch (e) {
    fail('chat-feedback-intent', e.message)
  }
}

// ─── 6. Feedback-Table lesbar (Supabase) ────────────────────
async function testSupabaseFeedback() {
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!anonKey) return skip('supabase-feedback-reachable', 'SUPABASE_ANON_KEY nicht gesetzt')
  try {
    const r = await fetchWithTimeout(`${SUPABASE}/rest/v1/${FEEDBACK_TABLE}?limit=0`, {
      method: 'HEAD',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Accept-Profile': 'maxone',
      },
    })
    if (r.status !== 200 && r.status !== 206) {
      return fail('supabase-feedback-reachable', `HTTP ${r.status}`)
    }
    pass('supabase-feedback-reachable')
  } catch (e) {
    fail('supabase-feedback-reachable', e.message)
  }
}

// ─── Run + Report ───────────────────────────────────────────
async function main() {
  console.log(`\n🔍 SolarProof Smoke-Test  |  ${new Date().toISOString()}\n`)
  console.log(`  SITE:     ${SITE}`)
  console.log(`  VECTOR:   ${VECTOR}`)
  console.log(`  SUPABASE: ${SUPABASE}\n`)

  await testSite()
  await testWidget()
  await testCors()
  await testChat()
  await testFeedbackIntent()
  await testSupabaseFeedback()

  const passed = results.filter((r) => r.ok && !r.skipped).length
  const failed = results.filter((r) => !r.ok).length
  const skipped = results.filter((r) => r.skipped).length

  console.log('\n— Ergebnisse —')
  for (const r of results) {
    const marker = r.skipped ? '⏭️ ' : r.ok ? '✅' : '❌'
    console.log(`  ${marker} ${r.name}${r.detail ? '  — ' + r.detail : ''}`)
  }
  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen, ${skipped} übersprungen\n`)

  if (failed > 0) {
    console.log('❌ Smoke-Test fehlgeschlagen. NICHT "live" sagen bis gefixt.\n')
    process.exit(1)
  } else {
    console.log('✅ Alle Smoke-Tests grün. Safe zu sagen: "ist live".\n')
  }
}

main().catch((e) => {
  console.error('💥 Smoke-Test Crash:', e)
  process.exit(2)
})
