import { useState, useMemo } from 'react'
import { useAppStore } from '../store'

/**
 * Trust & Transparency: zeigt nach Import pro Jahr die Rohsummen aus den
 * importierten CSVs, damit User verifizieren können, ob die App die Daten
 * korrekt gelesen hat. Antwortet auf Roberts Frage: „Wie können wir die
 * Berechnungen sauber verifizieren?"
 */
export function DataIntegrityPanel() {
  const days = useAppStore((s) => s.days)
  const importStep = useAppStore((s) => s.importStep)
  const inputUnit = useAppStore((s) => s.inputUnit)
  const [expanded, setExpanded] = useState(true)

  const byYear = useMemo(() => {
    if (days.length === 0) return []
    const map = new Map<number, {
      year: number
      days: number
      intervals: number
      erzeugung: number
      verbrauch: number
      einspeisung: number
      netzbezug: number
      firstDay: string
      lastDay: string
    }>()

    for (const day of days) {
      const year = parseInt(day.date.substring(0, 4))
      if (!map.has(year)) {
        map.set(year, {
          year,
          days: 0,
          intervals: 0,
          erzeugung: 0,
          verbrauch: 0,
          einspeisung: 0,
          netzbezug: 0,
          firstDay: day.date,
          lastDay: day.date,
        })
      }
      const entry = map.get(year)!
      entry.days += 1
      entry.intervals += day.intervals.length
      entry.erzeugung += day.totals.erzeugung_kwh
      entry.verbrauch += day.totals.verbrauch_kwh
      entry.einspeisung += day.totals.einspeisung_kwh
      entry.netzbezug += day.totals.netzbezug_kwh
      if (day.date < entry.firstDay) entry.firstDay = day.date
      if (day.date > entry.lastDay) entry.lastDay = day.date
    }

    return [...map.values()].sort((a, b) => a.year - b.year)
  }, [days])

  const totals = useMemo(() => {
    const t = byYear.reduce(
      (acc, y) => ({
        days: acc.days + y.days,
        erzeugung: acc.erzeugung + y.erzeugung,
        verbrauch: acc.verbrauch + y.verbrauch,
        einspeisung: acc.einspeisung + y.einspeisung,
        netzbezug: acc.netzbezug + y.netzbezug,
      }),
      { days: 0, erzeugung: 0, verbrauch: 0, einspeisung: 0, netzbezug: 0 }
    )
    return t
  }, [byYear])

  if (importStep !== 'done' || byYear.length === 0) return null

  const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 0 })
  const fmtDate = (s: string) => {
    const [y, m, d] = s.split('-')
    return `${d}.${m}.${y}`
  }

  // Plausibilitäts-Check pro Jahr: realistisch für Heim-PV < 20 kWp sind 500-1500 kWh pro kWp/Jahr.
  // Bei fehlendem Anlagengröße nehmen wir Vollständigkeits-Heuristik: >= 300 Tage = „Volljahr".
  const warnings: string[] = []
  for (const y of byYear) {
    if (y.erzeugung < 100 && y.days > 30) {
      warnings.push(`${y.year}: nur ${fmt(y.erzeugung)} kWh Erzeugung über ${y.days} Tage – das ist ungewöhnlich niedrig.`)
    }
    if (y.erzeugung > 50000 && y.days < 366) {
      warnings.push(`${y.year}: ${fmt(y.erzeugung)} kWh Erzeugung in ${y.days} Tagen – das wäre eine Großanlage. Einheit prüfen?`)
    }
    // Expected interval count per day: ~288 (5min) / 96 (15min) / 24 (1h)
    const avgPerDay = y.intervals / y.days
    if (avgPerDay < 10) {
      warnings.push(`${y.year}: nur ${avgPerDay.toFixed(0)} Messungen/Tag – Datenlücken?`)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h2 className="text-sm font-semibold text-gray-900">Daten-Integrität</h2>
          <span className="text-xs text-gray-500">– zur Verifikation der Berechnungen</span>
        </div>
        <button onClick={() => setExpanded((v) => !v)}
          className="text-xs text-gray-500 hover:text-amber-600">
          {expanded ? 'einklappen' : 'ausklappen'}
        </button>
      </div>

      {expanded && (
        <>
          <p className="text-xs text-gray-600 mb-3">
            Das sind die Rohsummen der importierten CSV-Daten pro Jahr,
            aus denen alle weiteren Berechnungen abgeleitet werden.
            Erkannte Einheit: <span className="font-mono font-semibold">{inputUnit}</span>
            {(inputUnit === 'kW' || inputUnit === 'W') && ' (Integration P × Δt → kWh)'}
          </p>

          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 text-left">
                  <th className="py-1.5 pr-3">Jahr</th>
                  <th className="py-1.5 pr-3">Zeitraum</th>
                  <th className="py-1.5 pr-3 text-right">Tage</th>
                  <th className="py-1.5 pr-3 text-right" title="Anzahl Messwerte in der CSV">Mess-werte</th>
                  <th className="py-1.5 pr-3 text-right">PV-Erzeugung</th>
                  <th className="py-1.5 pr-3 text-right">Hausverbrauch</th>
                  <th className="py-1.5 pr-3 text-right">Einspeisung</th>
                  <th className="py-1.5 pr-3 text-right">Netzbezug</th>
                </tr>
              </thead>
              <tbody>
                {byYear.map((y) => (
                  <tr key={y.year} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3 font-semibold">{y.year}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{fmtDate(y.firstDay)} – {fmtDate(y.lastDay)}</td>
                    <td className="py-1.5 pr-3 text-right">{y.days}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-500">{fmt(y.intervals)}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold text-amber-700">{fmt(y.erzeugung)} kWh</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(y.verbrauch)} kWh</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(y.einspeisung)} kWh</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(y.netzbezug)} kWh</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-amber-50">
                  <td className="py-2 pr-3">Gesamt</td>
                  <td className="py-2 pr-3"></td>
                  <td className="py-2 pr-3 text-right">{totals.days}</td>
                  <td className="py-2 pr-3 text-right text-gray-500"></td>
                  <td className="py-2 pr-3 text-right text-amber-700">{fmt(totals.erzeugung)} kWh</td>
                  <td className="py-2 pr-3 text-right">{fmt(totals.verbrauch)} kWh</td>
                  <td className="py-2 pr-3 text-right">{fmt(totals.einspeisung)} kWh</td>
                  <td className="py-2 pr-3 text-right">{fmt(totals.netzbezug)} kWh</td>
                </tr>
              </tbody>
            </table>
          </div>

          {warnings.length > 0 && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs font-semibold text-red-800 mb-1">Plausibilitäts-Hinweise:</p>
              <ul className="text-xs text-red-700 space-y-0.5 list-disc pl-4">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <p className="text-xs text-gray-500 mt-3 italic">
            So prüfst du: Vergleiche die PV-Erzeugung pro Jahr mit dem Wert aus deinem Wechselrichter oder Stromzähler.
            Sollte die Zahl systematisch zu niedrig/hoch sein, stimmt die erkannte Einheit nicht – oben im Import-Dialog wechseln.
          </p>
        </>
      )}
    </div>
  )
}
