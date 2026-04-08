import { useMemo } from 'react'
import { useAppStore } from '../store'

const MONTHS = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
]

interface MonthRow {
  month: string // YYYY-MM
  label: string // "Jan 2021"
  tage: number
  erzeugung: number
  verbrauch: number
  einspeisung: number
  netzbezug: number
  netzbezugSim: number
  ersparnis: number
  autarkieOhne: number
  autarkieMit: number
}

export function AllMonthsOverview() {
  const days = useAppStore((s) => s.days)
  const simulationResults = useAppStore((s) => s.simulationResults)
  const selectedMonth = useAppStore((s) => s.selectedMonth)
  const setSelectedMonth = useAppStore((s) => s.setSelectedMonth)
  const importStep = useAppStore((s) => s.importStep)

  const rows = useMemo((): MonthRow[] => {
    const monthMap = new Map<string, MonthRow>()

    for (const day of days) {
      const m = day.date.substring(0, 7)
      if (!monthMap.has(m)) {
        const [y, mo] = m.split('-')
        monthMap.set(m, {
          month: m,
          label: `${MONTHS[parseInt(mo) - 1]} ${y}`,
          tage: 0,
          erzeugung: 0, verbrauch: 0, einspeisung: 0,
          netzbezug: 0, netzbezugSim: 0, ersparnis: 0,
          autarkieOhne: 0, autarkieMit: 0,
        })
      }
      const row = monthMap.get(m)!
      row.tage++
      row.erzeugung += day.totals.erzeugung_kwh
      row.verbrauch += day.totals.verbrauch_kwh
      row.einspeisung += day.totals.einspeisung_kwh
      row.netzbezug += day.totals.netzbezug_kwh
    }

    for (const sim of simulationResults) {
      const m = sim.date.substring(0, 7)
      const row = monthMap.get(m)
      if (row) {
        row.netzbezugSim += sim.totals.netzbezug_sim_kwh
      }
    }

    // Calculate derived fields
    for (const row of monthMap.values()) {
      row.ersparnis = row.netzbezug - row.netzbezugSim
      row.autarkieOhne = row.verbrauch > 0
        ? ((row.verbrauch - row.netzbezug) / row.verbrauch) * 100 : 0
      row.autarkieMit = row.verbrauch > 0
        ? ((row.verbrauch - row.netzbezugSim) / row.verbrauch) * 100 : 0
    }

    return [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month))
  }, [days, simulationResults])

  const totals = useMemo(() => {
    const t = {
      tage: 0, erzeugung: 0, verbrauch: 0, einspeisung: 0,
      netzbezug: 0, netzbezugSim: 0, ersparnis: 0,
      autarkieOhne: 0, autarkieMit: 0,
    }
    for (const r of rows) {
      t.tage += r.tage
      t.erzeugung += r.erzeugung
      t.verbrauch += r.verbrauch
      t.einspeisung += r.einspeisung
      t.netzbezug += r.netzbezug
      t.netzbezugSim += r.netzbezugSim
    }
    t.ersparnis = t.netzbezug - t.netzbezugSim
    t.autarkieOhne = t.verbrauch > 0 ? ((t.verbrauch - t.netzbezug) / t.verbrauch) * 100 : 0
    t.autarkieMit = t.verbrauch > 0 ? ((t.verbrauch - t.netzbezugSim) / t.verbrauch) * 100 : 0
    return t
  }, [rows])

  if (importStep !== 'done' || rows.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        Gesamtübersicht — alle Monate
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        {rows.length} Monate, {totals.tage} Tage mit Daten. Klicke auf einen Monat für Details.
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="px-2 py-2 text-left font-medium">Monat</th>
              <th className="px-2 py-2 text-right font-medium">Tage</th>
              <th className="px-2 py-2 text-right font-medium">Erzeugung</th>
              <th className="px-2 py-2 text-right font-medium">Verbrauch</th>
              <th className="px-2 py-2 text-right font-medium">Netzbezug</th>
              <th className="px-2 py-2 text-right font-medium">NB sim.</th>
              <th className="px-2 py-2 text-right font-medium text-amber-700">Ersparnis</th>
              <th className="px-2 py-2 text-right font-medium">Autarkie</th>
              <th className="px-2 py-2 text-right font-medium">Aut. sim.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.month}
                onClick={() => setSelectedMonth(row.month)}
                className={`border-b border-gray-50 cursor-pointer transition-colors ${
                  row.month === selectedMonth
                    ? 'bg-amber-50 font-medium'
                    : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-2 py-1.5 text-gray-900 whitespace-nowrap">{row.label}</td>
                <td className="px-2 py-1.5 text-right text-gray-500">{row.tage}</td>
                <td className="px-2 py-1.5 text-right font-mono">{row.erzeugung.toFixed(0)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{row.verbrauch.toFixed(0)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{row.netzbezug.toFixed(0)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{row.netzbezugSim.toFixed(0)}</td>
                <td className="px-2 py-1.5 text-right font-mono font-semibold text-amber-600">
                  {row.ersparnis.toFixed(0)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{row.autarkieOhne.toFixed(0)}%</td>
                <td className="px-2 py-1.5 text-right font-mono text-amber-600">{row.autarkieMit.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <td className="px-2 py-2 text-gray-900">Gesamt</td>
              <td className="px-2 py-2 text-right text-gray-700">{totals.tage}</td>
              <td className="px-2 py-2 text-right font-mono">{totals.erzeugung.toFixed(0)}</td>
              <td className="px-2 py-2 text-right font-mono">{totals.verbrauch.toFixed(0)}</td>
              <td className="px-2 py-2 text-right font-mono">{totals.netzbezug.toFixed(0)}</td>
              <td className="px-2 py-2 text-right font-mono">{totals.netzbezugSim.toFixed(0)}</td>
              <td className="px-2 py-2 text-right font-mono text-amber-600">{totals.ersparnis.toFixed(0)}</td>
              <td className="px-2 py-2 text-right font-mono">{totals.autarkieOhne.toFixed(0)}%</td>
              <td className="px-2 py-2 text-right font-mono text-amber-600">{totals.autarkieMit.toFixed(0)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-2">Alle Werte in kWh (gerundet). Ersparnis = eingesparter Netzbezug durch simulierten Speicher.</p>
    </div>
  )
}
