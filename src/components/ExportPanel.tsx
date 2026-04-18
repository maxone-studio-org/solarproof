import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../store'
import { generateMonthlyPdf, generateFullPdf } from '../utils/pdf'
import { requestTimestamp, computePdfHash } from '../utils/timestamp'
import { renderMonthlySocChart, renderMonthlyEvChart } from '../utils/chartExport'
import { calculateCostComparison, calculateStorageSavings, hasAnyCostInput } from '../utils/cost'

type ExportState = 'idle' | 'generating' | 'timestamping' | 'done' | 'error'
type ReportType = 'month' | 'full'

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
  const [reportType, setReportType] = useState<ReportType>('full')
  const [exportState, setExportState] = useState<ExportState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [pdfHash, setPdfHash] = useState('')
  const [tsrReady, setTsrReady] = useState(false)

  const pdfBlobRef = useRef<Blob | null>(null)
  const tsrBlobRef = useRef<Blob | null>(null)
  const lastFileNameRef = useRef<string>('')

  const hasCostData = hasAnyCostInput(costParams)

  const handleExport = useCallback(async () => {
    if (fileMetadataList.length === 0) return
    if (reportType === 'month' && !selectedMonth) return

    setExportState('generating')
    setErrorMsg('')
    setPdfHash('')
    setTsrReady(false)

    try {
      let pdfBuffer: ArrayBuffer

      if (reportType === 'full') {
        pdfBuffer = generateFullPdf({
          anlagenname,
          days,
          simResults: simulationResults,
          params: simulationParams,
          fileMetadataList,
          dataGaps,
          overlapSummaries,
          costComparison: hasCostData
            ? calculateCostComparison(days, costParams, costCapOverrides)
            : undefined,
          storageSavings: simulationResults.length > 0
            ? calculateStorageSavings(days, simulationResults, costCapOverrides)
            : undefined,
        })
        lastFileNameRef.current = 'pv-gesamtbericht'
      } else {
        const socChartImage = renderMonthlySocChart(days, simulationResults, selectedMonth!)
        const evChartImage = renderMonthlyEvChart(days, selectedMonth!)

        pdfBuffer = generateMonthlyPdf({
          month: selectedMonth!,
          anlagenname,
          days,
          simResults: simulationResults,
          params: simulationParams,
          fileMetadataList,
          dataGaps,
          overlapSummaries,
          costComparison: hasCostData
            ? calculateCostComparison(days, costParams, costCapOverrides)
            : undefined,
          storageSavings: simulationResults.length > 0
            ? calculateStorageSavings(days, simulationResults, costCapOverrides)
            : undefined,
          socChartImage,
          evChartImage,
        })
        lastFileNameRef.current = `pv-bericht-${selectedMonth}`
      }

      const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' })
      pdfBlobRef.current = pdfBlob

      const hash = await computePdfHash(pdfBuffer)
      setPdfHash(hash)

      setExportState('timestamping')
      try {
        const tsrBuffer = await requestTimestamp(pdfBuffer)
        tsrBlobRef.current = new Blob([tsrBuffer], { type: 'application/timestamp-reply' })
        setTsrReady(true)
      } catch (tsaErr) {
        console.warn('TSA request failed:', tsaErr)
        setErrorMsg(`Zeitstempel-Anfrage fehlgeschlagen: ${tsaErr instanceof Error ? tsaErr.message : 'Unbekannter Fehler'}. PDF steht trotzdem zum Download bereit.`)
      }

      setExportState('done')
    } catch (err) {
      setExportState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Unbekannter Fehler')
    }
  }, [reportType, selectedMonth, anlagenname, days, simulationResults, simulationParams, fileMetadataList, dataGaps, overlapSummaries, costParams, costCapOverrides, hasCostData])

  const downloadPdf = useCallback(() => {
    if (!pdfBlobRef.current) return
    const url = URL.createObjectURL(pdfBlobRef.current)
    const a = document.createElement('a')
    a.href = url
    a.download = `${lastFileNameRef.current}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const downloadTsr = useCallback(() => {
    if (!tsrBlobRef.current) return
    const url = URL.createObjectURL(tsrBlobRef.current)
    const a = document.createElement('a')
    a.href = url
    a.download = `${lastFileNameRef.current}.tsr`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const downloadBundle = useCallback(() => {
    downloadPdf()
    if (tsrReady) {
      setTimeout(() => downloadTsr(), 500)
    }
  }, [downloadPdf, downloadTsr, tsrReady])

  if (importStep !== 'done') return null

  const canExport = reportType === 'full' || selectedMonth

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">PDF-Gutachten erstellen</h2>
      <p className="text-xs text-gray-500 mb-3">
        Das PDF enthält alle Messdaten, die Simulation und einen rechtssicheren Zeitstempel.
      </p>

      {/* Report type toggle */}
      <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-0.5">
        <button
          onClick={() => { setReportType('full'); setExportState('idle') }}
          className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
            reportType === 'full'
              ? 'bg-white text-gray-900 font-medium shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Gesamtbericht
        </button>
        <button
          onClick={() => { setReportType('month'); setExportState('idle') }}
          className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
            reportType === 'month'
              ? 'bg-white text-gray-900 font-medium shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Monatsbericht
        </button>
      </div>

      {reportType === 'month' && !selectedMonth && (
        <p className="text-xs text-amber-600 mb-3">
          Wähle zuerst einen Monat im Kalender aus.
        </p>
      )}

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
        disabled={exportState === 'generating' || exportState === 'timestamping' || !canExport}
        className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
      >
        {exportState === 'generating' && 'PDF wird erstellt...'}
        {exportState === 'timestamping' && 'Zeitstempel wird angefordert...'}
        {(exportState === 'idle' || exportState === 'done' || exportState === 'error') &&
          (reportType === 'full' ? 'Gesamtbericht exportieren' : 'Monatsbericht exportieren')}
      </button>

      {/* Status */}
      {exportState === 'done' && (
        <div className="mt-3 space-y-2">
          {pdfHash && (
            <div className="p-2 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">SHA-256 des PDFs:</p>
              <p className="text-xs font-mono text-gray-700 break-all">{pdfHash}</p>
            </div>
          )}

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

          {tsrReady && (
            <p className="text-xs text-green-700">
              Zeitstempel erfolgreich erstellt. Das beweist, dass dieses Dokument zu genau diesem Zeitpunkt in genau dieser Form existiert hat.
            </p>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="mt-3 p-3 bg-red-50 border-2 border-red-300 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-red-800">Zeitstempel fehlt!</p>
              <p className="text-xs text-red-700 mt-1">{errorMsg}</p>
              <p className="text-xs text-red-600 mt-2 font-medium">
                Ohne Zeitstempel hat das PDF eingeschränkte Beweiskraft vor Gericht.
                Du kannst das PDF trotzdem herunterladen und den Zeitstempel später manuell
                über <a href="https://freetsa.org/index_en.php" target="_blank" rel="noopener" className="underline">freetsa.org</a> anfordern.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
