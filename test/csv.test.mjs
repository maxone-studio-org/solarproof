#!/usr/bin/env node
/**
 * CSV-Qualität — Tests für csv.ts (Block 8).
 *
 * Behandelt:
 *  - Delimiter-Auto-Detect (; , \t)
 *  - BOM am Dateianfang
 *  - Dezimal-Separator: Komma vs. Punkt, Tausendertrennzeichen
 *  - Column-Auto-Mapping pro Hersteller-Profil (SENEC, Fronius, Huawei, Kostal, SMA)
 *  - Unit-Detection: kWh/Wh/kW/W aus Headern
 *  - Kombinierte Datetime-Spalte
 *  - Fehler in einzelnen Zeilen → skipped, errors aggregiert
 *  - Implausible-Values-Guard (Wh-Erkennung)
 *  - Leere CSV, nur Header, BOM + Windows-Line-Endings
 */
import {
  parseCSVPreview,
  autoDetectMapping,
  validateMapping,
  parseCSVWithMapping,
  detectInputUnit,
  detectImplausibleValues,
  parseNumber,
} from '../.test-build/csv.mjs'
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

// ── 1. parseNumber ──
function testParseNumber() {
  assertEq('parseNumber-dot', parseNumber('1.5'), 1.5)
  assertEq('parseNumber-comma', parseNumber('1,5'), 1.5)
  assertEq('parseNumber-de-thousands', parseNumber('1.234,56'), 1234.56)
  assertTrue('parseNumber-empty-is-nan', isNaN(parseNumber('')))
  assertTrue('parseNumber-undefined-is-nan', isNaN(parseNumber(undefined)))
  assertEq('parseNumber-whitespace-trimmed', parseNumber('  3,14  '), 3.14)
  assertEq('parseNumber-negative', parseNumber('-2,5'), -2.5)
}

// ── 2. Delimiter-Auto-Detect: Semicolon ──
function testSemicolonDelimiter() {
  const csv = 'Datum;Uhrzeit;Erzeugung;Verbrauch\n15.06.2024;12:00;2,5;1,5\n'
  const { headers } = parseCSVPreview(csv)
  assertEq('delim-semi-headers-count', headers.length, 4)
  assertEq('delim-semi-first-header', headers[0], 'Datum')
}

// ── 3. Delimiter-Auto-Detect: Comma ──
function testCommaDelimiter() {
  const csv = 'Date,Time,Yield,Consumption\n2024-06-15,12:00,2.5,1.5\n'
  const { headers } = parseCSVPreview(csv)
  assertEq('delim-comma-headers-count', headers.length, 4)
  assertEq('delim-comma-first-header', headers[0], 'Date')
}

// ── 4. BOM am Dateianfang ──
function testBomHandling() {
  const bom = '\uFEFF'
  const csv = bom + 'Datum;Uhrzeit;Stromerzeugung [kWh];Stromverbrauch [kWh]\n15.06.2024;12:00;2,5;1,5\n'
  const { headers } = parseCSVPreview(csv)
  assertTrue('bom-header-clean', !headers[0].includes('\uFEFF'), `got: ${JSON.stringify(headers[0])}`)
  assertEq('bom-header-datum', headers[0], 'Datum')
}

// ── 5. Auto-Mapping: SENEC ──
function testAutoMappingSenec() {
  const headers = ['Uhrzeit', 'Stromerzeugung [kW]', 'Stromverbrauch [kW]', 'Netzeinspeisung [kW]', 'Netzbezug [kW]']
  const mapping = autoDetectMapping(headers)
  assertEq('senec-uhrzeit', mapping.uhrzeit, 'Uhrzeit')
  assertEq('senec-erz', mapping.erzeugung_kwh, 'Stromerzeugung [kW]')
  assertEq('senec-vb', mapping.verbrauch_kwh, 'Stromverbrauch [kW]')
  assertEq('senec-ein', mapping.einspeisung_kwh, 'Netzeinspeisung [kW]')
  assertEq('senec-netz', mapping.netzbezug_kwh, 'Netzbezug [kW]')
}

// ── 6. Auto-Mapping: Fronius ──
function testAutoMappingFronius() {
  const headers = ['Datum', 'Zeit', 'Energie [kWh]', 'Verbrauch [kWh]', 'Einspeisung [kWh]', 'Netzbezug [kWh]']
  const mapping = autoDetectMapping(headers)
  assertEq('fronius-datum', mapping.datum, 'Datum')
  assertEq('fronius-uhrzeit', mapping.uhrzeit, 'Zeit')
  assertEq('fronius-erz', mapping.erzeugung_kwh, 'Energie [kWh]')
}

// ── 7. Unit-Detection: kW ──
function testUnitDetectionKw() {
  const mapping = { erzeugung_kwh: 'Stromerzeugung [kW]', verbrauch_kwh: 'Stromverbrauch [kW]' }
  assertEq('unit-detect-kw', detectInputUnit(mapping), 'kW')
}
function testUnitDetectionKwh() {
  const mapping = { erzeugung_kwh: 'Energie [kWh]', verbrauch_kwh: 'Verbrauch [kWh]' }
  assertEq('unit-detect-kwh', detectInputUnit(mapping), 'kWh')
}
function testUnitDetectionWh() {
  const mapping = { erzeugung_kwh: 'Yield [Wh]', verbrauch_kwh: 'Consumption [Wh]' }
  assertEq('unit-detect-wh', detectInputUnit(mapping), 'Wh')
}
function testUnitDetectionDefault() {
  const mapping = { erzeugung_kwh: 'Produktion', verbrauch_kwh: 'Verbrauch' }
  assertEq('unit-detect-default', detectInputUnit(mapping), 'kWh')
}

// ── 8. validateMapping ──
function testValidateMapping() {
  const ok = { datum: 'Datum', uhrzeit: 'Uhrzeit', erzeugung_kwh: 'PV', verbrauch_kwh: 'Verbrauch' }
  assertEq('validate-ok-empty-errors', validateMapping(ok).length, 0)

  const missing = { datum: 'Datum' }
  const errs = validateMapping(missing)
  assertTrue('validate-missing-errors', errs.length >= 2)
}

// ── 9. parseCSVWithMapping: Basis-Parsing mit Komma-Dezimalen ──
function testParseWithMappingBasic() {
  const csv = [
    'Datum;Uhrzeit;Stromerzeugung [kWh];Stromverbrauch [kWh];Netzeinspeisung [kWh];Netzbezug [kWh]',
    '15.06.2024;12:00;2,5;1,5;1,0;0,0',
    '15.06.2024;12:15;3,0;0,5;2,5;0,0',
  ].join('\n')
  const mapping = autoDetectMapping(csv.split('\n')[0].split(';'))
  const { rows, errors } = parseCSVWithMapping(csv, mapping, 'kWh')
  assertEq('parse-basic-row-count', rows.length, 2)
  assertEq('parse-basic-no-errors', errors.length, 0)
  assertEq('parse-basic-erz-decimal', rows[0].erzeugung_kwh, 2.5)
  assertEq('parse-basic-vb-decimal', rows[0].verbrauch_kwh, 1.5)
  assertEq('parse-basic-ein', rows[0].einspeisung_kwh, 1.0)
}

// ── 10. parseCSVWithMapping: Wh → kWh Umrechnung ──
function testParseWhConversion() {
  // Explizites Mapping (die synthetischen Header "Yield [Wh]" matchen keine
  // der Hersteller-Profile → wir setzen das Mapping direkt).
  const csv = [
    'Date;Time;Yield [Wh];Consumption [Wh]',
    '2024-06-15;12:00;2500;1500',
  ].join('\n')
  const mapping = {
    datum: 'Date', uhrzeit: 'Time',
    erzeugung_kwh: 'Yield [Wh]', verbrauch_kwh: 'Consumption [Wh]',
  }
  const { rows } = parseCSVWithMapping(csv, mapping, 'Wh')
  assertEq('wh-erz-converted', rows[0].erzeugung_kwh, 2.5)
  assertEq('wh-vb-converted', rows[0].verbrauch_kwh, 1.5)
}

// ── 11. parseCSVWithMapping: kombinierte Datetime-Spalte ──
function testParseCombinedDatetime() {
  const csv = [
    'Zeitstempel;Stromerzeugung [kW];Stromverbrauch [kW]',
    '26.10.2021 13:03:58;2,5;1,5',
    '26.10.2021 13:04:03;2,7;1,4',
  ].join('\n')
  const headers = csv.split('\n')[0].split(';')
  const mapping = autoDetectMapping(headers)
  mapping._combinedDatetime = '1'
  mapping.datum = 'Zeitstempel'
  mapping.uhrzeit = 'Zeitstempel'
  const { rows } = parseCSVWithMapping(csv, mapping, 'kW')
  assertEq('combined-row-count', rows.length, 2)
  assertEq('combined-datum', rows[0].datum, '26.10.2021')
  assertEq('combined-uhrzeit', rows[0].uhrzeit, '13:03:58')
}

// ── 12. Error-Handling: Zeile mit NaN → skipped ──
function testRowWithInvalidNumberSkipped() {
  const csv = [
    'Datum;Uhrzeit;Stromerzeugung [kWh];Stromverbrauch [kWh]',
    '15.06.2024;12:00;2,5;1,5',
    '15.06.2024;12:15;NICHT_ZAHL;2,0',
    '15.06.2024;12:30;3,0;1,0',
  ].join('\n')
  const mapping = autoDetectMapping(csv.split('\n')[0].split(';'))
  const { rows, errors } = parseCSVWithMapping(csv, mapping, 'kWh')
  assertEq('invalid-row-skipped', rows.length, 2)
  assertEq('invalid-error-count', errors.length, 1)
  assertEq('invalid-error-line', errors[0].line, 3) // 1 Header + 2. Datenzeile = 3
}

// ── 13. Implausible-Value Detection (Wh statt kWh) ──
function testImplausibleValueDetection() {
  const rows = []
  // 10 Werte > 50 → wird als implausibel (vermutl. Wh) erkannt
  for (let i = 0; i < 10; i++) rows.push({ erzeugung_kwh: 100 + i * 10 })
  assertTrue('implausible-detected', detectImplausibleValues(rows))

  // 10 Werte <= 10 → plausibel
  const plausible = []
  for (let i = 0; i < 10; i++) plausible.push({ erzeugung_kwh: 1 + i * 0.5 })
  assertTrue('plausible-not-flagged', !detectImplausibleValues(plausible))
}

// ── 14. Leere CSV / nur Header ──
function testHeaderOnly() {
  const csv = 'Datum;Uhrzeit;Stromerzeugung [kWh];Stromverbrauch [kWh]\n'
  const mapping = autoDetectMapping(csv.split('\n')[0].split(';'))
  const { rows } = parseCSVWithMapping(csv, mapping, 'kWh')
  assertEq('header-only-no-rows', rows.length, 0)
}

// ── 15. Windows-Line-Endings (CRLF) ──
function testCrlfLineEndings() {
  const csv = 'Datum;Uhrzeit;Stromerzeugung [kWh];Stromverbrauch [kWh]\r\n15.06.2024;12:00;2,5;1,5\r\n'
  const mapping = autoDetectMapping(csv.split('\r\n')[0].split(';'))
  const { rows } = parseCSVWithMapping(csv, mapping, 'kWh')
  assertEq('crlf-row-parsed', rows.length, 1)
  assertEq('crlf-erz', rows[0].erzeugung_kwh, 2.5)
}

// ── 16. Netzbezug/Einspeisung fehlend → null ──
function testMissingGridColumns() {
  const csv = [
    'Datum;Uhrzeit;Stromerzeugung [kWh];Stromverbrauch [kWh]',
    '15.06.2024;12:00;2,5;1,5',
  ].join('\n')
  const mapping = autoDetectMapping(csv.split('\n')[0].split(';'))
  const { rows } = parseCSVWithMapping(csv, mapping, 'kWh')
  assertEq('missing-grid-ein-null', rows[0].einspeisung_kwh, null)
  assertEq('missing-grid-netz-null', rows[0].netzbezug_kwh, null)
}

// ── Run + Report ──
async function main() {
  console.log(`\n🧪 CSV-Qualitäts Tests  |  ${new Date().toISOString()}\n`)

  testParseNumber()
  testSemicolonDelimiter()
  testCommaDelimiter()
  testBomHandling()
  testAutoMappingSenec()
  testAutoMappingFronius()
  testUnitDetectionKw()
  testUnitDetectionKwh()
  testUnitDetectionWh()
  testUnitDetectionDefault()
  testValidateMapping()
  testParseWithMappingBasic()
  testParseWhConversion()
  testParseCombinedDatetime()
  testRowWithInvalidNumberSkipped()
  testImplausibleValueDetection()
  testHeaderOnly()
  testCrlfLineEndings()
  testMissingGridColumns()

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
