#!/usr/bin/env node
/**
 * SolarProof Unit-Tests — Business-Logic mit bekannten Daten.
 *
 * Nutzt Roberts reale SENEC-CSV (week-43-2021) als Golden-Reference.
 * Erwartete Werte aus manueller Verifikation (siehe TESTING.md).
 *
 * Run: npm run test:units
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import Papa from 'papaparse'
import process from 'node:process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CSV_PATH = resolve(__dirname, '../S26870111194348548540356920-week-43-2021.csv')

const results = []
function assertEq(name, actual, expected, tolerance = 0.01) {
  const ok = Math.abs(actual - expected) <= Math.abs(expected) * tolerance
  results.push({ name, ok, actual, expected })
}
function assertTrue(name, cond, failDetail = '') {
  // detail wird nur bei Fehlschlag ausgegeben (sonst verwirrt es)
  results.push({ name, ok: !!cond, detail: !cond ? failDetail : '' })
}

// German number parser — wie in src/utils/csv.ts
function parseNumber(s) {
  if (!s) return NaN
  s = s.trim()
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(',', '.')
  return parseFloat(s)
}

// ─── 1. CSV Headers korrekt erkannt (SENEC kW-Format) ──
function testCsvHeaders() {
  const text = readFileSync(CSV_PATH, 'utf-8')
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: ';' })
  const headers = parsed.meta.fields || []

  assertTrue('csv-has-uhrzeit', headers.includes('Uhrzeit'))
  assertTrue('csv-has-kw-unit', headers.some((h) => /\[kW\]/.test(h)),
    'kein [kW]-Header → Unit-Detection würde fehlschlagen')
  assertTrue('csv-has-stromerzeugung', headers.includes('Stromerzeugung [kW]'))
  assertTrue('csv-rows-count', parsed.data.length > 1000,
    `zu wenig Zeilen: ${parsed.data.length}`)

  return { text, rows: parsed.data }
}

// ─── 2. Integration P × Δt für Tagessummen ──
function testPowerIntegration({ rows }) {
  // Gruppiere nach Tag, sortiere nach Timestamp, integriere
  const byDay = new Map()
  for (const row of rows) {
    const ts = row['Uhrzeit']
    if (!ts) continue
    const [date, time] = ts.split(' ')
    const [d, m, y] = date.split('.').map(Number)
    const [h, mm, ss] = time.split(':').map(Number)
    const timestamp = Date.UTC(y, m - 1, d, h, mm, ss)
    const dayKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const powerKW = parseNumber(row['Stromerzeugung [kW]'])
    if (!byDay.has(dayKey)) byDay.set(dayKey, [])
    byDay.get(dayKey).push({ timestamp, powerKW })
  }

  const dayResults = {}
  for (const [dayKey, intervals] of byDay) {
    intervals.sort((a, b) => a.timestamp - b.timestamp)
    // Median Δt als fallback
    const deltas = []
    for (let i = 1; i < intervals.length; i++) {
      const d = (intervals[i].timestamp - intervals[i - 1].timestamp) / 3600000
      if (d > 0 && d <= 1) deltas.push(d)
    }
    deltas.sort((a, b) => a - b)
    const fallback = deltas.length > 0 ? deltas[Math.floor(deltas.length / 2)] : 5 / 60
    const maxDur = fallback * 2

    let energy = 0
    for (let i = 0; i < intervals.length; i++) {
      const cur = intervals[i]
      const next = intervals[i + 1]
      let dur
      if (next) {
        const d = (next.timestamp - cur.timestamp) / 3600000
        dur = d > 0 && d <= maxDur ? d : fallback
      } else {
        dur = fallback
      }
      energy += cur.powerKW * dur
    }
    dayResults[dayKey] = energy
  }

  // Golden values (manuell verifiziert 2026-04-16 aus test-senec-csv.mjs):
  // Diese MÜSSEN stimmen sonst ist die Wh/kWh-Integrations-Fix kaputt.
  const expected = {
    '2021-10-26': 4.58,   // Teiltag
    '2021-10-27': 7.62,   // bewölkt
    '2021-10-28': 21.81,  // sonnig — Peak
    '2021-10-29': 20.41,
    '2021-10-30': 19.87,
    '2021-10-31': 15.62,
  }

  for (const [day, exp] of Object.entries(expected)) {
    const actual = dayResults[day]
    if (actual === undefined) {
      results.push({ name: `integration-${day}`, ok: false, detail: 'Tag nicht gefunden' })
    } else {
      assertEq(`integration-${day}`, actual, exp, 0.01) // 1% Toleranz
    }
  }

  // Sanity-Check: Wochensumme plausibel für 10 kWp im Oktober
  const total = Object.values(dayResults).reduce((s, v) => s + v, 0)
  assertTrue('integration-weekly-plausible',
    total >= 80 && total <= 200,
    `Wochensumme ${total.toFixed(1)} kWh außerhalb [80, 200] — 10 kWp System?`)
}

// ─── 3. Naive Summe wäre ~12× zu hoch (Bug-Reproduktion) ──
function testNaiveSumIsWrong({ rows }) {
  const byDay = new Map()
  for (const row of rows) {
    const ts = row['Uhrzeit']
    if (!ts) continue
    const [date] = ts.split(' ')
    const [d, m, y] = date.split('.').map(Number)
    const dayKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const powerKW = parseNumber(row['Stromerzeugung [kW]'])
    byDay.set(dayKey, (byDay.get(dayKey) || 0) + powerKW)
  }

  // Der Bug: naive Summe am 28.10. war 260 kWh — unmöglich. Integration gibt 21.81.
  const naive28 = byDay.get('2021-10-28') || 0
  assertTrue('naive-sum-is-implausible',
    naive28 > 200,
    `Naive Summe 28.10. sollte > 200 sein (war im Bug 260.1), ist: ${naive28.toFixed(1)}`)
  assertTrue('naive-vs-integrated-ratio',
    naive28 / 21.81 > 8 && naive28 / 21.81 < 15,
    `Ratio naive/integrated sollte ~12 sein (60min/5min), ist: ${(naive28 / 21.81).toFixed(1)}`)
}

// ─── Run + Report ──
async function main() {
  console.log(`\n🧪 SolarProof Unit-Tests  |  ${new Date().toISOString()}\n`)

  try {
    const { text: _text, rows } = testCsvHeaders()
    testPowerIntegration({ rows })
    testNaiveSumIsWrong({ rows })
  } catch (e) {
    console.error('💥 Unit-Test Crash:', e.message)
    process.exit(2)
  }

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length

  console.log('— Ergebnisse —')
  for (const r of results) {
    const marker = r.ok ? '✅' : '❌'
    let detail = ''
    if ('expected' in r) detail = `  erwartet ${r.expected}, bekommen ${typeof r.actual === 'number' ? r.actual.toFixed(2) : r.actual}`
    else if (r.detail) detail = `  — ${r.detail}`
    console.log(`  ${marker} ${r.name}${detail}`)
  }
  console.log(`\n${passed}/${passed + failed} bestanden\n`)

  process.exit(failed > 0 ? 1 : 0)
}

main()
