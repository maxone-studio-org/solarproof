import { useState } from 'react'
import { useAppStore } from '../store'
import { INTERNAL_FIELDS } from '../utils/csv'

const FIELD_LABELS: Record<string, string> = {
  datum: 'Datum / Zeitstempel',
  uhrzeit: 'Uhrzeit (wenn separate Spalte)',
  erzeugung_kwh: 'Erzeugung (kWh / kW)',
  verbrauch_kwh: 'Verbrauch (kWh / kW)',
  einspeisung_kwh: 'Einspeisung (kWh / kW)',
  netzbezug_kwh: 'Netzbezug (kWh / kW)',
}

const REQUIRED_DISPLAY = ['datum', 'erzeugung_kwh', 'verbrauch_kwh']

export function ColumnMapping() {
  const importStep = useAppStore((s) => s.importStep)
  const csvHeaders = useAppStore((s) => s.csvHeaders)
  const csvPreview = useAppStore((s) => s.csvPreview)
  const columnMapping = useAppStore((s) => s.columnMapping)
  const importErrors = useAppStore((s) => s.importErrors)
  const inputIsUTC = useAppStore((s) => s.inputIsUTC)
  const setMapping = useAppStore((s) => s.setMapping)
  const confirmMapping = useAppStore((s) => s.confirmMapping)
  const setInputIsUTC = useAppStore((s) => s.setInputIsUTC)
  const [manualMode, setManualMode] = useState(false)

  if (importStep !== 'mapping') return null

  const validationErrors = importErrors.filter((e) => e.line === 0)
  const isCombined = columnMapping._combinedDatetime === '1'

  // Determine which fields are visible (skip uhrzeit if combined, skip internal flags)
  const visibleFields = INTERNAL_FIELDS.filter((f) => {
    if (f === 'uhrzeit' && isCombined) return false
    return true
  })

  const mappedFields = visibleFields.filter((f) => !!columnMapping[f])
  const unmappedRequired = REQUIRED_DISPLAY.filter((f) => {
    if (f === 'uhrzeit' && isCombined) return false
    return !columnMapping[f]
  })
  const allRequiredMapped = unmappedRequired.length === 0

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6">

        {/* ── All required fields auto-detected → success view ── */}
        {allRequiredMapped && !manualMode ? (
          <>
            <div className="flex items-start gap-3 mb-4">
              <svg className="w-6 h-6 text-green-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Deine Datei wurde erkannt
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {mappedFields.length} von {visibleFields.length} Spalten automatisch zugeordnet.
                </p>
              </div>
            </div>

            {/* Show recognized mappings as green list */}
            <div className="mb-4 space-y-1.5">
              {visibleFields.map((field) => {
                const mapped = columnMapping[field]
                if (!mapped) return null
                return (
                  <div key={field} className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-600">{FIELD_LABELS[field]}</span>
                    <span className="text-gray-400 mx-1">&rarr;</span>
                    <span className="font-mono text-xs text-gray-800 bg-gray-100 rounded px-1.5 py-0.5">{mapped}</span>
                  </div>
                )
              })}
            </div>

            {/* Combined datetime hint */}
            {isCombined && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800">
                  Datum und Uhrzeit stehen in einer Spalte — die Trennung erfolgt automatisch.
                </p>
              </div>
            )}

            {/* Escape hatch */}
            <button
              onClick={() => setManualMode(true)}
              className="text-xs text-gray-400 hover:text-amber-600 transition-colors mb-4 block"
            >
              Falsch erkannt? Manuell anpassen &rarr;
            </button>

            {/* Timezone toggle */}
            <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 rounded-lg">
              <input
                type="checkbox"
                id="utc-toggle"
                checked={inputIsUTC}
                onChange={(e) => setInputIsUTC(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="utc-toggle" className="text-sm text-gray-700">
                Zeitstempel sind in UTC
                <span className="block text-xs text-gray-500">
                  (Normalerweise nicht — lass das deaktiviert wenn du unsicher bist)
                </span>
              </label>
            </div>

            <button
              onClick={confirmMapping}
              className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
            >
              Weiter
            </button>
          </>
        ) : (
          /* ── Manual / partial mode → show dropdowns ── */
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Spalten-Mapping</h2>

            {unmappedRequired.length > 0 && allRequiredMapped === false ? (
              <p className="text-sm text-gray-600 mb-6">
                Einige Spalten konnten nicht automatisch erkannt werden.
                Bitte ordne die fehlenden Felder manuell zu.
              </p>
            ) : (
              <p className="text-sm text-gray-600 mb-6">
                Prüfe die Zuordnung und passe sie bei Bedarf an.
              </p>
            )}

            {/* Combined datetime hint */}
            {isCombined && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Kombinierter Zeitstempel erkannt.</span>{' '}
                  Datum und Uhrzeit stehen in einer Spalte. Die Trennung erfolgt automatisch.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {visibleFields.map((field) => {
                const isRequired = REQUIRED_DISPLAY.includes(field)
                const isMapped = !!columnMapping[field]

                // In partial mode: show mapped fields as green confirmation, unmapped as dropdown
                if (isMapped && !manualMode && unmappedRequired.length > 0) {
                  return (
                    <div key={field}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {FIELD_LABELS[field]}
                      </label>
                      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                        <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-mono text-xs">{columnMapping[field]}</span>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={field}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {FIELD_LABELS[field]}
                      {isRequired && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <select
                      value={columnMapping[field] ?? ''}
                      onChange={(e) => {
                        setMapping(field, e.target.value)
                        if (field === 'datum' && e.target.value) {
                          if (columnMapping.uhrzeit === e.target.value || !columnMapping.uhrzeit) {
                            setMapping('uhrzeit', e.target.value)
                            setMapping('_combinedDatetime', '1')
                          }
                        }
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-sm ${
                        isRequired && !columnMapping[field]
                          ? 'border-red-300 bg-red-50'
                          : 'border-gray-300'
                      }`}
                    >
                      <option value="">— nicht zugeordnet —</option>
                      {csvHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>

            {/* Timezone toggle */}
            <div className="flex items-center gap-3 mb-6 p-3 bg-blue-50 rounded-lg">
              <input
                type="checkbox"
                id="utc-toggle"
                checked={inputIsUTC}
                onChange={(e) => setInputIsUTC(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="utc-toggle" className="text-sm text-gray-700">
                Zeitstempel sind in UTC
                <span className="block text-xs text-gray-500">
                  (Normalerweise nicht — lass das deaktiviert wenn du unsicher bist)
                </span>
              </label>
            </div>

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                {validationErrors.map((e, i) => (
                  <p key={i} className="text-sm text-red-700">{e.message}</p>
                ))}
              </div>
            )}

            {/* Preview table */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Vorschau (erste 5 Zeilen deiner Datei)</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {csvHeaders.map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 border-b">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((row, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              onClick={confirmMapping}
              className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
            >
              Import starten
            </button>
          </>
        )}
      </div>
    </div>
  )
}
