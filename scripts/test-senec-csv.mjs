// Sanity-check: Roberts SENEC-CSV durch die Pipeline jagen und Tagesproduktion prüfen.
// Erwartung: Oktober Woche 43 bei einer ~10 kWp-Anlage ~15-25 kWh/Tag Erzeugung.
import { readFileSync } from 'fs'
import Papa from 'papaparse'

const CSV_PATH = new URL('../S26870111194348548540356920-week-43-2021.csv', import.meta.url)
const text = readFileSync(CSV_PATH, 'utf-8')

const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: ';' })
console.log(`Total rows: ${parsed.data.length}`)
console.log(`Headers: ${parsed.meta.fields.join(', ')}\n`)

// German number parser: "0,575746" → 0.575746
const num = (s) => {
  if (!s) return 0
  const cleaned = s.trim().includes('.') && s.trim().includes(',')
    ? s.trim().replace(/\./g, '').replace(',', '.')
    : s.trim().replace(',', '.')
  return parseFloat(cleaned)
}

// Group by day, collect (timestamp, power_kW) pairs
const byDay = new Map()
for (const row of parsed.data) {
  const ts = row['Uhrzeit']
  if (!ts) continue
  const [date, time] = ts.split(' ')
  const [day, month, year] = date.split('.').map(Number)
  const [h, m, s] = time.split(':').map(Number)
  const timestamp = Date.UTC(year, month - 1, day, h, m, s)
  const powerKW = num(row['Stromerzeugung [kW]'])
  const consumeKW = num(row['Stromverbrauch [kW]'])
  const feedKW = num(row['Netzeinspeisung [kW]'])
  const gridKW = num(row['Netzbezug [kW]'])

  const dayKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (!byDay.has(dayKey)) byDay.set(dayKey, [])
  byDay.get(dayKey).push({ timestamp, powerKW, consumeKW, feedKW, gridKW })
}

console.log('== NAIVE SUM (kW als kWh interpretiert — AKTUELLER BUG) ==')
for (const [dayKey, intervals] of [...byDay.entries()].sort()) {
  const sumKW = intervals.reduce((acc, i) => acc + i.powerKW, 0)
  console.log(`  ${dayKey}: ${sumKW.toFixed(1)} "kWh" (${intervals.length} Intervalle)`)
}

console.log('\n== INTEGRATION P × Δt (FIX) ==')
let totalEnergy = 0
for (const [dayKey, intervals] of [...byDay.entries()].sort()) {
  intervals.sort((a, b) => a.timestamp - b.timestamp)
  // Median interval Δt
  const deltas = []
  for (let i = 1; i < intervals.length; i++) {
    const d = (intervals[i].timestamp - intervals[i - 1].timestamp) / 3600000
    if (d > 0 && d <= 1) deltas.push(d)
  }
  deltas.sort((a, b) => a - b)
  const fallback = deltas.length > 0 ? deltas[Math.floor(deltas.length / 2)] : 5 / 60
  const maxDur = fallback * 2

  let dayEnergy = 0
  let dayConsume = 0
  let dayFeed = 0
  let dayGrid = 0
  for (let i = 0; i < intervals.length; i++) {
    const cur = intervals[i]
    const next = intervals[i + 1]
    let dur
    if (next) {
      const d = (next.timestamp - cur.timestamp) / 3600000
      dur = (d > 0 && d <= maxDur) ? d : fallback
    } else {
      dur = fallback
    }
    dayEnergy += cur.powerKW * dur
    dayConsume += cur.consumeKW * dur
    dayFeed += cur.feedKW * dur
    dayGrid += cur.gridKW * dur
  }
  totalEnergy += dayEnergy
  console.log(`  ${dayKey}: Erz=${dayEnergy.toFixed(2)} kWh | Verbr=${dayConsume.toFixed(2)} kWh | Einsp=${dayFeed.toFixed(2)} kWh | Bezug=${dayGrid.toFixed(2)} kWh | Δt≈${(fallback * 60).toFixed(1)} min`)
}
console.log(`\nWochensumme Erzeugung: ${totalEnergy.toFixed(1)} kWh`)
console.log(`→ Plausibel für 10 kWp-Anlage im Oktober? (erwartet: ~100-180 kWh/Woche)`)
