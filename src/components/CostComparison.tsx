import { useState, useMemo } from 'react'
import { useAppStore } from '../store'
import { calculateCostComparison, getBdewPrices, getEffectivePrice } from '../utils/cost'

export function CostComparison() {
  const days = useAppStore((s) => s.days)
  const importStep = useAppStore((s) => s.importStep)
  const params = useAppStore((s) => s.costParams)
  const capOverrides = useAppStore((s) => s.costCapOverrides)
  const setCostParam = useAppStore((s) => s.setCostParam)
  const setCostCapOverride = useAppStore((s) => s.setCostCapOverride)
  const setCostNachzahlungYear = useAppStore((s) => s.setCostNachzahlungYear)
  const setCostCloudMonth = useAppStore((s) => s.setCostCloudMonth)
  const [expanded, setExpanded] = useState(true)
  const [showPerYear, setShowPerYear] = useState(false)
  const [showPerMonth, setShowPerMonth] = useState(false)

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

  // Euro-based Ersparnis: sum of (netzbezug_ist - netzbezug_sim) * strompreis per year
  const euroErsparnis = useMemo(() => {
    if (days.length === 0) return null
    const simulationResults = useAppStore.getState().simulationResults

    // Group by year
    const yearMap = new Map<number, { netzbezug: number; netzbezugSim: number }>()
    for (const day of days) {
      const year = parseInt(day.date.substring(0, 4))
      if (!yearMap.has(year)) yearMap.set(year, { netzbezug: 0, netzbezugSim: 0 })
      const entry = yearMap.get(year)!
      entry.netzbezug += day.totals.netzbezug_kwh
    }
    for (const sim of simulationResults) {
      const year = parseInt(sim.date.substring(0, 4))
      const entry = yearMap.get(year)
      if (entry) entry.netzbezugSim += sim.totals.netzbezug_sim_kwh
    }

    let totalEur = 0
    const perYear: { year: number; kwh: number; eur: number; ct: number }[] = []
    for (const [year, data] of [...yearMap.entries()].sort((a, b) => a[0] - b[0])) {
      const bdew = bdewPrices.find((p) => p.year === year)
      if (!bdew) continue
      const capActive = capOverrides[year] ?? bdew.capped_default
      const ct = getEffectivePrice(bdew, capActive)
      const kwhSaved = data.netzbezug - data.netzbezugSim
      const eur = (kwhSaved * ct) / 100
      totalEur += eur
      perYear.push({ year, kwh: kwhSaved, eur, ct })
    }
    return { totalEur, perYear }
  }, [days, bdewPrices, capOverrides])

  // Detect which years/months are in the data
  const dataYears = useMemo(() => {
    const years = new Set<number>()
    for (const d of days) years.add(parseInt(d.date.substring(0, 4)))
    return [...years].sort()
  }, [days])

  const dataMonths = useMemo(() => {
    const months = new Set<string>()
    for (const d of days) months.add(d.date.substring(0, 7))
    return [...months].sort()
  }, [days])

  const missingPriceYears = dataYears.filter((y) => !bdewPrices.find((p) => p.year === y))

  if (importStep !== 'done') return null

  const MONTH_LABELS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

  return (
    <div className="bg-white border-2 border-amber-200 rounded-xl p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-sm font-semibold text-gray-900">Kostenvergleich & Ersparnis</h2>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsed summary */}
      {!expanded && euroErsparnis && (
        <p className={`text-xs mt-2 font-medium ${euroErsparnis.totalEur >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          Ersparnis durch Speicher: {euroErsparnis.totalEur >= 0 ? '+' : ''}{euroErsparnis.totalEur.toFixed(0)} EUR
        </p>
      )}

      {expanded && (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-gray-500">
            Kostenaufstellung deiner PV-Anlage und Ersparnis durch den (simulierten) Speicher.
            Strompreise: BDEW-Durchschnittspreise inkl. Strompreisbremse 2022/2023.
          </p>

          {/* Euro Ersparnis highlight */}
          {euroErsparnis && (
            <div className={`p-4 rounded-lg ${euroErsparnis.totalEur >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className="text-sm font-semibold text-gray-800">
                Ersparnis durch Speicher: <span className={euroErsparnis.totalEur >= 0 ? 'text-green-700' : 'text-red-700'}>
                  {euroErsparnis.totalEur >= 0 ? '+' : ''}{euroErsparnis.totalEur.toFixed(2)} EUR
                </span>
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Eingesparter Netzbezug × BDEW-Strompreis des jeweiligen Jahres
              </p>
              {euroErsparnis.perYear.length > 1 && (
                <div className="mt-2 space-y-0.5">
                  {euroErsparnis.perYear.map((y) => (
                    <p key={y.year} className="text-xs text-gray-600">
                      {y.year}: {y.kwh.toFixed(0)} kWh × {y.ct.toFixed(1)} ct/kWh = <span className="font-medium">{y.eur.toFixed(2)} EUR</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cost inputs */}
          <div className="space-y-2">
            <NumberInput
              label="Kreditrate (EUR/Monat)"
              help="Monatliche Rate für die PV-Anlage"
              value={params.kreditrate_eur_monat}
              onChange={(v) => setCostParam('kreditrate_eur_monat', v)}
            />

            {/* Nachzahlung — flat or per-year */}
            <div>
              <div className="flex items-center justify-between">
                <NumberInput
                  label="Nachzahlung Versorger (EUR/Jahr)"
                  help={showPerYear ? 'Standard für Jahre ohne eigene Angabe' : 'Jährliche Stromkostennachzahlung'}
                  value={params.nachzahlung_eur_jahr}
                  onChange={(v) => setCostParam('nachzahlung_eur_jahr', v)}
                />
              </div>
              <button
                onClick={() => setShowPerYear(!showPerYear)}
                className="text-xs text-amber-600 hover:text-amber-800 mt-1"
              >
                {showPerYear ? 'Pro-Jahr-Eingabe ausblenden' : 'Pro Jahr einzeln eingeben'}
              </button>
              {showPerYear && (
                <div className="mt-2 ml-2 pl-2 border-l-2 border-amber-200 space-y-1">
                  {dataYears.map((year) => (
                    <div key={year} className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-12">{year}:</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={params.nachzahlung_pro_jahr?.[year] ?? ''}
                        placeholder={String(params.nachzahlung_eur_jahr || 0)}
                        onChange={(e) => setCostNachzahlungYear(year, parseFloat(e.target.value) || 0)}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                      <span className="text-xs text-gray-400">EUR</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

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

            {/* Cloud — flat or per-month */}
            <div>
              <NumberInput
                label="Cloud-Speicher-Abo (EUR/Monat)"
                help={showPerMonth ? 'Standard für Monate ohne eigene Angabe' : 'Monatliche Kosten für Hersteller-Cloud (z.B. SENEC.Cloud)'}
                value={params.cloud_eur_monat}
                onChange={(v) => setCostParam('cloud_eur_monat', v)}
              />
              <button
                onClick={() => setShowPerMonth(!showPerMonth)}
                className="text-xs text-amber-600 hover:text-amber-800 mt-1"
              >
                {showPerMonth ? 'Pro-Monat-Eingabe ausblenden' : 'Pro Monat einzeln eingeben'}
              </button>
              {showPerMonth && (
                <div className="mt-2 ml-2 pl-2 border-l-2 border-amber-200 space-y-1 max-h-48 overflow-y-auto">
                  {dataMonths.map((m) => {
                    const [y, mo] = m.split('-')
                    const label = `${MONTH_LABELS[parseInt(mo) - 1]} ${y}`
                    return (
                      <div key={m} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-16">{label}:</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={params.cloud_pro_monat?.[m] ?? ''}
                          placeholder={String(params.cloud_eur_monat || 0)}
                          onChange={(e) => setCostCloudMonth(m, parseFloat(e.target.value) || 0)}
                          className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                        />
                        <span className="text-xs text-gray-400">EUR</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

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

          {/* Gesamtkosten comparison */}
          {totals && totals.gesamtkosten > 0 && (
            <div className={`p-4 rounded-lg ${totals.differenz >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className="text-xs font-medium text-gray-600 mb-1">Gesamtkosten-Vergleich</p>
              <p className="text-sm text-gray-800 leading-relaxed">
                Für deine Gesamtkosten von <span className="font-semibold">{totals.gesamtkosten.toFixed(0)} EUR</span> hättest
                du <span className="font-semibold">{totals.aequivalent.toFixed(0)} kWh</span> Strom aus dem Netz kaufen können.
                Dein <span className="font-semibold">Eigenverbrauch</span> aus der PV-Anlage
                war <span className="font-semibold">{totals.eigenverbrauch.toFixed(0)} kWh</span>
                <span className="text-xs text-gray-500"> (d.h. PV-Strom, den du direkt im Haus verbraucht hast — nicht die Gesamterzeugung)</span>.
              </p>
              <p className={`text-xs font-medium mt-2 ${totals.differenz >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {totals.differenz >= 0
                  ? `Die Anlage hat sich gelohnt — ${totals.differenz.toFixed(0)} kWh mehr genutzt als kaufbar.`
                  : `Netzbezug wäre günstiger gewesen — ${Math.abs(totals.differenz).toFixed(0)} kWh weniger genutzt als kaufbar.`
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
                    <th className="px-2 py-1.5 text-right font-medium text-gray-600">Kosten <span className="text-gray-400 font-normal">EUR</span></th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-600">Strompreis <span className="text-gray-400 font-normal">ct/kWh</span></th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-600" title="Wie viel Strom du für deine Gesamtkosten hättest kaufen können (Kosten / Strompreis)">Kaufbar <span className="text-gray-400 font-normal">kWh</span></th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-600" title="PV-Strom, den du direkt im Haus genutzt hast (Eigenverbrauch, nicht Gesamterzeugung)">Eigenverbr. <span className="text-gray-400 font-normal">kWh</span></th>
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
            Alle Preise inkl. MwSt.
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
  const inputId = `cost-${label.replace(/\s+/g, '-').toLowerCase()}`
  const helpId = `${inputId}-help`

  return (
    <div>
      <label htmlFor={inputId} className="block text-xs text-gray-600 mb-0.5">{label}</label>
      <input
        id={inputId}
        type="number"
        min={0}
        step={step}
        value={value || ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0"
        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        aria-describedby={helpId}
      />
      <p id={helpId} className="text-xs text-gray-400 mt-0.5">{help}</p>
    </div>
  )
}
