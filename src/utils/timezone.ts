import { parse, isValid } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { RawDataRow, MeasurementInterval, DayData, DstWarning } from '../types'

const TZ = 'Europe/Berlin'

/** Supported date formats for auto-detection */
const DATE_FORMATS = [
  'dd.MM.yyyy',   // 01.03.2025
  'yyyy-MM-dd',   // 2025-03-01
  'dd/MM/yyyy',   // 01/03/2025
  'MM/dd/yyyy',   // 03/01/2025
]

const TIME_FORMATS = [
  'HH:mm:ss',
  'HH:mm',
]

/** Detect date format from first few values */
function detectDateFormat(samples: string[]): string | null {
  for (const fmt of DATE_FORMATS) {
    const allValid = samples.every((s) => {
      const d = parse(s.trim(), fmt, new Date())
      return isValid(d)
    })
    if (allValid) return fmt
  }
  return null
}

/** Detect time format from first few values */
function detectTimeFormat(samples: string[]): string | null {
  for (const fmt of TIME_FORMATS) {
    const allValid = samples.every((s) => {
      const d = parse(s.trim(), fmt, new Date())
      return isValid(d)
    })
    if (allValid) return fmt
  }
  return null
}

/** Convert raw rows to MeasurementIntervals with UTC timestamps, grouped by day */
export function processRawData(
  rows: RawDataRow[],
  inputIsUTC: boolean = false
): { days: DayData[]; warnings: DstWarning[] } {
  if (rows.length === 0) return { days: [], warnings: [] }

  const dateSamples = rows.slice(0, 10).map((r) => r.datum)
  const timeSamples = rows.slice(0, 10).map((r) => r.uhrzeit)

  const dateFmt = detectDateFormat(dateSamples)
  const timeFmt = detectTimeFormat(timeSamples)

  if (!dateFmt) throw new Error(`Datumsformat nicht erkannt. Beispiel: "${dateSamples[0]}"`)
  if (!timeFmt) throw new Error(`Zeitformat nicht erkannt. Beispiel: "${timeSamples[0]}"`)

  const intervals: MeasurementInterval[] = []
  const warnings: DstWarning[] = []

  for (const row of rows) {
    const localDateTime = parse(
      `${row.datum.trim()} ${row.uhrzeit.trim()}`,
      `${dateFmt} ${timeFmt}`,
      new Date()
    )

    if (!isValid(localDateTime)) continue

    let utcTimestamp: Date
    if (inputIsUTC) {
      utcTimestamp = localDateTime
    } else {
      utcTimestamp = fromZonedTime(localDateTime, TZ)
    }

    intervals.push({
      timestamp: utcTimestamp,
      erzeugung_kwh: row.erzeugung_kwh,
      verbrauch_kwh: row.verbrauch_kwh,
      einspeisung_kwh: row.einspeisung_kwh ?? 0,
      netzbezug_kwh: row.netzbezug_kwh ?? 0,
      sourceFileIndex: row.sourceFileIndex,
    })
  }

  // Group by day (in Berlin timezone)
  const dayMap = new Map<string, MeasurementInterval[]>()

  for (const interval of intervals) {
    const berlinTime = toZonedTime(interval.timestamp, TZ)
    const dayKey = `${berlinTime.getFullYear()}-${String(berlinTime.getMonth() + 1).padStart(2, '0')}-${String(berlinTime.getDate()).padStart(2, '0')}`

    if (!dayMap.has(dayKey)) dayMap.set(dayKey, [])
    dayMap.get(dayKey)!.push(interval)
  }

  // Check DST anomalies — only on actual DST transition days
  // Spring: last Sunday in March. Fall: last Sunday in October.
  const dstDays = new Set<string>()
  const years = new Set<number>()
  for (const dayKey of dayMap.keys()) {
    years.add(parseInt(dayKey.substring(0, 4)))
  }
  for (const year of years) {
    // Last Sunday in March
    for (let d = 31; d >= 25; d--) {
      const date = new Date(year, 2, d) // March
      if (date.getDay() === 0) { dstDays.add(`${year}-03-${String(d).padStart(2, '0')}`); break }
    }
    // Last Sunday in October
    for (let d = 31; d >= 25; d--) {
      const date = new Date(year, 9, d) // October
      if (date.getDay() === 0) { dstDays.add(`${year}-10-${String(d).padStart(2, '0')}`); break }
    }
  }

  for (const dayKey of dstDays) {
    const dayIntervals = dayMap.get(dayKey)
    if (!dayIntervals || dayIntervals.length === 0) continue

    const hours = dayIntervals.map((i) => {
      const b = toZonedTime(i.timestamp, TZ)
      return b.getHours()
    })

    const month = parseInt(dayKey.split('-')[1])

    if (month === 3) {
      const has1am = hours.includes(1)
      const has3am = hours.includes(3)
      const has2am = hours.includes(2)
      if (has1am && has3am && !has2am) {
        warnings.push({
          date: dayKey,
          type: 'missing_hour',
          message: `${dayKey}: Sommerzeitumstellung — Stunde 02:00 fehlt (erwartet).`,
        })
      }
    }

    if (month === 10) {
      const count2am = hours.filter((h) => h === 2).length
      if (count2am > 1) {
        warnings.push({
          date: dayKey,
          type: 'double_hour',
          message: `${dayKey}: Winterzeitumstellung — Stunde 02:00 doppelt vorhanden (erwartet).`,
        })
      }
    }
  }

  // Build DayData[]
  const days: DayData[] = []
  const sortedKeys = [...dayMap.keys()].sort()

  for (const dayKey of sortedKeys) {
    const dayIntervals = dayMap.get(dayKey)!
    dayIntervals.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    days.push({
      date: dayKey,
      intervals: dayIntervals,
      totals: {
        erzeugung_kwh: sum(dayIntervals, 'erzeugung_kwh'),
        verbrauch_kwh: sum(dayIntervals, 'verbrauch_kwh'),
        einspeisung_kwh: sum(dayIntervals, 'einspeisung_kwh'),
        netzbezug_kwh: sum(dayIntervals, 'netzbezug_kwh'),
      },
    })
  }

  return { days, warnings }
}

function sum(intervals: MeasurementInterval[], key: keyof MeasurementInterval): number {
  return intervals.reduce((acc, i) => acc + (i[key] as number), 0)
}
