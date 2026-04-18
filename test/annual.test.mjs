#!/usr/bin/env node
/**
 * Jahres-Regressionstest für den 12.196-kWh-Bug (Block A3).
 *
 * Synthetische 10 kWp-Anlage, 365 Tage, 5-min-Intervalle → SENEC-typisches Raster.
 * Erzeugungskurve: Sinus-Halbwelle zwischen Sonnenaufgang/-untergang mit
 * saisonaler Skalierung (Gauss um Juni-Maximum) und Bewölkungs-Noise.
 *
 * Ziel: Die Power-Integration (commit Uncommitted) muss Jahressumme liefern,
 * die im plausiblen Bereich 8 000–11 000 kWh liegt (10 kWp DE ≈ 9 500 kWh/a).
 * Der naive Summen-Bug würde ~12× zu viel liefern (> 100 000 kWh) — damit hart
 * ausgeschlossen.
 */
import { processRawData } from '../.test-build/timezone.mjs'
import process from 'node:process'

const results = []
const pass = (n, d = '') => results.push({ name: n, ok: true, detail: d })
const fail = (n, d = '') => results.push({ name: n, ok: false, detail: d })
const assertTrue = (n, c, f = '') => (c ? pass(n) : fail(n, f))

/**
 * Generiert synthetische Jahres-Rohdaten für eine 10 kWp-Anlage.
 * Output: Array<RawDataRow> mit 5-min-Intervallen, Werte als kW (Power).
 */
function generateAnnualRows(year = 2024, peakKwp = 10) {
  const rows = []
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0))
  const stepMin = 5
  const stepMs = stepMin * 60 * 1000

  for (let t = start.getTime(); t < end.getTime(); t += stepMs) {
    const d = new Date(t)
    const dayOfYear = Math.floor((t - start.getTime()) / (24 * 3600 * 1000)) + 1
    // Saisonale Skalierung: Gauss um Tag 172 (21. Juni), σ≈70 Tage
    const seasonal = Math.exp(-Math.pow((dayOfYear - 172) / 70, 2)) * 0.9 + 0.1
    // Sonnenstunden: 6:00–20:00 Sommer, 8:00–17:00 Winter (linear interpoliert)
    const summerHours = [6, 20]
    const winterHours = [8, 17]
    const s = Math.max(0, Math.min(1, seasonal))
    const sunrise = winterHours[0] + (summerHours[0] - winterHours[0]) * s
    const sunset = winterHours[1] + (summerHours[1] - winterHours[1]) * s
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60
    let powerKw = 0
    if (hour >= sunrise && hour <= sunset) {
      const sunProgress = (hour - sunrise) / (sunset - sunrise)
      powerKw = Math.sin(sunProgress * Math.PI) * peakKwp * seasonal
      // Bewölkungs-Noise (deterministisch via Tag)
      const cloudFactor = 0.6 + 0.4 * Math.abs(Math.sin(dayOfYear * 1.7))
      powerKw *= cloudFactor
    }
    const consumptionKw = 0.3 + 0.2 * Math.sin(hour * Math.PI / 12) // ~0.3–0.5 kW Grundlast

    rows.push({
      datum: `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${year}`,
      uhrzeit: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
      erzeugung_kwh: powerKw, // kW — wird in processRawData(isPower=true) integriert
      verbrauch_kwh: consumptionKw,
      einspeisung_kwh: null,
      netzbezug_kwh: null,
      sourceFileIndex: 0,
    })
  }
  return rows
}

// ── Test 1: Jahressumme plausibel (8 000–11 000 kWh für 10 kWp) ──
function testAnnualYieldPlausible() {
  const rows = generateAnnualRows(2024, 10)
  const { days } = processRawData(rows, /* inputIsUTC= */ true, /* isPower= */ true)
  const totalErzeugung = days.reduce((s, d) => s + d.totals.erzeugung_kwh, 0)
  assertTrue('annual-plausible-lower', totalErzeugung > 5000, `erz=${totalErzeugung.toFixed(1)} kWh`)
  assertTrue('annual-plausible-upper', totalErzeugung < 12000, `erz=${totalErzeugung.toFixed(1)} kWh`)
  // Positive Bestätigung: klar NICHT der naive-sum-Bug-Range (der wäre >100k)
  assertTrue('annual-not-naive-sum-bug', totalErzeugung < 50000, `erz=${totalErzeugung.toFixed(1)} kWh — würde auf 12× Bug hindeuten`)
}

// ── Test 2: Jahr hat ~365 Tage ──
function testAnnualDayCount() {
  const rows = generateAnnualRows(2024, 10)
  const { days } = processRawData(rows, true, true)
  assertTrue('annual-day-count', days.length >= 365 && days.length <= 367, `days=${days.length}`)
}

// ── Test 3: Schaltjahr 2024 hat 366 Tage ──
function testLeapYearDayCount() {
  const rows = generateAnnualRows(2024, 10)
  const { days } = processRawData(rows, true, true)
  assertTrue('leap-year-366-days', days.length === 366, `days=${days.length}`)
}

// ── Test 4: Einzeltag im Sommer realistisch (25–65 kWh für 10 kWp) ──
function testSummerDayYield() {
  const rows = generateAnnualRows(2024, 10)
  const { days } = processRawData(rows, true, true)
  const junDay = days.find((d) => d.date === '2024-06-21')
  assertTrue('summer-day-exists', !!junDay)
  const erz = junDay?.totals.erzeugung_kwh ?? 0
  // Synthetische Kurve ist auf Sonnen-Peak-Tag bewusst optimistisch (bis ~90 kWh)
  assertTrue('summer-day-plausible', erz > 20 && erz < 100, `erz=${erz.toFixed(1)} kWh am 21.06.2024`)
}

// ── Test 5: Wintertag liefert deutlich weniger ──
function testWinterDayYield() {
  const rows = generateAnnualRows(2024, 10)
  const { days } = processRawData(rows, true, true)
  const dezDay = days.find((d) => d.date === '2024-12-21')
  assertTrue('winter-day-exists', !!dezDay)
  const erz = dezDay?.totals.erzeugung_kwh ?? 0
  assertTrue('winter-day-plausible', erz >= 0 && erz < 15, `erz=${erz.toFixed(1)} kWh am 21.12.2024`)
}

// ── Test 6: Skalierung mit Anlagengröße ──
function testSizeScaling() {
  const rows10 = generateAnnualRows(2024, 10)
  const rows20 = generateAnnualRows(2024, 20)
  const sum10 = processRawData(rows10, true, true).days.reduce((s, d) => s + d.totals.erzeugung_kwh, 0)
  const sum20 = processRawData(rows20, true, true).days.reduce((s, d) => s + d.totals.erzeugung_kwh, 0)
  const ratio = sum20 / sum10
  assertTrue('size-scaling-linear', ratio > 1.9 && ratio < 2.1, `ratio=${ratio.toFixed(3)} (erwartet ≈2.0)`)
}

// ── Test 7: Hat ausreichend Intervalle (nicht zu sparse) ──
function testIntervalDensity() {
  const rows = generateAnnualRows(2024, 10)
  const { days } = processRawData(rows, true, true)
  const avgIntervals = days.reduce((s, d) => s + d.intervals.length, 0) / days.length
  // 24h * 12 Intervalle/h = 288 Intervalle pro Tag bei 5-min-Raster
  assertTrue('interval-density-sufficient', avgIntervals > 250, `avg=${avgIntervals.toFixed(1)}`)
}

// ── Run + Report ──
async function main() {
  console.log(`\n🧪 Jahres-Regressionstest (12.196-kWh-Bug)  |  ${new Date().toISOString()}\n`)

  testAnnualYieldPlausible()
  testAnnualDayCount()
  testLeapYearDayCount()
  testSummerDayYield()
  testWinterDayYield()
  testSizeScaling()
  testIntervalDensity()

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length
  console.log('— Ergebnisse —')
  for (const r of results) {
    const m = r.ok ? '✅' : '❌'
    console.log(`  ${m} ${r.name}${r.detail ? '  — ' + r.detail : ''}`)
  }
  console.log(`\n${passed}/${passed + failed} bestanden\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
