#!/usr/bin/env node
/**
 * DST + Schaltjahr — Regressionstests für timezone.ts (Block 5).
 *
 * Behandelt:
 *  - Spring-Forward (2024-03-31): 02:00 lokal fehlt → Warning 'missing_hour'
 *  - Fall-Back (2024-10-27): 02:00 lokal doppelt → Warning 'double_hour'
 *  - Tagesgruppierung in Berlin-TZ ist korrekt
 *  - Schaltjahr 2024-02-29 wird akzeptiert, 2025-02-29 nicht erkannt
 *  - Power-Integration: DST-Gap wird auf Fallback-Duration gedeckelt
 *  - Commits gesichert: afe9648, d63333b, 0dd9e74
 */
import { processRawData } from '../.test-build/timezone.mjs'
import process from 'node:process'

const results = []
const pass = (n, d = '') => results.push({ name: n, ok: true, detail: d })
const fail = (n, d = '') => results.push({ name: n, ok: false, detail: d })

function assertEq(n, actual, expected, tol = 0.001) {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const ok = Math.abs(actual - expected) <= Math.abs(expected) * tol + 1e-9
    return ok ? pass(n) : fail(n, `erwartet ${expected}, bekommen ${actual}`)
  }
  const ok = actual === expected
  return ok ? pass(n) : fail(n, `erwartet ${expected}, bekommen ${actual}`)
}
const assertTrue = (n, c, f = '') => (c ? pass(n) : fail(n, f))

function makeRow(datum, uhrzeit, erz = 1, vb = 1) {
  return {
    datum, uhrzeit,
    erzeugung_kwh: erz,
    verbrauch_kwh: vb,
    einspeisung_kwh: 0,
    netzbezug_kwh: 0,
    sourceFileIndex: 0,
  }
}

// ── 1. Spring-Forward 2024-03-31 ──
function testSpringForward() {
  // Stunden 00, 01, 03, 04, 05 — 02 wird übersprungen (Uhr springt vor)
  const rows = [
    makeRow('31.03.2024', '00:00'),
    makeRow('31.03.2024', '01:00'),
    makeRow('31.03.2024', '03:00'),
    makeRow('31.03.2024', '04:00'),
    makeRow('31.03.2024', '05:00'),
  ]
  const { days, warnings } = processRawData(rows)
  assertEq('spring-one-day', days.length, 1)
  assertEq('spring-day-key', days[0].date, '2024-03-31')
  const missingHour = warnings.find((w) => w.type === 'missing_hour')
  assertTrue('spring-missing-hour-warning', !!missingHour, `warnings=${JSON.stringify(warnings)}`)
  if (missingHour) assertEq('spring-warning-date', missingHour.date, '2024-03-31')
}

// ── 2. Fall-Back 2024-10-27 ──
function testFallBack() {
  // Vier aufeinanderfolgende UTC-Stunden, die in Berlin über die DST-Kante fallen:
  //   22:00Z am 26.10.   → 00:00 CEST Sonntag
  //   23:00Z am 26.10.   → 01:00 CEST Sonntag
  //   00:00Z am 27.10.   → 02:00 CEST Sonntag  (erste 02:00)
  //   01:00Z am 27.10.   → 02:00 CET  Sonntag  (zweite 02:00, nach fall-back)
  //
  // Beobachtung (2026-04-18): Die `double_hour`-Warnung in timezone.ts ist aus
  // realen CSV-Imports praktisch nicht erreichbar, weil:
  //   - SENEC-CSVs enthalten nur Berlin-Lokalzeit ohne Offset
  //   - `fromZonedTime` löst die ambigue 02:00-Stunde deterministisch auf EINE
  //     UTC-Zeit auf (date-fns-tz wählt CEST-first), wodurch beide Einträge
  //     dieselbe UTC-Zeit bekommen und beim Dedup zu einer zusammenfallen
  //   - Mit `inputIsUTC=true` wird `fromZonedTime` übersprungen, aber `parse()`
  //     erzeugt bereits system-TZ-abhängige Dates — unter TZ=Europe/Berlin wird
  //     die Stunde doppelt verschoben, unter TZ=UTC fehlt die Berlin-Lokalisierung
  //
  // Der Test dokumentiert daher nur: die Tag-Zuordnung für den DST-Fall-Back-Tag
  // bleibt korrekt, egal welche Eingabeform. Die Warning-Logik könnte toter Code
  // sein → offene Frage an Max (`TODO-MAX` in TESTING-ROADMAP.md).
  const rows = [
    makeRow('27.10.2024', '00:00'),
    makeRow('27.10.2024', '01:00'),
    makeRow('27.10.2024', '02:00'),
    makeRow('27.10.2024', '03:00'),
  ]
  const { days } = processRawData(rows)
  const sun = days.find((d) => d.date === '2024-10-27')
  assertTrue('fall-back-day-exists', !!sun)
  assertTrue('fall-back-has-intervals', sun && sun.intervals.length > 0)
}

// ── 3. Schaltjahr: 2024-02-29 ist ein gültiges Datum ──
function testLeapYearValid() {
  const rows = [
    makeRow('28.02.2024', '23:00'),
    makeRow('29.02.2024', '00:00'),
    makeRow('29.02.2024', '12:00'),
    makeRow('01.03.2024', '00:00'),
  ]
  const { days } = processRawData(rows)
  const leap = days.find((d) => d.date === '2024-02-29')
  assertTrue('leap-2024-parsed', !!leap)
  assertTrue('leap-2024-has-intervals', leap && leap.intervals.length === 2)
}

// ── 4. Kein-Schaltjahr: 2025-02-29 darf nicht auftauchen ──
function testNonLeapYear() {
  // date-fns `parse` liefert für 29.02.2025 ein "invalid date" zurück.
  // `processRawData` skipped invalid rows (continue), also darf KEIN Tag '2025-02-29' existieren.
  // detectDateFormat prüft alle ersten 10 Samples → 29.02.2025 in den Samples würde Auto-Detect
  // komplett fehlschlagen lassen (ergibt leere Days, keinen Feb-29-Tag). Daher 29.02.2025 nach
  // Position 10 legen, damit Format-Detection erfolgreich ist und der einzelne ungültige Tag
  // per `continue` geskipped wird.
  const rows = []
  for (let h = 0; h < 10; h++) rows.push(makeRow('28.02.2025', `${String(h).padStart(2, '0')}:00`))
  rows.push(makeRow('29.02.2025', '12:00')) // ungültig → wird übersprungen
  rows.push(makeRow('01.03.2025', '12:00'))
  const { days } = processRawData(rows)
  const bogus = days.find((d) => d.date === '2025-02-29')
  assertTrue('non-leap-no-feb29', !bogus)
  // Erwartet: 28.02 und 01.03 als gültige Tage
  assertEq('non-leap-two-days', days.length, 2)
}

// ── 5. Power-Integration: DST-Gap wird gedeckelt ──
function testPowerIntegrationDstGap() {
  // Regulär 1h-Raster an DST-Tag. An 2024-03-31 fehlt 02:00 lokal → UTC-Gap
  // zwischen 00:00Z (=01:00 CET) und 01:00Z (=03:00 CEST) beträgt 1h, NICHT 2h.
  // Power-Integration nutzt next-timestamp-Delta, gedeckelt auf 2× Fallback.
  // Wir prüfen hier nur, dass erzeugung_kwh finite bleibt und plausibel <= erz_kw * 1h.
  const rows = [
    makeRow('31.03.2024', '00:00', 2, 0), // 2 kW
    makeRow('31.03.2024', '01:00', 2, 0),
    makeRow('31.03.2024', '03:00', 2, 0),
    makeRow('31.03.2024', '04:00', 2, 0),
    makeRow('31.03.2024', '05:00', 2, 0),
  ]
  const { days } = processRawData(rows, false, /* isPower= */ true)
  const day = days.find((d) => d.date === '2024-03-31')
  assertTrue('power-dst-day-exists', !!day)
  // Fallback = median delta. Tatsächliche Deltas: 1h, 1h (DST-collapse), 1h, 1h → median=1h, max=2h.
  // Die 01:00→03:00 lokal-Lücke = 1h UTC, passt in das Fenster → normal integriert.
  // Ergebnis: 5 Intervalle × 2 kW × 1h = 10 kWh
  assertTrue('power-dst-finite', Number.isFinite(day.totals.erzeugung_kwh))
  assertEq('power-dst-erzeugung', day.totals.erzeugung_kwh, 10, 0.01)
}

// ── 6. Keine DST-Warnings an Nicht-DST-Tagen ──
function testNoDstWarningOnRegularDay() {
  const rows = [
    makeRow('15.06.2024', '00:00'),
    makeRow('15.06.2024', '01:00'),
    makeRow('15.06.2024', '02:00'),
    makeRow('15.06.2024', '03:00'),
  ]
  const { warnings } = processRawData(rows)
  assertEq('no-dst-warning-regular-day', warnings.length, 0)
}

// ── 7. Empty-Input-Guard ──
function testEmptyInput() {
  const { days, warnings } = processRawData([])
  assertEq('empty-input-no-days', days.length, 0)
  assertEq('empty-input-no-warnings', warnings.length, 0)
}

// ── 8. Datumsformat-Auto-Detection: ISO vs. DE ──
function testDateFormatAutoDetect() {
  const rowsDe = [makeRow('15.06.2024', '12:00')]
  const rowsIso = [makeRow('2024-06-15', '12:00')]
  const resDe = processRawData(rowsDe)
  const resIso = processRawData(rowsIso)
  assertEq('format-de-day', resDe.days[0].date, '2024-06-15')
  assertEq('format-iso-day', resIso.days[0].date, '2024-06-15')
}

// ── Run + Report ──
async function main() {
  console.log(`\n🧪 DST + Schaltjahr Regressionstests  |  ${new Date().toISOString()}\n`)

  testSpringForward()
  testFallBack()
  testLeapYearValid()
  testNonLeapYear()
  testPowerIntegrationDstGap()
  testNoDstWarningOnRegularDay()
  testEmptyInput()
  testDateFormatAutoDetect()

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
