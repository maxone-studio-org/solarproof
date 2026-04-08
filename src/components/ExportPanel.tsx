import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../store'
import { generateMonthlyPdf } from '../utils/pdf'
import { requestTimestamp, computePdfHash } from '../utils/timestamp'
import { renderMonthlySocChart, renderMonthlyEvChart } from '../utils/chartExport'
import { calculateCostComparison } from '../utils/cost'

type ExportState = 'idle' | 'generating' | 'timestamping' | 'done' | 'error'

export function ExportPanel() {
  const days = useAppStore((s) => s.days)
  const simulationResults = useAppStore((s) => s.simulationResults)
  const simulationParams = useAppStore((s) => s.simulationParams)
  const fileMetadataList = useAppStore((s) => s.fileMetadataList)
  const dataGaps = useAppStore((s) => s.dataGaps)
  const overlapSummaries = useAppStore((s) => s.overlapSummaries)
  const costParams = useAppStore((s) => s.costParams)
  const costCapOverrides = useAppStore((s) => s.costCapOverrides)
  const selectedMonth = useAppStore((s) => s.selectedMonth)
  const importStep = useAppStore((s) => s.importStep)

  const [anlagenname, setAnlagenname] = useState('')
  const [exportState, setExportState] = useState<ExportState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [pdfHash, setPdfHash] = useState('')
  const [tsrReady, setTsrReady] = useState(false)

  const pdfBlobRef = useRef<Blob | null>(null)
  const tsrBlobRef = useRef<Blob | null>(null)

  const handleExport = useCallback(async () => {
    if (!selectedMonth || fileMetadataList.length === 0) return

    setExportState('generating')
    setErrorMsg('')
    setPdfHash('')
    setTsrReady(false)

    try {
      // Render charts offscreen
      const socChartImage = renderMonthlySocChart(days, simulationResults, selectedMonth)
      const evChartImage = renderMonthlyEvChart(days, selectedMonth)

      // Generate PDF
      const pdfBuffer = generateMonthlyPdf({
        month: selectedMonth,
        anlagenname,
        days,
        simResults: simulationResults,
        params: simulationParams,
        fileMetadataList,
        dataGaps,
        overlapSummaries,
        costComparison: costParams.kreditrate_eur_monat > 0 || costParams.nachzahlung_eur_jahr > 0
          ? calculateCostComparison(days, costParams, costCapOverrides)
          : undefined,
        socChartImage,
        evChartImage,
      })

      const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' })
      pdfBlobRef.current = pdfBlob

      // Compute PDF hash
      const hash = await computePdfHash(pdfBuffer)
      setPdfHash(hash)

      // Request RFC 3161 timestamp
      setExportState('timestamping')
      try {
        const tsrBuffer = await requestTimestamp(pdfBuffer)
        tsrBlobRef.current = new Blob([tsrBuffer], { type: 'application/timestamp-reply' })
        setTsrReady(true)
      } catch (tsaErr) {
        // TSA failure is non-fatal — PDF is still downloadable
        console.warn('TSA request failed:', tsaErr)
        setErrorMsg(`Zeitstempel-Anfrage fehlgeschlagen: ${tsaErr instanceof Error ? tsaErr.message : 'Unbekannter Fehler'}. PDF steht trotzdem zum Download bereit.`)
      }

      setExportState('done')
    } catch (err) {
      setExportState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Unbekannter Fehler')
    }
  }, [selectedMonth, anlagenname, days, simulationResults, simulationParams, fileMetadataList, dataGaps, overlapSummaries, costParams, costCapOverrides])

  const downloadPdf = useCallback(() => {
    if (!pdfBlobRef.current || !selectedMonth) return
    const url = URL.createObjectURL(pdfBlobRef.current)
    const a = document.createElement('a')
    a.href = url
    a.download = `pv-bericht-${selectedMonth}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }, [selectedMonth])

  const downloadTsr = useCallback(() => {
    if (!tsrBlobRef.current || !selectedMonth) return
    const url = URL.createObjectURL(tsrBlobRef.current)
    const a = document.createElement('a')
    a.href = url
    a.download = `pv-bericht-${selectedMonth}.tsr`
    a.click()
    URL.revokeObjectURL(url)
  }, [selectedMonth])

  const downloadBundle = useCallback(() => {
    downloadPdf()
    if (tsrReady) {
      setTimeout(() => downloadTsr(), 500)
    }
  }, [downloadPdf, downloadTsr, tsrReady])

  if (importStep !== 'done') return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">PDF-Gutachten erstellen</h2>
      <p className="text-xs text-gray-500 mb-3">
        Das PDF enthält alle Messdaten, die Simulation und einen rechtssicheren Zeitstempel.
        Du kannst es direkt deinem Anwalt oder Sachverständigen geben.
      </p>

      {/* Anlagenname */}
      <div className="mb-3">
        <label className="block text-xs text-gray-600 mb-1">
          Name deiner Anlage (erscheint auf dem Deckblatt)
        </label>
        <input
          type="text"
          value={anlagenname}
          onChange={(e) => setAnlagenname(e.target.value)}
          placeholder="z.B. PV-Anlage Musterstraße 1"
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>

      {/* Export button */}
      <button
        onClick={handleExport}
        disabled={exportState === 'generating' || exportState === 'timestamping'}
        className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
      >
        {exportState === 'generating' && 'PDF wird erstellt...'}
        {exportState === 'timestamping' && 'Zeitstempel wird angefordert...'}
        {(exportState === 'idle' || exportState === 'done' || exportState === 'error') && 'Monatsbericht exportieren'}
      </button>

      {/* Status */}
      {exportState === 'done' && (
        <div className="mt-3 space-y-2">
          {/* PDF Hash */}
          {pdfHash && (
            <div className="p-2 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">SHA-256 des PDFs:</p>
              <p className="text-xs font-mono text-gray-700 break-all">{pdfHash}</p>
            </div>
          )}

          {/* Download buttons */}
          <button
            onClick={downloadBundle}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
          >
            {tsrReady ? 'PDF + Zeitstempel herunterladen' : 'PDF herunterladen'}
          </button>

          {tsrReady && (
            <div className="flex gap-2">
              <button
                onClick={downloadPdf}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg text-xs"
              >
                Nur PDF
              </button>
              <button
                onClick={downloadTsr}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg text-xs"
              >
                Nur .tsr-Token
              </button>
            </div>
          )}

          {/* TSR info */}
          {tsrReady && (
            <p className="text-xs text-green-700">
              Zeitstempel erfolgreich erstellt. Das beweist, dass dieses Dokument zu genau diesem Zeitpunkt in genau dieser Form existiert hat.
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-800">{errorMsg}</p>
        </div>
      )}
    </div>
  )
}
