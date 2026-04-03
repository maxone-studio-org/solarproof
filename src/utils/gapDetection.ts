import { toZonedTime } from 'date-fns-tz'
import { differenceInCalendarDays, differenceInMinutes, addDays, format } from 'date-fns'
import type { DayData, DataGap, OverlapConflict, OverlapSummary } from '../types'

const TZ = 'Europe/Berlin'

/**
 * Detect gaps and overlaps in the merged dataset.
 *
 * 1. Missing days: consecutive day gaps between available data days
 * 2. Missing intervals: within a day, gaps larger than 2x the detected interval
 * 3. Overlaps: duplicate timestamps (deduplicated during merge, but reported)
 */
export function detectDataGaps(days: DayData[]): DataGap[] {
  if (days.length === 0) return []

  const gaps: DataGap[] = []

  // ── 1. Missing days ──────────────────────────────────
  for (let i = 0; i < days.length - 1; i++) {
    const currentDate = parseDay(days[i].date)
    const nextDate = parseDay(days[i + 1].date)
    const daysBetween = differenceInCalendarDays(nextDate, currentDate)

    if (daysBetween > 1) {
      const missingFrom = addDays(currentDate, 1)
      const missingTo = addDays(nextDate, -1)
      const missingCount = daysBetween - 1

      gaps.push({
        type: 'missing_days',
        from: format(missingFrom, 'yyyy-MM-dd'),
        to: format(missingTo, 'yyyy-MM-dd'),
        durationHours: missingCount * 24,
        message: missingCount === 1
          ? `${format(missingFrom, 'dd.MM.yyyy')}: Keine Daten vorhanden (1 Tag fehlt).`
          : `${format(missingFrom, 'dd.MM.yyyy')} bis ${format(missingTo, 'dd.MM.yyyy')}: Keine Daten vorhanden (${missingCount} Tage fehlen).`,
      })
    }
  }

  // ── 2. Missing intervals within days ─────────────────
  for (const day of days) {
    if (day.intervals.length < 3) continue // too few to detect pattern

    // Detect typical interval spacing (median of first gaps)
    const deltas: number[] = []
    for (let i = 0; i < Math.min(day.intervals.length - 1, 10); i++) {
      const delta = differenceInMinutes(
        day.intervals[i + 1].timestamp,
        day.intervals[i].timestamp
      )
      if (delta > 0) deltas.push(delta)
    }
    if (deltas.length === 0) continue

    deltas.sort((a, b) => a - b)
    const typicalInterval = deltas[Math.floor(deltas.length / 2)] // median

    // Check for gaps > 2x typical interval
    for (let i = 0; i < day.intervals.length - 1; i++) {
      const delta = differenceInMinutes(
        day.intervals[i + 1].timestamp,
        day.intervals[i].timestamp
      )

      if (delta > typicalInterval * 2) {
        const fromBerlin = toZonedTime(day.intervals[i].timestamp, TZ)
        const toBerlin = toZonedTime(day.intervals[i + 1].timestamp, TZ)
        const fromTime = format(fromBerlin, 'HH:mm')
        const toTime = format(toBerlin, 'HH:mm')
        const missingCount = Math.round(delta / typicalInterval) - 1

        gaps.push({
          type: 'missing_intervals',
          from: day.intervals[i].timestamp.toISOString(),
          to: day.intervals[i + 1].timestamp.toISOString(),
          durationHours: delta / 60,
          message: `${format(fromBerlin, 'dd.MM.yyyy')} ${fromTime}–${toTime}: ${missingCount} Intervall${missingCount > 1 ? 'e' : ''} fehlen (${formatDuration(delta)}).`,
        })
      }
    }
  }

  return gaps
}

/**
 * Deduplicate intervals with the same timestamp.
 * Strategy: keep first occurrence (lowest sourceFileIndex).
 * Tracks every conflict with source file attribution.
 */
export function deduplicateIntervals(days: DayData[]): {
  days: DayData[]
  overlapSummaries: OverlapSummary[]
} {
  const allConflicts: OverlapConflict[] = []

  const dedupedDays = days.map((day) => {
    const seen = new Map<number, number>() // timestamp → sourceFileIndex of keeper
    const uniqueIntervals = day.intervals.filter((interval) => {
      const key = interval.timestamp.getTime()
      const existing = seen.get(key)
      if (existing !== undefined) {
        allConflicts.push({
          timestamp: interval.timestamp,
          keptFileIndex: existing,
          droppedFileIndex: interval.sourceFileIndex,
        })
        return false
      }
      seen.set(key, interval.sourceFileIndex)
      return true
    })

    if (uniqueIntervals.length === day.intervals.length) return day

    return {
      ...day,
      intervals: uniqueIntervals,
      totals: {
        erzeugung_kwh: uniqueIntervals.reduce((s, i) => s + i.erzeugung_kwh, 0),
        verbrauch_kwh: uniqueIntervals.reduce((s, i) => s + i.verbrauch_kwh, 0),
        einspeisung_kwh: uniqueIntervals.reduce((s, i) => s + i.einspeisung_kwh, 0),
        netzbezug_kwh: uniqueIntervals.reduce((s, i) => s + i.netzbezug_kwh, 0),
      },
    }
  })

  // Group conflicts into summaries per file pair
  const pairMap = new Map<string, OverlapSummary>()
  for (const c of allConflicts) {
    const key = `${c.keptFileIndex}-${c.droppedFileIndex}`
    if (!pairMap.has(key)) {
      pairMap.set(key, {
        fileIndexA: c.keptFileIndex,
        fileIndexB: c.droppedFileIndex,
        count: 0,
        conflicts: [],
      })
    }
    const summary = pairMap.get(key)!
    summary.count++
    summary.conflicts.push(c)
  }

  return { days: dedupedDays, overlapSummaries: [...pairMap.values()] }
}

function parseDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} Min.`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return `${h} Std.`
  return `${h} Std. ${m} Min.`
}
