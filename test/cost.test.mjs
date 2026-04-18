#!/usr/bin/env node
/**
 * cost.ts — Characterization Tests (Block 2 aus TESTING-ROADMAP.md)
 *
 * KLASSE-1-Code: jede Regel der Preisrechnung muss festgenagelt sein, damit
 * zukünftige Refactors keine stillen Regressionen einführen. Tests spiegeln
 * AKTUELLES Verhalten. Bei offenen Fragen an Max: `TODO-MAX:` im Kommentar.
 *
 * Vorher: `npm run test:build` — erzeugt .test-build/cost.mjs via esbuild.
 */
import { calculateCostComparison, getBdewPrices, getEffectivePrice, hasAnyCostInput, calculateStorageSavings } from '../.test-build/cost.mjs'
import process from 'node:process'

const results = []
const pass = (name, detail = '') => results.push({ name, ok: true, detail })
const fail = (name, detail = '') => results.push({ name, ok: false, detail })

function assertEq(name, actual, expected, tol = 0.01) {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const ok = Math.abs(actual - expected) <= Math.abs(expected) * tol + 1e-9
    return ok ? pass(name) : fail(name, `erwartet ${expected.toFixed(4)}, bekommen ${actual.toFixed(4)}`)
  }
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  return ok ? pass(name) : fail(name, `erwartet ${JSON.stringify(expected)}, bekommen ${JSON.stringify(actual)}`)
}
function assertTrue(name, cond, failDetail = '') {
  cond ? pass(name) : fail(name, failDetail)
}

// ── Helper: synthetische DayData bauen ──
function makeDay(date, erzeugung, verbrauch, einspeisung, netzbezug) {
  return {
    date,
    intervals: [], // cost.ts nutzt nur totals
    totals: {
      erzeugung_kwh: erzeugung,
      verbrauch_kwh: verbrauch,
      einspeisung_kwh: einspeisung,
      netzbezug_kwh: netzbezug,
    },
  }
}

function makeParams(overrides = {}) {
  return {
    kreditrate_eur_monat: 100,
    nachzahlung_eur_jahr: 500,
    nachzahlung_pro_jahr: {},
    rueckerstattung_eur_jahr: 0,
    wartung_eur_jahr: 0,
    cloud_eur_monat: 20,
    cloud_pro_monat: {},
    einspeiseverguetung_ct_kwh: 8.2,
    ...overrides,
  }
}

// ── getBdewPrices ──
function testBdewPrices() {
  const prices = getBdewPrices()
  assertTrue('bdew-has-all-years-2019-2026',
    prices.length === 8 && prices[0].year === 2019 && prices[7].year === 2026,
    `got ${prices.length} years: ${prices.map((p) => p.year).join(',')}`)

  // Spec v1.2: 2022 und 2023 haben Strompreisbremse-Cap von 40 ct/kWh mit capped_default=true
  const y2022 = prices.find((p) => p.year === 2022)
  const y2023 = prices.find((p) => p.year === 2023)
  assertTrue('bdew-2022-has-cap', y2022 && y2022.cap_ct === 40 && y2022.capped_default === true)
  assertTrue('bdew-2023-has-cap', y2023 && y2023.cap_ct === 40 && y2023.capped_default === true)
  assertTrue('bdew-2022-price-46_30', y2022 && y2022.price_ct === 46.30)

  // 2024+ ist cap wieder null (Preisbremse ausgelaufen)
  const y2024 = prices.find((p) => p.year === 2024)
  assertTrue('bdew-2024-no-cap', y2024 && y2024.cap_ct === null && y2024.capped_default === false)
}

// ── getEffectivePrice ──
function testEffectivePrice() {
  const prices = getBdewPrices()
  const y2022 = prices.find((p) => p.year === 2022) // price 46.30, cap 40, capped_default true
  const y2024 = prices.find((p) => p.year === 2024) // price 40.20, cap null

  // Cap aktiv → min(46.30, 40) = 40
  assertEq('effective-2022-cap-active', getEffectivePrice(y2022, true), 40)
  // Cap inaktiv → 46.30 (User deaktiviert Cap im Override)
  assertEq('effective-2022-cap-inactive', getEffectivePrice(y2022, false), 46.30)
  // 2024: kein cap vorhanden → capActive egal, immer 40.20
  assertEq('effective-2024-no-cap-active-ignored', getEffectivePrice(y2024, true), 40.20)
  assertEq('effective-2024-no-cap-inactive', getEffectivePrice(y2024, false), 40.20)
}

// ── calculateCostComparison: Basis-Szenario ──
function testBasicScenario() {
  // Vollständiges Jahr 2024 (12 Monate): 10 kWp Anlage
  // 10 000 kWh Erzeugung, 4 000 kWh Einspeisung, 6 000 kWh Eigenverbrauch
  // 5 000 kWh Verbrauch → 1 000 kWh Überschuss (nicht genutzter EV geht in Einspeisung)
  // Simulation: 12 Tage als Stellvertreter (einer pro Monat, mit korrekten Summen)
  const days = []
  for (let m = 1; m <= 12; m++) {
    const dateStr = `2024-${String(m).padStart(2, '0')}-15`
    days.push(makeDay(dateStr, 10000 / 12, 5000 / 12, 4000 / 12, 0))
  }
  const params = makeParams({
    kreditrate_eur_monat: 200, // 200 × 12 = 2400 EUR Kredit/Jahr
    nachzahlung_eur_jahr: 600,
    cloud_eur_monat: 30, // 30 × 12 = 360 EUR Cloud/Jahr
  })

  const results = calculateCostComparison(days, params, {})
  assertEq('basic-one-year-result', results.length, 1)

  const r = results[0]
  assertEq('basic-year', r.year, 2024)
  assertEq('basic-kreditrate', r.kreditrate_eur, 2400)
  // anteil = 12/12 = 1 → Nachzahlung voll
  assertEq('basic-nachzahlung', r.nachzahlung_eur, 600)
  assertEq('basic-cloud', r.cloud_eur, 360)
  // Gesamtkosten: 2400 + 600 + 0 + 360 - 0 = 3360
  // TODO-MAX: einspeiseverguetung_eur wird berechnet aber NICHT in gesamtkosten_eur
  // einbezogen. Aktuelles Verhalten: 3360. Wenn gewollt: 3360 − (4000 × 8.2/100) = 3032.
  assertEq('basic-gesamtkosten-excludes-einspeiseverguetung', r.gesamtkosten_eur, 3360)
  // Eigenverbrauch = erzeugung - einspeisung = 10000 - 4000 = 6000
  assertEq('basic-eigenverbrauch', r.eigenverbrauch_kwh, 6000)
  assertEq('basic-einspeisung', r.einspeisung_kwh, 4000)
  // Einspeisevergütung: 4000 × 8.2 / 100 = 328
  assertEq('basic-einspeiseverguetung', r.einspeiseverguetung_eur, 328)
  // 2024 BDEW: 40.20 ct/kWh, kein Cap
  assertEq('basic-strompreis', r.strompreis_ct, 40.20)
  // Äquivalent = 3360 / 0.402 = 8358.2 kWh
  assertEq('basic-aequivalent', r.aequivalent_kwh, 3360 / 0.402)
  // Differenz = eigenverbrauch - aequivalent = 6000 - 8358.2 = -2358.2 (Netzbezug günstiger)
  assertEq('basic-differenz', r.differenz_kwh, 6000 - 3360 / 0.402)
}

// ── Strompreisbremse 2022: Cap-Verhalten ──
function testStrompreisbremse() {
  const days = [makeDay('2022-06-15', 1000, 500, 500, 0)]
  const params = makeParams({ kreditrate_eur_monat: 100, cloud_eur_monat: 0 })

  // Default-Cap (capped_default=true) → Cap aktiv → 40 ct
  const resCapped = calculateCostComparison(days, params, {})
  assertEq('strompreisbremse-default-cap-applied', resCapped[0].strompreis_ct, 40)

  // User überschreibt Cap (deaktiviert) → 46.30 ct
  const resUncapped = calculateCostComparison(days, params, { 2022: false })
  assertEq('strompreisbremse-user-override-uncap', resUncapped[0].strompreis_ct, 46.30)

  // User aktiviert Cap explizit (war schon default aktiv) → 40 ct
  const resCapExplicit = calculateCostComparison(days, params, { 2022: true })
  assertEq('strompreisbremse-user-override-cap', resCapExplicit[0].strompreis_ct, 40)
}

// ── Teilzeit-Skalierung (anteil = monthsInData/12) ──
function testPartialYearScaling() {
  // Nur 6 Monate Daten → anteil 0.5 → Nachzahlung/Wartung/Rückerstattung halbiert
  const days = []
  for (let m = 1; m <= 6; m++) {
    days.push(makeDay(`2024-${String(m).padStart(2, '0')}-15`, 1000, 500, 500, 0))
  }
  const params = makeParams({
    kreditrate_eur_monat: 100,
    nachzahlung_eur_jahr: 600, // × 0.5 = 300
    wartung_eur_jahr: 200,     // × 0.5 = 100
    rueckerstattung_eur_jahr: 400, // × 0.5 = 200
    cloud_eur_monat: 20, // 20 × 6 = 120 (nach monthsInData, nicht nach anteil)
  })

  const r = calculateCostComparison(days, params, {})[0]
  assertEq('partial-year-kreditrate-6mo', r.kreditrate_eur, 600) // 100 × 6 Monate
  assertEq('partial-year-nachzahlung-scaled', r.nachzahlung_eur, 300)
  assertEq('partial-year-wartung-scaled', r.wartung_eur, 100)
  assertEq('partial-year-rueckerstattung-scaled', r.rueckerstattung_eur, 200)
  assertEq('partial-year-cloud-summed', r.cloud_eur, 120)
  // Gesamtkosten: 600 + 300 + 100 + 120 - 200 = 920
  assertEq('partial-year-gesamtkosten', r.gesamtkosten_eur, 920)
}

// ── nachzahlung_pro_jahr override ──
function testNachzahlungPerYearOverride() {
  const days = [makeDay('2023-06-15', 1000, 500, 500, 0), makeDay('2024-06-15', 1000, 500, 500, 0)]
  const params = makeParams({
    kreditrate_eur_monat: 0,
    cloud_eur_monat: 0,
    nachzahlung_eur_jahr: 500, // fallback
    nachzahlung_pro_jahr: { 2024: 800 }, // override für 2024
  })

  const results = calculateCostComparison(days, params, {})
  const y2023 = results.find((r) => r.year === 2023)
  const y2024 = results.find((r) => r.year === 2024)
  // anteil für 1 Monat Daten = 1/12
  assertEq('nachzahlung-2023-fallback', y2023.nachzahlung_eur, 500 / 12)
  assertEq('nachzahlung-2024-override', y2024.nachzahlung_eur, 800 / 12)
}

// ── cloud_pro_monat override ──
function testCloudPerMonthOverride() {
  const days = [
    makeDay('2024-01-15', 100, 50, 50, 0),
    makeDay('2024-02-15', 100, 50, 50, 0),
    makeDay('2024-03-15', 100, 50, 50, 0),
  ]
  const params = makeParams({
    kreditrate_eur_monat: 0,
    nachzahlung_eur_jahr: 0,
    cloud_eur_monat: 20, // fallback
    cloud_pro_monat: { '2024-02': 35 }, // Februar override
  })

  const r = calculateCostComparison(days, params, {})[0]
  // Jan 20 + Feb 35 + Mar 20 = 75
  assertEq('cloud-per-month-mixed', r.cloud_eur, 75)
}

// ── Edge: Einspeisung > Erzeugung (theoretisch unmöglich, aber Software-Sicherheit) ──
function testEigenverbrauchClamp() {
  // TODO-MAX: Ist das ein Datenfehler oder echt möglich? Aktuell: max(0, ev) → 0
  const days = [makeDay('2024-06-15', 500, 1000, 700, 0)] // Erzeugung 500, Einspeisung 700 → ev = -200
  const params = makeParams({ kreditrate_eur_monat: 0, cloud_eur_monat: 0 })
  const r = calculateCostComparison(days, params, {})[0]
  assertEq('eigenverbrauch-clamped-to-zero', r.eigenverbrauch_kwh, 0)
  assertEq('einspeisung-raw', r.einspeisung_kwh, 700)
}

// ── Edge: Jahr ohne BDEW-Preis wird silent skipped ──
function testMissingBdewYear() {
  // TODO-MAX: soll Jahr 2027+ expliziter Fehler sein oder weiter silent skippen?
  // Aktuell: silent skip (continue). Test dokumentiert das.
  const days = [
    makeDay('2024-06-15', 1000, 500, 500, 0), // 2024 in BDEW vorhanden
    makeDay('2099-06-15', 1000, 500, 500, 0), // Fantasie-Jahr → skip
  ]
  const params = makeParams()
  const results = calculateCostComparison(days, params, {})
  assertEq('missing-bdew-year-silent-skip-count', results.length, 1)
  assertEq('missing-bdew-year-keeps-2024', results[0].year, 2024)
}

// ── Edge: leere days-Liste ──
function testEmptyDays() {
  const results = calculateCostComparison([], makeParams(), {})
  assertEq('empty-days-returns-empty', results.length, 0)
}

// ── Mehrere Jahre, sortiert aufsteigend ──
function testMultiYearSortedAscending() {
  const days = [
    makeDay('2022-06-15', 1000, 500, 500, 0),
    makeDay('2021-06-15', 1000, 500, 500, 0),
    makeDay('2024-06-15', 1000, 500, 500, 0),
    makeDay('2023-06-15', 1000, 500, 500, 0),
  ]
  const results = calculateCostComparison(days, makeParams(), {})
  assertEq('multi-year-sorted', results.map((r) => r.year), [2021, 2022, 2023, 2024])
}

// ── hasAnyCostInput — Regression für Feedback 566350d7 ──
// Bug: Wenn User NUR Nachzahlung pro Jahr einträgt (flat = 0), wurde der Cost-
// Block im PDF geskipped → User sah "wird nicht gespeichert". Fix: hasAnyCostInput
// muss bei ALLEN cost-Feldern true liefern, auch bei Overrides ohne flat value.
function testHasAnyCostInputFlat() {
  assertTrue('has-empty-false', !hasAnyCostInput(makeParams({ kreditrate_eur_monat: 0, nachzahlung_eur_jahr: 0, cloud_eur_monat: 0 })))
  assertTrue('has-kreditrate-true', hasAnyCostInput(makeParams({ kreditrate_eur_monat: 100 })))
  assertTrue('has-nachzahlung-true', hasAnyCostInput(makeParams({ nachzahlung_eur_jahr: 500 })))
  assertTrue('has-cloud-true', hasAnyCostInput(makeParams({ cloud_eur_monat: 20 })))
}
function testHasAnyCostInputPerYearOverride() {
  // Die zentrale Regression: nur per-year gesetzt, flat = 0
  const params = makeParams({
    kreditrate_eur_monat: 0,
    nachzahlung_eur_jahr: 0,
    cloud_eur_monat: 0,
    nachzahlung_pro_jahr: { 2024: 800 },
  })
  assertTrue('has-per-year-nachzahlung-true', hasAnyCostInput(params), 'Bug: per-year nachzahlung wurde als "kein Input" gewertet')
}
function testHasAnyCostInputPerMonthOverride() {
  const params = makeParams({
    kreditrate_eur_monat: 0,
    nachzahlung_eur_jahr: 0,
    cloud_eur_monat: 0,
    cloud_pro_monat: { '2024-06': 35 },
  })
  assertTrue('has-per-month-cloud-true', hasAnyCostInput(params))
}
function testHasAnyCostInputZeroOverridesIgnored() {
  // Per-Year-Overrides mit 0 zählen nicht als "Input" (User hat sie nur leer stehen lassen)
  const params = makeParams({
    kreditrate_eur_monat: 0,
    nachzahlung_eur_jahr: 0,
    cloud_eur_monat: 0,
    nachzahlung_pro_jahr: { 2024: 0 },
  })
  assertTrue('has-zero-overrides-false', !hasAnyCostInput(params))
}

// ── calculateStorageSavings — Regression für Feedback b88c9218 ──
// Bug: PDF zeigte die Euro-Ersparnis durch den Speicher nicht. Neue Funktion
// berechnet (netzbezug_ist - netzbezug_sim) × BDEW-Preis pro Jahr.
function testStorageSavingsBasic() {
  // 2024: netzbezug_ist=1000 kWh, netzbezug_sim=600 kWh → 400 kWh gespart
  // × 40.20 ct/kWh (BDEW 2024) = 160.80 EUR
  const days = [makeDay('2024-06-15', 1000, 2000, 0, 1000)]
  const sim = [{ date: '2024-06-15', totals: { netzbezug_sim_kwh: 600 } }]
  const res = calculateStorageSavings(days, sim, {})
  assertEq('storage-savings-year-count', res.perYear.length, 1)
  assertEq('storage-savings-kwh', res.perYear[0].kwh, 400)
  assertEq('storage-savings-ct', res.perYear[0].ct_per_kwh, 40.20)
  assertEq('storage-savings-eur', res.perYear[0].eur, 160.80)
  assertEq('storage-savings-total', res.totalEur, 160.80)
}
function testStorageSavingsMultiYear() {
  const days = [
    makeDay('2023-06-15', 500, 1000, 0, 500),
    makeDay('2024-06-15', 500, 1000, 0, 500),
  ]
  const sim = [
    { date: '2023-06-15', totals: { netzbezug_sim_kwh: 300 } },
    { date: '2024-06-15', totals: { netzbezug_sim_kwh: 200 } },
  ]
  const res = calculateStorageSavings(days, sim, {})
  assertEq('storage-savings-multi-count', res.perYear.length, 2)
  assertEq('storage-savings-2023-sorted', res.perYear[0].year, 2023)
  assertEq('storage-savings-2024-sorted', res.perYear[1].year, 2024)
}
function testStorageSavingsWithCapOverride() {
  // 2023 default gedeckelt auf 40 ct; override=false → voller Preis 47 ct
  const days = [makeDay('2023-06-15', 0, 1000, 0, 1000)]
  const sim = [{ date: '2023-06-15', totals: { netzbezug_sim_kwh: 500 } }]
  const capped = calculateStorageSavings(days, sim, {})
  const uncapped = calculateStorageSavings(days, sim, { 2023: false })
  assertEq('storage-savings-capped-ct', capped.perYear[0].ct_per_kwh, 40)
  assertEq('storage-savings-uncapped-ct', uncapped.perYear[0].ct_per_kwh, 47)
}
function testStorageSavingsEmptySim() {
  const days = [makeDay('2024-06-15', 0, 1000, 0, 1000)]
  const res = calculateStorageSavings(days, [], {})
  assertEq('storage-savings-no-sim-year-count', res.perYear.length, 1)
  assertEq('storage-savings-no-sim-kwh', res.perYear[0].kwh, 1000)
}
function testStorageSavingsMissingBdew() {
  // 2017 hat keinen BDEW-Preis → Jahr wird übersprungen
  const days = [makeDay('2017-06-15', 0, 1000, 0, 1000)]
  const sim = [{ date: '2017-06-15', totals: { netzbezug_sim_kwh: 500 } }]
  const res = calculateStorageSavings(days, sim, {})
  assertEq('storage-savings-missing-bdew-skipped', res.perYear.length, 0)
}

// ── Run + Report ──
async function main() {
  console.log(`\n🧪 cost.ts Characterization Tests  |  ${new Date().toISOString()}\n`)

  testBdewPrices()
  testEffectivePrice()
  testBasicScenario()
  testStrompreisbremse()
  testPartialYearScaling()
  testNachzahlungPerYearOverride()
  testCloudPerMonthOverride()
  testEigenverbrauchClamp()
  testMissingBdewYear()
  testEmptyDays()
  testMultiYearSortedAscending()
  testHasAnyCostInputFlat()
  testHasAnyCostInputPerYearOverride()
  testHasAnyCostInputPerMonthOverride()
  testHasAnyCostInputZeroOverridesIgnored()
  testStorageSavingsBasic()
  testStorageSavingsMultiYear()
  testStorageSavingsWithCapOverride()
  testStorageSavingsEmptySim()
  testStorageSavingsMissingBdew()

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
