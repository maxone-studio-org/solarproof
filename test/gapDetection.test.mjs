#!/usr/bin/env node
/**
 * gapDetection.ts — Characterization Tests (Block 6 aus TESTING-ROADMAP.md)
 *
 * Erkennung von fehlenden Tagen, fehlenden Intervallen und Überlappungen
 * nach dem Merge mehrerer CSV-Dateien.
 *
 * Invarianten die hier hart eingezogen werden:
 *  - Fehlende Tage zwischen zwei aufeinanderfolgenden Datentagen werden erkannt
 *  - Fehlende Intervalle innerhalb eines Tages: Gap > 2× typical (Median)
 *  - DST-Transition-Tage erzeugen KEINE False Positives im 00-04 UTC-Fenster
 *  - Dedup: erstes Vorkommen bleibt, Konflikte werden pro File-Paar gruppiert
 *  - Totals werden nach Dedup neu berechnet
 */
import { detectDataGaps, deduplicateIntervals } from '../.test-build/gapDetection.mjs'
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

function makeInterval(ts, erz = 1, vb = 1, ein = 0, netz = 0, sourceFileIndex = 0) {
  return {
    timestamp: new Date(ts),
    erzeugung_kwh: erz,
    verbrauch_kwh: vb,
    einspeisung_kwh: ein,
    netzbezug_kwh: netz,
    sourceFileIndex,
  }
}

function makeDay(date, intervals) {
  return {
    date,
    intervals,
    totals: {
      erzeugung_kwh: intervals.reduce((s, i) => s + i.erzeugung_kwh, 0),
      verbrauch_kwh: intervals.reduce((s, i) => s + i.verbrauch_kwh, 0),
      einspeisung_kwh: intervals.reduce((s, i) => s + i.einspeisung_kwh, 0),
      netzbezug_kwh: intervals.reduce((s, i) => s + i.netzbezug_kwh, 0),
    },
  }
}

// 15-Minuten-Intervalle für einen ganzen Tag (96 Intervalle)
function makeDayFull(dateStr, intervalMinutes = 15) {
  const intervals = []
  const base = new Date(`${dateStr}T00:00:00Z`)
  const count = Math.floor((24 * 60) / intervalMinutes)
  for (let i = 0; i < count; i++) {
    const ts = new Date(base.getTime() + i * intervalMinutes * 60 * 1000)
    intervals.push(makeInterval(ts, 0.25, 0.1, 0, 0))
  }
  return makeDay(dateStr, intervals)
}

// ── 1. detectDataGaps: Grundfälle ──
function testEmptyInput() {
  const gaps = detectDataGaps([])
  assertEq('empty-input-no-gaps', gaps.length, 0)
}

function testSingleDay() {
  const gaps = detectDataGaps([makeDayFull('2024-06-15')])
  assertEq('single-day-no-day-gaps', gaps.filter(g => g.type === 'missing_days').length, 0)
}

function testContiguousDays() {
  const days = [
    makeDayFull('2024-06-14'),
    makeDayFull('2024-06-15'),
    makeDayFull('2024-06-16'),
  ]
  const gaps = detectDataGaps(days)
  assertEq('contiguous-no-day-gaps', gaps.filter(g => g.type === 'missing_days').length, 0)
  assertEq('contiguous-no-interval-gaps', gaps.filter(g => g.type === 'missing_intervals').length, 0)
}

// ── 2. Fehlende Tage ──
function testSingleMissingDay() {
  const days = [makeDayFull('2024-06-14'), makeDayFull('2024-06-16')]
  const gaps = detectDataGaps(days).filter(g => g.type === 'missing_days')
  assertEq('single-missing-count', gaps.length, 1)
  assertEq('single-missing-from', gaps[0].from, '2024-06-15')
  assertEq('single-missing-to', gaps[0].to, '2024-06-15')
  assertEq('single-missing-duration', gaps[0].durationHours, 24)
  assertTrue('single-missing-message-singular', gaps[0].message.includes('1 Tag fehlt'))
}

function testMultipleMissingDays() {
  const days = [makeDayFull('2024-06-10'), makeDayFull('2024-06-15')]
  const gaps = detectDataGaps(days).filter(g => g.type === 'missing_days')
  assertEq('multi-missing-count', gaps.length, 1)
  assertEq('multi-missing-from', gaps[0].from, '2024-06-11')
  assertEq('multi-missing-to', gaps[0].to, '2024-06-14')
  assertEq('multi-missing-duration', gaps[0].durationHours, 4 * 24)
  assertTrue('multi-missing-message-plural', gaps[0].message.includes('4 Tage fehlen'))
}

function testMultipleGapsBetweenDays() {
  const days = [
    makeDayFull('2024-06-10'),
    makeDayFull('2024-06-12'),
    makeDayFull('2024-06-20'),
  ]
  const gaps = detectDataGaps(days).filter(g => g.type === 'missing_days')
  assertEq('multi-ranges-count', gaps.length, 2)
}

// ── 3. Fehlende Intervalle innerhalb eines Tages ──
function testMissingIntervalDetected() {
  // 15-Min-Intervalle, dann 2h-Gap (> 2× median)
  const base = new Date('2024-06-15T00:00:00Z').getTime()
  const intervals = []
  for (let i = 0; i < 10; i++) intervals.push(makeInterval(new Date(base + i * 15 * 60000), 0.1))
  // Gap: i=10 nicht bei 150min, sondern erst bei 150 + 120 = 270 min
  intervals.push(makeInterval(new Date(base + 270 * 60000), 0.1))
  for (let i = 1; i <= 5; i++) intervals.push(makeInterval(new Date(base + (270 + i * 15) * 60000), 0.1))

  const gaps = detectDataGaps([makeDay('2024-06-15', intervals)]).filter(g => g.type === 'missing_intervals')
  assertEq('interval-gap-detected', gaps.length, 1)
  // Gap zwischen 135min und 270min = 135min = 2.25h
  assertEq('interval-gap-duration', gaps[0].durationHours, 2.25)
}

function testNoIntervalGapBelowThreshold() {
  // 15-Min-Intervalle mit einem 25-Min-Sprung (< 2× 15 = 30)
  // Erste 10 Intervalle bei 0,15,...,135. Sprung von 135 → 160 (delta=25).
  const base = new Date('2024-06-15T00:00:00Z').getTime()
  const intervals = []
  for (let i = 0; i < 10; i++) intervals.push(makeInterval(new Date(base + i * 15 * 60000), 0.1))
  intervals.push(makeInterval(new Date(base + (135 + 25) * 60000), 0.1))
  for (let i = 1; i <= 5; i++) intervals.push(makeInterval(new Date(base + (160 + i * 15) * 60000), 0.1))

  const gaps = detectDataGaps([makeDay('2024-06-15', intervals)]).filter(g => g.type === 'missing_intervals')
  assertEq('interval-below-threshold-ignored', gaps.length, 0)
}

function testTooFewIntervalsSkipped() {
  const day = makeDay('2024-06-15', [
    makeInterval('2024-06-15T00:00:00Z'),
    makeInterval('2024-06-15T12:00:00Z'),
  ])
  const gaps = detectDataGaps([day]).filter(g => g.type === 'missing_intervals')
  assertEq('too-few-intervals-skipped', gaps.length, 0)
}

// ── 4. DST-Transition: keine False Positives ──
function testDstFallBackNoFalseGap() {
  // 2024-10-27: DST-Ende in Europa. Uhr springt von 03:00 lokal → 02:00 lokal zurück.
  // Ein SENEC-Export kann einen ~60-min UTC-Sprung zwischen ~00:00 UTC und ~01:00 UTC haben.
  const base = new Date('2024-10-27T00:00:00Z').getTime()
  const intervals = []
  // 15-min-Raster, aber zwischen 00:45 UTC und 02:00 UTC ein 75-min-Gap (>2× median=15, also normal detected)
  for (let i = 0; i < 4; i++) intervals.push(makeInterval(new Date(base + i * 15 * 60000), 0.1))
  // 75min später (dst-typisch, innerhalb 00-04 UTC Fenster, <= 65min Regel greift NICHT bei 75min)
  // Daher nutzen wir 60min (<= 65), um die DST-Exception explizit zu testen
  intervals.push(makeInterval(new Date(base + (45 + 60) * 60000), 0.1))
  for (let i = 1; i < 10; i++) intervals.push(makeInterval(new Date(base + (105 + i * 15) * 60000), 0.1))

  const gaps = detectDataGaps([makeDay('2024-10-27', intervals)]).filter(g => g.type === 'missing_intervals')
  assertEq('dst-fall-back-no-false-gap', gaps.length, 0)
}

function testDstSpringForwardNoFalseGap() {
  // 2024-03-31: DST-Beginn. Uhr springt von 02:00 lokal auf 03:00 lokal vor.
  const base = new Date('2024-03-31T00:00:00Z').getTime()
  const intervals = []
  for (let i = 0; i < 4; i++) intervals.push(makeInterval(new Date(base + i * 15 * 60000), 0.1))
  // 60-min-Sprung im Fenster 00-04 UTC → DST-Exception greift
  intervals.push(makeInterval(new Date(base + (45 + 60) * 60000), 0.1))
  for (let i = 1; i < 10; i++) intervals.push(makeInterval(new Date(base + (105 + i * 15) * 60000), 0.1))

  const gaps = detectDataGaps([makeDay('2024-03-31', intervals)]).filter(g => g.type === 'missing_intervals')
  assertEq('dst-spring-no-false-gap', gaps.length, 0)
}

function testDstExceptionOnlyInWindow() {
  // Gap im Nicht-DST-Fenster (z.B. 12:00 UTC) an einem DST-Tag MUSS erkannt werden.
  const base = new Date('2024-10-27T12:00:00Z').getTime()
  const intervals = []
  for (let i = 0; i < 5; i++) intervals.push(makeInterval(new Date(base + i * 15 * 60000), 0.1))
  intervals.push(makeInterval(new Date(base + (60 + 90) * 60000), 0.1))
  for (let i = 1; i < 5; i++) intervals.push(makeInterval(new Date(base + (150 + i * 15) * 60000), 0.1))

  const gaps = detectDataGaps([makeDay('2024-10-27', intervals)]).filter(g => g.type === 'missing_intervals')
  assertTrue('dst-gap-outside-window-still-detected', gaps.length >= 1, `gaps=${gaps.length}`)
}

// ── 5. deduplicateIntervals ──
function testDedupNoDuplicates() {
  const day = makeDayFull('2024-06-15')
  const { days, overlapSummaries } = deduplicateIntervals([day])
  assertEq('dedup-no-dupes-intervals', days[0].intervals.length, 96)
  assertEq('dedup-no-dupes-summaries', overlapSummaries.length, 0)
  assertEq('dedup-no-dupes-same-day', days[0], day) // Referenz-Gleichheit: unchanged path
}

function testDedupKeepsFirstOccurrence() {
  const intervals = [
    makeInterval('2024-06-15T12:00:00Z', 1, 0, 0, 0, 0),
    makeInterval('2024-06-15T12:00:00Z', 99, 0, 0, 0, 1), // Duplikat: wird gedroppt
    makeInterval('2024-06-15T12:15:00Z', 2, 0, 0, 0, 0),
  ]
  const { days, overlapSummaries } = deduplicateIntervals([makeDay('2024-06-15', intervals)])
  assertEq('dedup-kept-count', days[0].intervals.length, 2)
  assertEq('dedup-kept-first-value', days[0].intervals[0].erzeugung_kwh, 1)
  assertEq('dedup-one-summary', overlapSummaries.length, 1)
  assertEq('dedup-summary-count', overlapSummaries[0].count, 1)
  assertEq('dedup-summary-kept-idx', overlapSummaries[0].fileIndexA, 0)
  assertEq('dedup-summary-dropped-idx', overlapSummaries[0].fileIndexB, 1)
}

function testDedupRecalculatesTotals() {
  const intervals = [
    makeInterval('2024-06-15T12:00:00Z', 5, 2, 1, 0, 0),
    makeInterval('2024-06-15T12:00:00Z', 99, 99, 99, 99, 1), // Duplikat
    makeInterval('2024-06-15T12:15:00Z', 3, 1, 0, 0, 0),
  ]
  const { days } = deduplicateIntervals([makeDay('2024-06-15', intervals)])
  assertEq('dedup-totals-erz', days[0].totals.erzeugung_kwh, 8)
  assertEq('dedup-totals-vb', days[0].totals.verbrauch_kwh, 3)
  assertEq('dedup-totals-ein', days[0].totals.einspeisung_kwh, 1)
  assertEq('dedup-totals-netz', days[0].totals.netzbezug_kwh, 0)
}

function testDedupMultipleFilePairs() {
  // Duplikate zwischen File 0 ↔ 1 und separat File 0 ↔ 2 → zwei Summaries
  const intervals = [
    makeInterval('2024-06-15T10:00:00Z', 1, 0, 0, 0, 0),
    makeInterval('2024-06-15T10:00:00Z', 2, 0, 0, 0, 1), // dup mit file 0
    makeInterval('2024-06-15T11:00:00Z', 1, 0, 0, 0, 0),
    makeInterval('2024-06-15T11:00:00Z', 3, 0, 0, 0, 2), // dup mit file 0
  ]
  const { overlapSummaries } = deduplicateIntervals([makeDay('2024-06-15', intervals)])
  assertEq('dedup-two-pairs', overlapSummaries.length, 2)
  const total = overlapSummaries.reduce((s, o) => s + o.count, 0)
  assertEq('dedup-total-conflicts', total, 2)
}

function testDedupPreservesDate() {
  const intervals = [
    makeInterval('2024-06-15T12:00:00Z', 1, 0, 0, 0, 0),
    makeInterval('2024-06-15T12:00:00Z', 2, 0, 0, 0, 1),
  ]
  const { days } = deduplicateIntervals([makeDay('2024-06-15', intervals)])
  assertEq('dedup-date-preserved', days[0].date, '2024-06-15')
}

function testDedupConflictRecordHasTimestamp() {
  const ts = '2024-06-15T12:00:00Z'
  const intervals = [
    makeInterval(ts, 1, 0, 0, 0, 0),
    makeInterval(ts, 2, 0, 0, 0, 1),
  ]
  const { overlapSummaries } = deduplicateIntervals([makeDay('2024-06-15', intervals)])
  assertEq('dedup-conflict-timestamp', overlapSummaries[0].conflicts[0].timestamp.toISOString(), new Date(ts).toISOString())
}

// ── Run + Report ──
async function main() {
  console.log(`\n🧪 gapDetection.ts Characterization Tests  |  ${new Date().toISOString()}\n`)

  testEmptyInput()
  testSingleDay()
  testContiguousDays()
  testSingleMissingDay()
  testMultipleMissingDays()
  testMultipleGapsBetweenDays()
  testMissingIntervalDetected()
  testNoIntervalGapBelowThreshold()
  testTooFewIntervalsSkipped()
  testDstFallBackNoFalseGap()
  testDstSpringForwardNoFalseGap()
  testDstExceptionOnlyInWindow()
  testDedupNoDuplicates()
  testDedupKeepsFirstOccurrence()
  testDedupRecalculatesTotals()
  testDedupMultipleFilePairs()
  testDedupPreservesDate()
  testDedupConflictRecordHasTimestamp()

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
