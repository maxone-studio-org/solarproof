import { useState, useMemo } from 'react'
import { useAppStore } from '../store'
import { calculateCostComparison, getBdewPrices } from '../utils/cost'

export function CostComparison() {
  const days = useAppStore((s) => s.days)
  const importStep = useAppStore((s) => s.importStep)
  const params = useAppStore((s) => s.costParams)
  const capOverrides = useAppStore((s) => s.costCapOverrides)
  const setCostParam = useAppStore((s) => s.setCostParam)
  const setCostCapOverride = useAppStore((s) => s.setCostCapOverride)
  const [expanded, setExpanded] = useState(false)

  const bdewPrices = getBdewPrices()

  const results = useMemo(
    () => (days.length > 0 ? calculateCostComparison(days, params, capOverrides) : []),
    [days, params, capOverrides]
  )

  const totals = useMemo(() => {
    if (results.length === 0) return null
    const gesamtkosten = results.reduce((s, r) => s + r.gesamtkosten_eur, 0)
    const eigenverbrauch = results.reduce((s, r) => s + r.eigenverbrauch_kwh, 0)
    const aequivalent = results.reduce((s, r) => s + r.aequivalent_kwh, 0)
    return { gesamtkosten, eigenverbrauch, aequivalent, differenz: eigenverbrauch - aequivalent }
  }, [results])

  // Detect which years are in the data
  const dataYears = useMemo(() => {
    const years = new Set<number>()
    for (const d of days) years.add(parseInt(d.date.substring(0, 4)))
    return [...years].sort()
  }, [days])

  // Years without BDEW price
  const missingPriceYears = dataYears.filter((y) => !bdewPrices.find((p) => p.year === y))

  if (importStep !== 'done') return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <h2 className="text-sm font-semibold text-gray-900">Kostenvergleich</h2>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsed summary */}
      {!expanded && totals && totals.gesamtkosten > 0 && (
        <p className={`text-xs mt-2 font-medium ${totals.differenz >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {totals.differenz >= 0
            ? `Anlage war günstiger: ${totals.eigenverbrauch.toFixed(0)} kWh selbst genutzt vs. ${totals.aequivalent.toFixed(0)} kWh kaufbar`
            : `Stromeinkauf wäre günstiger: nur ${totals.eigenverbrauch.toFixed(0)} kWh genutzt, ${totals.aequivalent.toFixed(0)} kWh wären kaufbar gewesen`
          }
        </p>
      )}

      {expanded && (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-gray-500">
            War es günstiger, den Strom zu kaufen oder die Anlage zu betreiben?
            Preise: BDEW-Durchschnittspreise inkl. Strompreisbremse 2022/2023.
          </p>

          {/* Cost inputs */}
          <div className="space-y-2">
            <NumberInput
              label="Kreditrate (EUR/Monat)"
              help="Monatliche Rate für die PV-Anlage"
              value={params.kreditrate_eur_monat}
              onChange={(v) => setCostParam('kreditrate_eur_monat', v)}
            />
            <NumberInput
              label="Nachzahlung Versorger (EUR/Jahr)"
              help="Jährliche Stromkostennachzahlung"
              value={params.nachzahlung_eur_jahr}
              onChange={(v) => setCostParam('nachzahlung_eur_jahr', v)}
            />
            <NumberInput
              label="Rückerstattung Versorger (EUR/Jahr)"
              help="Gutschriften vom Versorger"
              value={params.rueckerstattung_eur_jahr}
              onChange={(v) => setCostParam('rueckerstattung_eur_jahr', v)}
            />
            <NumberInput
              label="Wartung & Reparatur (EUR/Jahr)"
              help="Wartungskosten, Reparaturen, Versicherung"
              value={params.wartung_eur_jahr}
              onChange={(v) => setCostParam('wartung_eur_jahr', v)}
            />
            <NumberInput
              label="Cloud-Speicher-Abo (EUR/Monat)"
              help="Monatliche Kosten für Hersteller-Cloud (z.B. SENEC.Cloud)"
              value={params.cloud_eur_monat}
              onChange={(v) => setCostParam('cloud_eur_monat', v)}
            />
            <NumberInput
              label="Einspeisevergütung (ct/kWh)"
              help="Vergütung für eingespeisten Strom"
              value={params.einspeiseverguetung_ct_kwh}
              step={0.1}
              onChange={(v) => setCostParam('einspeiseverguetung_ct_kwh', v)}
            />
          </div>

          {/* BDEW price toggles for years with caps */}
          {dataYears.some((y) => bdewPrices.find((p) => p.year === y && p.cap_ct !== null)) && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs font-medium text-blue-800 mb-2">Strompreisbremse</p>
              {dataYears.map((year) => {
                const bdew = bdewPrices.find((p) => p.year === year)
                if (!bdew || bdew.cap_ct === null) return null
                const active = capOverrides[year] ?? bdew.capped_default
                return (
                  <label key={year} className="flex items-center gap-2 text-xs text-blue-700 mb-1">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setCostCapOverride(year, e.target.checked)}
                      className="rounded border-blue-300"
                    />
                    {year}: {bdew.price_ct} ct/kWh → gedeckelt auf {bdew.cap_ct} ct/kWh
                  </label>
                )
              })}
            </div>
          )}

          {/* Missing price warning */}
          {missingPriceYears.length > 0 && (
            <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-800">
                Kein BDEW-Preis hinterlegt für: {missingPriceYears.join(', ')}.
                Für diese Jahre ist keine Berechnung möglich.
              </p>
            </div>
          )}

          {/* Main message */}
          {totals && totals.gesamtkosten > 0 && (
            <div className={`p-4 rounded-lg ${totals.differenz >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className="text-sm text-gray-800 leading-relaxed">
                Für deine Gesamtkosten von <span className="font-semibold">{totals.gesamtkosten.toFixed(0)} EUR</span> hättest
                du <span className="font-semibold">{totals.aequivalent.toFixed(0)} kWh</span> Strom aus dem Netz kaufen können.
                Du hast <span className="font-semibold">{totals.eigenverbrauch.toFixed(0)} kWh</span> selbst erzeugt und genutzt.
              </p>
              <p className={`text-xs font-medium mt-2 ${totals.differenz >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {totals.differenz >= 0
                  ? `Ergebnis: Die Anlage hat sich gelohnt — ${totals.differenz.toFixed(0)} kWh mehr genutzt als kaufbar.`
                  : `Ergebnis: Netzbezug wäre günstiger gewesen — ${Math.abs(totals.differenz).toFixed(0)} kWh weniger genutzt als kaufbar.`
                }
              </p>
            </div>
          )}

          {/* Per-year table */}
          {results.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600">Jahr</th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-600">Kosten (EUR)</th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-600">ct/kWh</th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-600">Kaufbar (kWh)</th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-600">Genutzt (kWh)</th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-600">Differenz</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.year} className="border-b border-gray-100">
                      <td className="px-2 py-1 font-medium">{r.year}</td>
                      <td className="px-2 py-1 text-right">{r.gesamtkosten_eur.toFixed(0)}</td>
                      <td className="px-2 py-1 text-right">{r.strompreis_ct.toFixed(1)}</td>
                      <td className="px-2 py-1 text-right">{r.aequivalent_kwh.toFixed(0)}</td>
                      <td className="px-2 py-1 text-right">{r.eigenverbrauch_kwh.toFixed(0)}</td>
                      <td className={`px-2 py-1 text-right font-medium ${r.differenz_kwh >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {r.differenz_kwh >= 0 ? '+' : ''}{r.differenz_kwh.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                  {totals && (
                    <tr className="border-t-2 border-gray-300 font-semibold">
                      <td className="px-2 py-1.5">Gesamt</td>
                      <td className="px-2 py-1.5 text-right">{totals.gesamtkosten.toFixed(0)}</td>
                      <td className="px-2 py-1.5 text-right">—</td>
                      <td className="px-2 py-1.5 text-right">{totals.aequivalent.toFixed(0)}</td>
                      <td className="px-2 py-1.5 text-right">{totals.eigenverbrauch.toFixed(0)}</td>
                      <td className={`px-2 py-1.5 text-right ${totals.differenz >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {totals.differenz >= 0 ? '+' : ''}{totals.differenz.toFixed(0)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Keine Investitionsanalyse. Zeigt nur ob es günstiger gewesen wäre, den Strom zu kaufen.
          </p>
        </div>
      )}
    </div>
  )
}

function NumberInput({
  label,
  help,
  value,
  step = 1,
  onChange,
}: {
  label: string
  help: string
  value: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-0.5">{label}</label>
      <input
        type="number"
        min={0}
        step={step}
        value={value || ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0"
        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
      />
      <p className="text-xs text-gray-400 mt-0.5">{help}</p>
    </div>
  )
}
