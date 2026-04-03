import { useAppStore } from '../store'

export function GapWarnings() {
  const dataGaps = useAppStore((s) => s.dataGaps)
  const overlapSummaries = useAppStore((s) => s.overlapSummaries)
  const fileMetadataList = useAppStore((s) => s.fileMetadataList)
  const importStep = useAppStore((s) => s.importStep)

  if (importStep !== 'done') return null

  const totalOverlaps = overlapSummaries.reduce((s, o) => s + o.count, 0)
  if (dataGaps.length === 0 && totalOverlaps === 0) return null

  const missingDays = dataGaps.filter((g) => g.type === 'missing_days')
  const missingIntervals = dataGaps.filter((g) => g.type === 'missing_intervals')
  const totalGapHours = dataGaps.reduce((s, g) => s + g.durationHours, 0)

  const fileName = (idx: number) => fileMetadataList[idx]?.name ?? `Datei ${idx + 1}`
  const fileHash = (idx: number) => fileMetadataList[idx]?.sha256.substring(0, 12) ?? '???'

  return (
    <div className="space-y-2">
      {/* Summary banner */}
      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-800">
              Datenvollständigkeit: {dataGaps.length} Lücke{dataGaps.length !== 1 && 'n'} erkannt
              {totalOverlaps > 0 && `, ${totalOverlaps} Überlappung${totalOverlaps !== 1 ? 'en' : ''} bereinigt`}
            </p>
            {dataGaps.length > 0 && (
              <p className="text-xs text-red-700 mt-0.5">
                Gesamtdauer ohne Daten: {formatTotalHours(totalGapHours)}.
                Simulation hat für diese Zeiträume keine Grundlage — im PDF dokumentiert.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Missing days */}
      {missingDays.length > 0 && (
        <div className="bg-red-50/50 border border-red-100 rounded-lg px-4 py-2.5">
          <p className="text-xs font-semibold text-red-800 mb-1">
            Fehlende Tage ({missingDays.length})
          </p>
          <ul className="text-xs text-red-700 space-y-0.5 max-h-28 overflow-y-auto">
            {missingDays.map((g, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
                {g.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing intervals */}
      {missingIntervals.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5">
          <p className="text-xs font-semibold text-orange-800 mb-1">
            Fehlende Intervalle ({missingIntervals.length})
          </p>
          <ul className="text-xs text-orange-700 space-y-0.5 max-h-28 overflow-y-auto">
            {missingIntervals.slice(0, 20).map((g, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-orange-400 shrink-0" />
                {g.message}
              </li>
            ))}
            {missingIntervals.length > 20 && (
              <li className="text-orange-500">... und {missingIntervals.length - 20} weitere</li>
            )}
          </ul>
        </div>
      )}

      {/* Overlaps — per file pair with names and hashes */}
      {overlapSummaries.map((os, i) => (
        <div key={i} className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <p className="text-xs text-blue-800">
            <span className="font-semibold">{os.count} Überlappung{os.count !== 1 ? 'en' : ''}</span> zwischen{' '}
            <span className="font-mono">{fileName(os.fileIndexA)}</span> ({fileHash(os.fileIndexA)}...) und{' '}
            <span className="font-mono">{fileName(os.fileIndexB)}</span> ({fileHash(os.fileIndexB)}...).
          </p>
          <p className="text-xs text-blue-700 mt-0.5">
            Vorrang: <span className="font-semibold">{fileName(os.fileIndexA)}</span> (zuerst hochgeladen).
          </p>
        </div>
      ))}
    </div>
  )
}

function formatTotalHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} Minuten`
  if (hours < 24) return `${hours.toFixed(1)} Stunden`
  const days = Math.floor(hours / 24)
  const remaining = hours % 24
  if (remaining === 0) return `${days} Tag${days !== 1 ? 'e' : ''}`
  return `${days} Tag${days !== 1 ? 'e' : ''} ${remaining.toFixed(0)} Std.`
}
