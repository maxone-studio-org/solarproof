import Papa from 'papaparse'
import type { ColumnMapping, RawDataRow, ManufacturerProfile } from '../types'

/** Known manufacturer synonyms for auto-mapping */
export const MANUFACTURER_PROFILES: ManufacturerProfile[] = [
  {
    name: 'SMA',
    synonyms: {
      datum: ['Date', 'Datum', 'date', 'Day'],
      uhrzeit: ['Time', 'Uhrzeit', 'time', 'Timestamp'],
      erzeugung_kwh: ['PV Power', 'PV Generation', 'PV Erzeugung', 'Total Yield', 'Erzeugung', 'Produktion', 'Production'],
      verbrauch_kwh: ['Consumption', 'Verbrauch', 'Total Consumption', 'Hausverbrauch', 'Load'],
      einspeisung_kwh: ['Feed-in', 'Grid Feed-in', 'Einspeisung', 'Grid Export', 'Export'],
      netzbezug_kwh: ['Grid Consumption', 'Grid Purchase', 'Netzbezug', 'Grid Import', 'Import'],
    },
  },
  {
    name: 'Fronius',
    synonyms: {
      datum: ['Datum', 'Date'],
      uhrzeit: ['Zeit', 'Time'],
      erzeugung_kwh: ['Energie [kWh]', 'Energy [kWh]', 'PV-Erzeugung'],
      verbrauch_kwh: ['Verbrauch [kWh]', 'Consumption [kWh]'],
      einspeisung_kwh: ['Einspeisung [kWh]', 'Feed-in [kWh]'],
      netzbezug_kwh: ['Netzbezug [kWh]', 'Grid consumption [kWh]'],
    },
  },
  {
    name: 'Huawei',
    synonyms: {
      datum: ['Date', 'Collect Time'],
      uhrzeit: ['Time', 'Collect Time'],
      erzeugung_kwh: ['Inverter Yield(kWh)', 'PV Yield', 'Yield'],
      verbrauch_kwh: ['Consumption(kWh)', 'Consumption'],
      einspeisung_kwh: ['On-grid Energy(kWh)', 'Feed to Grid'],
      netzbezug_kwh: ['Grid Consumption(kWh)', 'Purchase from Grid'],
    },
  },
  {
    name: 'Kostal',
    synonyms: {
      datum: ['Datum', 'Date'],
      uhrzeit: ['Uhrzeit', 'Time'],
      erzeugung_kwh: ['Ertrag (kWh)', 'Yield (kWh)', 'PV-Leistung'],
      verbrauch_kwh: ['Verbrauch (kWh)', 'Consumption (kWh)'],
      einspeisung_kwh: ['Einspeisung (kWh)', 'Feed-in (kWh)'],
      netzbezug_kwh: ['Netzbezug (kWh)', 'Grid purchase (kWh)'],
    },
  },
  {
    name: 'SENEC',
    synonyms: {
      datum: ['Datum', 'Date', 'Zeitstempel', 'Uhrzeit'],
      uhrzeit: ['Uhrzeit', 'Time', 'Zeitstempel'],
      erzeugung_kwh: [
        'Stromerzeugung', 'Stromerzeugung [kWh]', 'Stromerzeugung [kW]',
        'PV-Erzeugung', 'PV Generation', 'Erzeugung', 'Erzeugung [kWh]',
      ],
      verbrauch_kwh: [
        'Stromverbrauch', 'Stromverbrauch [kWh]', 'Stromverbrauch [kW]',
        'Verbrauch', 'Consumption', 'Verbrauch [kWh]', 'Hausverbrauch',
      ],
      einspeisung_kwh: [
        'Netzeinspeisung', 'Netzeinspeisung [kWh]', 'Netzeinspeisung [kW]',
        'Einspeisung', 'Feed-in', 'Einspeisung [kWh]',
      ],
      netzbezug_kwh: [
        'Netzbezug', 'Netzbezug [kWh]', 'Netzbezug [kW]',
        'Strombezug', 'Grid Import', 'Bezug [kWh]',
      ],
    },
  },
]

const INTERNAL_FIELDS = ['datum', 'uhrzeit', 'erzeugung_kwh', 'verbrauch_kwh', 'einspeisung_kwh', 'netzbezug_kwh'] as const
const REQUIRED_FIELDS = ['datum', 'erzeugung_kwh', 'verbrauch_kwh'] as const // uhrzeit not required if datetime combined

/** Parse CSV text and return header + preview rows. Auto-detects delimiter. */
export function parseCSVPreview(text: string): { headers: string[]; preview: string[][] } {
  const result = Papa.parse<string[]>(text, {
    header: false,
    preview: 6,
    skipEmptyLines: true,
    delimiter: '', // auto-detect
  })
  const [headers, ...rows] = result.data
  return { headers, preview: rows }
}

/** Auto-detect column mapping from CSV headers */
export function autoDetectMapping(csvHeaders: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}

  // Check if there's a combined datetime column (datum+uhrzeit same column)
  let combinedDatetime = false

  for (const field of INTERNAL_FIELDS) {
    // Exact match first
    const exactMatch = csvHeaders.find(
      (h) => h.toLowerCase().trim() === field.toLowerCase()
    )
    if (exactMatch) {
      mapping[field] = exactMatch
      continue
    }

    // Synonym match across all manufacturers
    for (const profile of MANUFACTURER_PROFILES) {
      const synonyms = profile.synonyms[field] ?? []
      const match = csvHeaders.find((h) =>
        synonyms.some((s) => h.trim().toLowerCase() === s.toLowerCase())
      )
      if (match) {
        mapping[field] = match
        break
      }
    }
  }

  // If datum and uhrzeit map to the same column → combined datetime
  if (mapping.datum && mapping.uhrzeit && mapping.datum === mapping.uhrzeit) {
    combinedDatetime = true
  }

  // If there's no separate datum column but uhrzeit is set → try combined
  if (!mapping.datum && mapping.uhrzeit) {
    mapping.datum = mapping.uhrzeit
    combinedDatetime = true
  }

  // Store the combined flag in a special mapping key
  if (combinedDatetime) {
    mapping._combinedDatetime = '1'
  }

  return mapping
}

/** Validate that all required fields are mapped */
export function validateMapping(mapping: ColumnMapping): string[] {
  const errors: string[] = []
  for (const field of REQUIRED_FIELDS) {
    if (!mapping[field]) {
      errors.push(`Pflichtfeld "${field}" ist nicht zugeordnet.`)
    }
  }
  // datum is always required
  if (!mapping.datum) {
    errors.push(`Pflichtfeld "datum" ist nicht zugeordnet.`)
  }
  return errors
}

/** Normalize a numeric string: handle comma decimal separators */
function parseNumber(value: string | undefined): number {
  if (!value) return NaN
  // Replace comma decimal separator with dot (German format)
  const normalized = value.trim().replace(',', '.')
  return parseFloat(normalized)
}

/** Parse full CSV with confirmed mapping and return RawDataRow[] */
export function parseCSVWithMapping(
  text: string,
  mapping: ColumnMapping
): { rows: RawDataRow[]; errors: { line: number; message: string }[] } {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter: '', // auto-detect
  })

  const rows: RawDataRow[] = []
  const errors: { line: number; message: string }[] = []
  const isCombined = mapping._combinedDatetime === '1'

  for (let i = 0; i < result.data.length; i++) {
    const raw = result.data[i]
    const lineNum = i + 2

    try {
      let datumVal: string
      let uhrzeitVal: string

      if (isCombined) {
        // Combined datetime in one column — split into date + time
        const combined = mapping.datum ? raw[mapping.datum]?.trim() : ''
        if (!combined) {
          errors.push({ line: lineNum, message: 'Zeitstempel fehlt' })
          continue
        }
        const parts = splitDateTime(combined)
        datumVal = parts.datum
        uhrzeitVal = parts.uhrzeit
      } else {
        datumVal = mapping.datum ? raw[mapping.datum]?.trim() : ''
        uhrzeitVal = mapping.uhrzeit ? raw[mapping.uhrzeit]?.trim() : ''
        if (!datumVal || !uhrzeitVal) {
          errors.push({ line: lineNum, message: 'Datum oder Uhrzeit fehlt' })
          continue
        }
      }

      const erzeugung = parseNumber(mapping.erzeugung_kwh ? raw[mapping.erzeugung_kwh] : '0')
      const verbrauch = parseNumber(mapping.verbrauch_kwh ? raw[mapping.verbrauch_kwh] : '0')

      if (isNaN(erzeugung) || isNaN(verbrauch)) {
        errors.push({ line: lineNum, message: 'Erzeugung oder Verbrauch ist keine gültige Zahl' })
        continue
      }

      const einspeisung = mapping.einspeisung_kwh
        ? parseNumber(raw[mapping.einspeisung_kwh]) || null
        : null
      const netzbezug = mapping.netzbezug_kwh
        ? parseNumber(raw[mapping.netzbezug_kwh]) || null
        : null

      rows.push({
        datum: datumVal,
        uhrzeit: uhrzeitVal,
        erzeugung_kwh: erzeugung,
        verbrauch_kwh: verbrauch,
        einspeisung_kwh: einspeisung,
        netzbezug_kwh: netzbezug,
        sourceFileIndex: 0,
      })
    } catch {
      errors.push({ line: lineNum, message: 'Zeile konnte nicht verarbeitet werden' })
    }
  }

  return { rows, errors }
}

/** Split a combined datetime string into date and time parts */
function splitDateTime(combined: string): { datum: string; uhrzeit: string } {
  // Try common patterns:
  // "26.10.2021 13:03:58" → datum="26.10.2021", uhrzeit="13:03:58"
  // "2021-10-26 13:03:58" → datum="2021-10-26", uhrzeit="13:03:58"
  // "2021-10-26T13:03:58" → datum="2021-10-26", uhrzeit="13:03:58"

  const tSplit = combined.split('T')
  if (tSplit.length === 2) {
    return { datum: tSplit[0], uhrzeit: tSplit[1] }
  }

  const spaceSplit = combined.split(' ')
  if (spaceSplit.length >= 2) {
    return { datum: spaceSplit[0], uhrzeit: spaceSplit.slice(1).join(' ') }
  }

  // Fallback: treat entire string as datetime
  return { datum: combined, uhrzeit: '00:00' }
}

export { INTERNAL_FIELDS, REQUIRED_FIELDS }
