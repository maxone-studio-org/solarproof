#!/usr/bin/env node
/**
 * Anlagen-Extreme — Edge-Cases für pathologische Anlagen/Speicher (Block 7).
 *
 * Synthetische Szenarien, die die Grenzen der Simulation testen:
 *  - 0 kWp-Anlage (keine Erzeugung)
 *  - Kein Speicher (0 kWh)
 *  - Mini-Speicher (1 kWh)
 *  - Groß-Speicher (30 kWh)
 *  - Extremer DoD (1% oder 100%)
 *  - Extreme Wirkungsgrade (50%, 100%)
 *  - Riesen-Einspeisung/Netzbezug pro Intervall
 *
 * Zweck: Keine Crashes, keine NaN/Infinity, Invarianten bleiben.
 */
import { runSimulation } from '../.test-build/simulation.mjs'
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
const isFinite = (x) => Number.isFinite(x)

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
function makeDay(date, intervals) {
  return {
    date, intervals,
    totals: {
      erzeugung_kwh: intervals.reduce((s, i) => s + i.erzeugung_kwh, 0),
      verbrauch_kwh: intervals.reduce((s, i) => s + i.verbrauch_kwh, 0),
      einspeisung_kwh: intervals.reduce((s, i) => s + i.einspeisung_kwh, 0),
      netzbezug_kwh: intervals.reduce((s, i) => s + i.netzbezug_kwh, 0),
    },
  }
}
const defaults = { kapazitaet_kwh: 10, entladetiefe_pct: 100, ladewirkungsgrad_pct: 100, entladewirkungsgrad_pct: 100, anfangs_soc_pct: 0 }

function allFinite(res) {
  for (const d of res) {
    for (const k of ['geladen_kwh', 'entladen_kwh', 'netzbezug_sim_kwh', 'einspeisung_sim_kwh', 'soc_min_kwh', 'soc_max_kwh']) {
      if (!isFinite(d.totals[k])) return false
    }
    for (const i of d.intervals) {
      if (!isFinite(i.soc_kwh) || !isFinite(i.geladen_kwh) || !isFinite(i.entladen_kwh)) return false
    }
  }
  return true
}

// ── 1. 0 kWp-Anlage (keine Erzeugung, nur Verbrauch) ──
function testZeroKwp() {
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T10:00:00Z', 0, 2, 0, 2),
    makeInterval('2024-06-15T14:00:00Z', 0, 3, 0, 3),
  ])]
  const r = runSimulation(days, defaults)
  assertEq('zero-kwp-no-charge', r[0].totals.geladen_kwh, 0)
  assertEq('zero-kwp-no-discharge', r[0].totals.entladen_kwh, 0)
  assertEq('zero-kwp-netzbezug-unchanged', r[0].totals.netzbezug_sim_kwh, 5)
  assertTrue('zero-kwp-finite', allFinite(r))
}

// ── 2. Kein Speicher (0 kWh) ──
function testNoBattery() {
  const params = { ...defaults, kapazitaet_kwh: 0 }
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T10:00:00Z', 5, 1, 4, 0),
    makeInterval('2024-06-15T14:00:00Z', 0, 3, 0, 3),
  ])]
  const r = runSimulation(days, params)
  assertEq('no-battery-no-charge', r[0].totals.geladen_kwh, 0)
  assertEq('no-battery-no-discharge', r[0].totals.entladen_kwh, 0)
  assertEq('no-battery-einspeisung-unchanged', r[0].totals.einspeisung_sim_kwh, 4)
  assertEq('no-battery-netzbezug-unchanged', r[0].totals.netzbezug_sim_kwh, 3)
  assertTrue('no-battery-finite', allFinite(r))
}

// ── 3. Mini-Speicher (1 kWh) ──
function testMiniBattery() {
  const params = { ...defaults, kapazitaet_kwh: 1 }
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T10:00:00Z', 5, 1, 4, 0), // 4 kWh Einspeisung, nur 1 kWh passt rein
    makeInterval('2024-06-15T14:00:00Z', 0, 3, 0, 3), // 3 kWh Netzbezug, 1 kWh aus Speicher
  ])]
  const r = runSimulation(days, params)
  assertEq('mini-charged-max-1', r[0].totals.geladen_kwh, 1)
  assertEq('mini-einspeisung-rest', r[0].totals.einspeisung_sim_kwh, 3)
  assertEq('mini-discharged', r[0].totals.entladen_kwh, 1)
  assertEq('mini-netzbezug-rest', r[0].totals.netzbezug_sim_kwh, 2)
  assertTrue('mini-soc-max-1', r[0].totals.soc_max_kwh <= 1 + 1e-9)
}

// ── 4. Groß-Speicher (30 kWh) ──
function testLargeBattery() {
  const params = { ...defaults, kapazitaet_kwh: 30 }
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T10:00:00Z', 25, 5, 20, 0), // alle 20 kWh passen rein
    makeInterval('2024-06-15T14:00:00Z', 0, 15, 0, 15), // 15 kWh aus Speicher (hat 20)
  ])]
  const r = runSimulation(days, params)
  assertEq('large-charged-all', r[0].totals.geladen_kwh, 20)
  assertEq('large-einspeisung-zero', r[0].totals.einspeisung_sim_kwh, 0)
  assertEq('large-discharged-all', r[0].totals.entladen_kwh, 15)
  assertEq('large-netzbezug-zero', r[0].totals.netzbezug_sim_kwh, 0)
  assertEq('large-soc-max', r[0].totals.soc_max_kwh, 20)
}

// ── 5. Extreme DoD: 1 % entladbar (sehr wenig nutzbare Kapazität) ──
function testExtremeDodLow() {
  const params = { ...defaults, kapazitaet_kwh: 10, entladetiefe_pct: 1, anfangs_soc_pct: 100 }
  // minSoc = 10 * (1 - 0.01) = 9.9. Start SoC = 10. Nutzbar: 0.1 kWh.
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T10:00:00Z', 0, 5, 0, 5),
  ])]
  const r = runSimulation(days, params)
  assertEq('dod-1pct-discharge-limited', r[0].totals.entladen_kwh, 0.1)
  assertEq('dod-1pct-netzbezug', r[0].totals.netzbezug_sim_kwh, 4.9)
  assertTrue('dod-1pct-finite', allFinite(r))
}

// ── 6. Extreme Wirkungsgrade: 50 % Lade-, 50 % Entlade-Effizienz ──
function testLowEfficiency() {
  const params = { ...defaults, kapazitaet_kwh: 10, ladewirkungsgrad_pct: 50, entladewirkungsgrad_pct: 50 }
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T10:00:00Z', 0, 0, 10, 0), // 10 kWh rein, aber nur 5 landen im Speicher
    makeInterval('2024-06-15T14:00:00Z', 0, 10, 0, 10), // 10 kWh Bedarf, Speicher kann nur 2.5 kWh liefern (5 kWh * 50%)
  ])]
  const r = runSimulation(days, params)
  assertEq('low-eff-charged', r[0].totals.geladen_kwh, 5)
  assertEq('low-eff-entladen', r[0].totals.entladen_kwh, 5) // 5 kWh aus Speicher raus, 2.5 kWh decken Bedarf
  assertEq('low-eff-netzbezug', r[0].totals.netzbezug_sim_kwh, 7.5)
  assertTrue('low-eff-finite', allFinite(r))
}

// ── 7. Riesen-Einspeisung pro Intervall (unrealistisch hoch) ──
function testHugeEinspeisung() {
  const params = { ...defaults, kapazitaet_kwh: 10 }
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T10:00:00Z', 1000, 0, 1000, 0),
  ])]
  const r = runSimulation(days, params)
  assertEq('huge-ein-charged-max', r[0].totals.geladen_kwh, 10)
  assertEq('huge-ein-overflow', r[0].totals.einspeisung_sim_kwh, 990)
  assertTrue('huge-ein-finite', allFinite(r))
  assertTrue('huge-ein-soc-bounded', r[0].totals.soc_max_kwh <= 10 + 1e-9)
}

// ── 8. Riesen-Netzbezug (Speicher leer, nichts zu geben) ──
function testHugeNetzbezug() {
  const params = { ...defaults, kapazitaet_kwh: 10, anfangs_soc_pct: 0 }
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T10:00:00Z', 0, 1000, 0, 1000),
  ])]
  const r = runSimulation(days, params)
  assertEq('huge-netz-no-discharge', r[0].totals.entladen_kwh, 0)
  assertEq('huge-netz-unchanged', r[0].totals.netzbezug_sim_kwh, 1000)
  assertTrue('huge-netz-finite', allFinite(r))
}

// ── 9. 100 % DoD + 100 % Effizienz → perfekte Simulation ──
function testIdealBattery() {
  const params = { ...defaults, kapazitaet_kwh: 10, anfangs_soc_pct: 50 }
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T10:00:00Z', 5, 0, 5, 0),
    makeInterval('2024-06-15T14:00:00Z', 0, 8, 0, 8),
  ])]
  const r = runSimulation(days, params)
  // 5 kWh rein → SoC 10. Dann 8 kWh Bedarf, Speicher gibt alle 10 frei.
  assertEq('ideal-charged', r[0].totals.geladen_kwh, 5)
  assertEq('ideal-entladen', r[0].totals.entladen_kwh, 8)
  assertEq('ideal-netzbezug-rest', r[0].totals.netzbezug_sim_kwh, 0)
}

// ── 10. Invariante: netzbezug_sim ≤ netzbezug_ist für extreme Konfigs ──
function testInvariantExtreme() {
  const configs = [
    { kapazitaet_kwh: 0, ladewirkungsgrad_pct: 100, entladewirkungsgrad_pct: 100, entladetiefe_pct: 100, anfangs_soc_pct: 0 },
    { kapazitaet_kwh: 1, ladewirkungsgrad_pct: 50, entladewirkungsgrad_pct: 50, entladetiefe_pct: 100, anfangs_soc_pct: 100 },
    { kapazitaet_kwh: 30, ladewirkungsgrad_pct: 100, entladewirkungsgrad_pct: 100, entladetiefe_pct: 50, anfangs_soc_pct: 100 },
    { kapazitaet_kwh: 100, ladewirkungsgrad_pct: 90, entladewirkungsgrad_pct: 90, entladetiefe_pct: 80, anfangs_soc_pct: 50 },
  ]
  const days = [makeDay('2024-06-15', [
    makeInterval('2024-06-15T10:00:00Z', 0, 5, 0, 5),
    makeInterval('2024-06-15T11:00:00Z', 10, 2, 8, 0),
    makeInterval('2024-06-15T14:00:00Z', 0, 10, 0, 10),
  ])]
  for (const [idx, c] of configs.entries()) {
    const r = runSimulation(days, c)
    const netzIst = days[0].totals.netzbezug_kwh
    const netzSim = r[0].totals.netzbezug_sim_kwh
    assertTrue(`invariant-ext-${idx}-netz`, netzSim <= netzIst + 1e-9, `sim=${netzSim}, ist=${netzIst}`)
    assertTrue(`invariant-ext-${idx}-finite`, allFinite(r))
  }
}

// ── Run + Report ──
async function main() {
  console.log(`\n🧪 Anlagen-Extreme Edge-Case Tests  |  ${new Date().toISOString()}\n`)

  testZeroKwp()
  testNoBattery()
  testMiniBattery()
  testLargeBattery()
  testExtremeDodLow()
  testLowEfficiency()
  testHugeEinspeisung()
  testHugeNetzbezug()
  testIdealBattery()
  testInvariantExtreme()

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
