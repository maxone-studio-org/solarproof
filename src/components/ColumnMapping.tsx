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

  if (importStep !== 'mapping') return null

  const validationErrors = importErrors.filter((e) => e.line === 0)
  const isCombined = columnMapping._combinedDatetime === '1'

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Spalten-Mapping</h2>
        <p className="text-sm text-gray-600 mb-6">
          Ordne die Spalten deiner CSV-Datei den internen Feldern zu.
          Pflichtfelder sind mit * markiert.
        </p>

        {/* Combined datetime hint */}
        {isCombined && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              <span className="font-semibold">Kombinierter Zeitstempel erkannt.</span>{' '}
              Datum und Uhrzeit sind in einer Spalte (z.B. "26.10.2021 13:03:58"). Die Trennung erfolgt automatisch.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {INTERNAL_FIELDS.map((field) => {
            // Hide uhrzeit when combined datetime detected
            if (field === 'uhrzeit' && isCombined) return null

            const isRequired = REQUIRED_DISPLAY.includes(field)
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
                    // If datum is set and matches uhrzeit → mark combined
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
            Zeitstempel in der CSV sind bereits in UTC
            <span className="block text-xs text-gray-500">
              (Standard: Lokalzeit Europe/Berlin)
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
          <h3 className="text-sm font-medium text-gray-700 mb-2">Vorschau (erste 5 Zeilen)</h3>
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
      </div>
    </div>
  )
}
