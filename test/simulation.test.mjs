#!/usr/bin/env node
/**
 * simulation.ts — Characterization Tests (Block 3 aus TESTING-ROADMAP.md)
 *
 * Speicher-Simulation: Grid-Flow-Modus (SENEC-typisch) + Surplus-Fallback.
 * Invarianten die hier hart eingezogen werden:
 *  - `netzbezug_sim ≤ netzbezug_ist` (keine Magie durch die Simulation)
 *  - Energieerhaltung (Lade/Entlade-Effizienz korrekt)
 *  - SoC bleibt im Band [minSoc, maxCapacity]
 *  - SoC-Carry-Over über Tage (Regressions-Test für e03a4cc)
 */
import { runSimulation } from '../.test-build/simulation.mjs'
import process from 'node:process'

const results = []
const pass = (n, d = '') => results.push({ name: n, ok: true, detail: d })
const fail = (n, d = '') => results.push({ name: n, ok: false, detail: d })

function assertEq(n, actual, expected, tol = 0.001) {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const ok = Math.abs(actual - expected) <= Math.abs(expected) * tol + 1e-9
    return ok ? pass(n) : fail(n, `erwartet ${expected.toFixed(4)}, bekommen ${actual.toFixed(4)}`)
  }
  const ok = actual === expected
  return ok ? pass(n) : fail(n, `erwartet ${expected}, bekommen ${actual}`)
}
const assertTrue = (n, c, f = '') => (c ? pass(n) : fail(n, f))

// ── Helper: DayData mit Intervallen ──
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

function makeInterval(ts, erz, vb, ein, netz) {
  return {
    timestamp: new Date(ts),
    erzeugung_kwh: erz,
    verbrauch_kwh: vb,
    einspeisung_kwh: ein,
    netzbezug_kwh: netz,
    sourceFileIndex: 0,
  }
}

const defaultParams = {
  kapazitaet_kwh: 10,
  entladetiefe_pct: 100, // DoD 100% = minSoc = 0 (einfacher für Tests)
  ladewirkungsgrad_pct: 100, // keine Verluste in den meisten Tests
  entladewirkungsgrad_pct: 100,
  anfangs_soc_pct: 0, // leerer Speicher zu Beginn
}

// ── 1. Mode-Detection ──
function testModeDetection() {
  // Keine Grid-Flow-Daten → Surplus-Fallback wird genutzt
  const daysSurplus = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T12:00:00Z', 5, 2, 0, 0),
  ])]
  const resSurplus = runSimulation(daysSurplus, defaultParams)
  assertEq('mode-surplus-one-result', resSurplus.length, 1)
  // Bei Surplus-Mode: Überschuss = 5 − 2 = 3 kWh → in leerer Speicher (Kap 10) → 3 kWh geladen
  assertEq('mode-surplus-charged', resSurplus[0].totals.geladen_kwh, 3)

  // Mit Grid-Flow-Daten → Grid-Flow-Mode
  const daysGrid = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T12:00:00Z', 5, 2, 3, 0), // Einspeisung > 0
  ])]
  const resGrid = runSimulation(daysGrid, defaultParams)
  assertEq('mode-grid-flow-one-result', resGrid.length, 1)
  // Grid-Flow: Einspeisung 3 → in leeren Speicher → 3 geladen, 0 Einspeisung-Sim
  assertEq('mode-grid-flow-charged', resGrid[0].totals.geladen_kwh, 3)
  assertEq('mode-grid-flow-einspeisung-sim', resGrid[0].totals.einspeisung_sim_kwh, 0)
}

// ── 2. Grid-Flow: Batterie voll → Overflow bleibt Einspeisung ──
function testBatteryFullOverflow() {
  const params = { ...defaultParams, kapazitaet_kwh: 5, anfangs_soc_pct: 100 } // voll
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T12:00:00Z', 10, 2, 8, 0), // 8 kWh Einspeisung
  ])]
  const r = runSimulation(days, params)[0]
  assertEq('battery-full-no-charge', r.totals.geladen_kwh, 0)
  assertEq('battery-full-einspeisung-sim-stays', r.totals.einspeisung_sim_kwh, 8)
}

// ── 3. Grid-Flow: Batterie leer → Netzbezug-Sim unverändert ──
function testBatteryEmptyDeficit() {
  const params = { ...defaultParams, kapazitaet_kwh: 5, anfangs_soc_pct: 0 }
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T20:00:00Z', 0, 3, 0, 3), // 3 kWh Netzbezug, Speicher leer
  ])]
  const r = runSimulation(days, params)[0]
  assertEq('battery-empty-no-discharge', r.totals.entladen_kwh, 0)
  assertEq('battery-empty-netzbezug-sim-stays', r.totals.netzbezug_sim_kwh, 3)
}

// ── 4. Grid-Flow Invariante: netzbezug_sim ≤ netzbezug_ist ──
function testNetzbezugInvariant() {
  const params = { ...defaultParams, kapazitaet_kwh: 10, anfangs_soc_pct: 50 }
  // Mischung: erst laden, dann entladen
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T10:00:00Z', 3, 1, 2, 0), // Einspeisung 2 → Batterie +2
    makeInterval('2024-06-15T18:00:00Z', 0, 4, 0, 4), // Netzbezug 4 → Batterie (hatte 5+2=7) entlädt 4
  ])]
  const r = runSimulation(days, params)[0]
  const allOk = r.intervals.every((iv, idx) => iv.netzbezug_sim_kwh <= days[0].intervals[idx].netzbezug_kwh + 1e-9)
  assertTrue('invariant-netzbezug-sim-not-greater', allOk,
    `netzbezug_sim überschreitet netzbezug_ist in mindestens einem Intervall`)
  // Nach Laden sollte soc = 7, nach Entladen 7-4=3 (bei 100% eff)
  assertEq('mixed-flow-soc-after', r.intervals[1].soc_kwh, 3)
  assertEq('mixed-flow-netzbezug-sim-reduced', r.intervals[1].netzbezug_sim_kwh, 0)
}

// ── 5. Lade-/Entlade-Effizienz: 90 % roundtrip ──
function testEfficiencyRoundtrip() {
  const params = {
    kapazitaet_kwh: 10,
    entladetiefe_pct: 100,
    ladewirkungsgrad_pct: 90,
    entladewirkungsgrad_pct: 90,
    anfangs_soc_pct: 0,
  }
  const days = [makeDay('2024-06-15', [
    // 10 kWh Einspeisung → 10 × 0.9 = 9 kWh im Speicher
    makeInterval('2024-06-15T10:00:00Z', 10, 0, 10, 0),
    // 9 kWh Bedarf → deckbar aus Speicher: (9-0)*0.9 = 8.1 kWh → entladen: 8.1/0.9 = 9 kWh aus Speicher
    makeInterval('2024-06-15T20:00:00Z', 0, 9, 0, 9),
  ])]
  const r = runSimulation(days, params)[0]
  assertEq('eff-charge-90pct', r.intervals[0].soc_kwh, 9)
  assertEq('eff-geladen-after-loss', r.totals.geladen_kwh, 9)
  // Entladen: availableDischarge = 9 * 0.9 = 8.1, covered = min(9, 8.1) = 8.1
  // entladen = 8.1 / 0.9 = 9. SOC drops 9 → 0
  assertEq('eff-soc-after-discharge', r.intervals[1].soc_kwh, 0)
  // netzbezug_sim = 9 - 8.1 = 0.9 (Differenz durch Entlade-Verlust)
  assertEq('eff-netzbezug-sim-residual', r.intervals[1].netzbezug_sim_kwh, 0.9)
}

// ── 6. DoD / entladetiefe: Speicher nicht unter minSoc entladen ──
function testDepthOfDischarge() {
  const params = {
    kapazitaet_kwh: 10,
    entladetiefe_pct: 80, // minSoc = 10 × (1-0.8) = 2
    ladewirkungsgrad_pct: 100,
    entladewirkungsgrad_pct: 100,
    anfangs_soc_pct: 100, // voll
  }
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T12:00:00Z', 0, 15, 0, 15), // 15 kWh Bedarf
  ])]
  const r = runSimulation(days, params)[0]
  // availableDischarge = (10 - 2) * 1 = 8, covered = min(15, 8) = 8
  assertEq('dod-respects-minsoc', r.intervals[0].soc_kwh, 2)
  assertEq('dod-entladen', r.totals.entladen_kwh, 8)
  assertEq('dod-netzbezug-residual', r.totals.netzbezug_sim_kwh, 7)
}

// ── 7. SoC-Carry-Over über Tage (Regressions-Test für e03a4cc) ──
function testSocCarryOverMultipleDays() {
  const params = { ...defaultParams, kapazitaet_kwh: 10, anfangs_soc_pct: 0 }
  const days = [
    makeDay('2024-06-15', [makeInterval('2024-06-15T12:00:00Z', 5, 0, 5, 0)]), // lädt 5
    makeDay('2024-06-16', [makeInterval('2024-06-16T12:00:00Z', 5, 0, 5, 0)]), // lädt weitere 5 → soll 10 sein
    makeDay('2024-06-17', [makeInterval('2024-06-17T18:00:00Z', 0, 3, 0, 3)]), // entlädt 3 → soll 7 sein
  ]
  const r = runSimulation(days, params)
  // Tag 1 startet bei 0, endet bei 5
  assertEq('carryover-day1-soc-start', r[0].soc_start_kwh, 0)
  assertEq('carryover-day1-soc-end', r[0].intervals[0].soc_kwh, 5)
  // Tag 2 startet bei 5 (carry over!), endet bei 10
  assertEq('carryover-day2-soc-start', r[1].soc_start_kwh, 5)
  assertEq('carryover-day2-soc-end', r[1].intervals[0].soc_kwh, 10)
  // Tag 3 startet bei 10, endet bei 7
  assertEq('carryover-day3-soc-start', r[2].soc_start_kwh, 10)
  assertEq('carryover-day3-soc-end', r[2].intervals[0].soc_kwh, 7)
}

// ── 8. anfangs_soc_pct 0 vs 100 ──
function testInitialSocBoundaries() {
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T12:00:00Z', 5, 0, 5, 0),
  ])]
  const r0 = runSimulation(days, { ...defaultParams, kapazitaet_kwh: 10, anfangs_soc_pct: 0 })[0]
  assertEq('init-soc-0pct-start', r0.soc_start_kwh, 0)
  assertEq('init-soc-0pct-can-charge', r0.totals.geladen_kwh, 5)

  const r100 = runSimulation(days, { ...defaultParams, kapazitaet_kwh: 10, anfangs_soc_pct: 100 })[0]
  assertEq('init-soc-100pct-start', r100.soc_start_kwh, 10)
  assertEq('init-soc-100pct-no-charge', r100.totals.geladen_kwh, 0)
  assertEq('init-soc-100pct-einspeisung-stays', r100.totals.einspeisung_sim_kwh, 5)
}

// ── 9. Leere days-Liste ──
function testEmptyDays() {
  const r = runSimulation([], defaultParams)
  assertEq('empty-days-returns-empty', r.length, 0)
}

// ── 10. Surplus-Mode: Detailtest ──
function testSurplusMode() {
  // Keine Einspeisung/Netzbezug-Daten → Surplus-Mode
  const params = { ...defaultParams, kapazitaet_kwh: 10, anfangs_soc_pct: 50 } // start bei 5
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T12:00:00Z', 8, 3, 0, 0), // Überschuss 5 → Speicher 5+5=10
    makeInterval('2024-06-15T18:00:00Z', 0, 6, 0, 0), // Bedarf 6 → aus Speicher 6, soc → 4
  ])]
  const r = runSimulation(days, params)[0]
  assertEq('surplus-charge-uses-surplus', r.intervals[0].soc_kwh, 10)
  assertEq('surplus-discharge-covers-demand', r.intervals[1].soc_kwh, 4)
  // Überschuss war 5, Batterie nahm 5 auf → Einspeisung Sim = 0
  assertEq('surplus-einspeisung-after-charge', r.intervals[0].einspeisung_sim_kwh, 0)
  // Bedarf war 6, Speicher hatte 10, konnte 6 liefern → Netzbezug = 0
  assertEq('surplus-netzbezug-after-discharge', r.intervals[1].netzbezug_sim_kwh, 0)
}

// ── 11. Invariante: geladen & entladen nicht gleichzeitig > 0 in einem Intervall ──
function testNoSimultaneousChargeDischarge() {
  const params = { ...defaultParams, kapazitaet_kwh: 10, anfangs_soc_pct: 50 }
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T12:00:00Z', 5, 3, 2, 0),
    makeInterval('2024-06-15T13:00:00Z', 0, 5, 0, 5),
  ])]
  const r = runSimulation(days, params)[0]
  const allOk = r.intervals.every((iv) => !(iv.geladen_kwh > 1e-9 && iv.entladen_kwh > 1e-9))
  assertTrue('invariant-no-simultaneous-charge-discharge', allOk,
    'mindestens ein Intervall hat geladen>0 UND entladen>0 (unphysikalisch)')
}

// ── 12. socMin/socMax-Tracking ──
function testSocMinMaxTracking() {
  const params = { ...defaultParams, kapazitaet_kwh: 10, anfangs_soc_pct: 50 }
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T10:00:00Z', 5, 0, 5, 0), // soc 5 → 10
    makeInterval('2024-06-15T14:00:00Z', 0, 8, 0, 8), // soc 10 → 2
    makeInterval('2024-06-15T18:00:00Z', 3, 0, 3, 0), // soc 2 → 5
  ])]
  const r = runSimulation(days, params)[0]
  assertEq('socmax-tracking', r.totals.soc_max_kwh, 10)
  assertEq('socmin-tracking', r.totals.soc_min_kwh, 2)
}

// ── 13. Teilweise funktionierender Speicher (Robert-Szenario 14.02.2022) ──
// Szenario: Echter Speicher nahm partiell noch Energie auf → nur die ins Netz
// eingespeiste Differenz darf als "hätte in hypothetischen Speicher gehen können"
// gezählt werden. Energie, die schon im echten (defekten) Speicher gelandet ist,
// taucht nicht als einspeisung_kwh auf und darf NICHT doppelt als Einsparung zählen.
function testPartiallyFunctioningRealBattery() {
  // Erzeugung 10, Verbrauch 3, Real-Speicher nahm 2 kWh, ins Netz 5, vom Netz 0.
  // CSV-Zeile: erzeugung=10, verbrauch=3, einspeisung=5, netzbezug=0
  // (erzeugung ≠ verbrauch + einspeisung, weil 2 kWh in den echten Speicher gingen)
  const params = { ...defaultParams, kapazitaet_kwh: 10, anfangs_soc_pct: 0 }
  const days = [makeDay('2022-02-14', [
    makeInterval('2022-02-14T12:00:00Z', 10, 3, 5, 0),
  ])]
  const r = runSimulation(days, params)[0]
  // Hypothetischer voller Speicher lädt NUR die 5 kWh Einspeisung — nicht die 10 kWh Erzeugung.
  assertEq('partial-battery-charges-only-einspeisung', r.totals.geladen_kwh, 5)
  // Einspeisung-Sim 0, weil hypothetischer Speicher alle 5 kWh aufnehmen konnte.
  assertEq('partial-battery-einspeisung-sim-zero', r.totals.einspeisung_sim_kwh, 0)
  // Kein Netzbezug simuliert, weil auch im Original keiner war.
  assertEq('partial-battery-netzbezug-sim-zero', r.totals.netzbezug_sim_kwh, 0)
  // Invariante: geladen ≤ tatsächliche Einspeisung (keine Doppelzählung mit echter Batterie)
  assertTrue('partial-battery-no-double-counting',
    r.totals.geladen_kwh <= days[0].totals.einspeisung_kwh + 1e-9,
    `geladen=${r.totals.geladen_kwh} > einspeisung_ist=${days[0].totals.einspeisung_kwh}`)
}

// ── Run + Report ──
async function main() {
  console.log(`\n🧪 simulation.ts Characterization Tests  |  ${new Date().toISOString()}\n`)

  testModeDetection()
  testBatteryFullOverflow()
  testBatteryEmptyDeficit()
  testNetzbezugInvariant()
  testEfficiencyRoundtrip()
  testDepthOfDischarge()
  testSocCarryOverMultipleDays()
  testInitialSocBoundaries()
  testEmptyDays()
  testSurplusMode()
  testNoSimultaneousChargeDischarge()
  testSocMinMaxTracking()
  testPartiallyFunctioningRealBattery()

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
