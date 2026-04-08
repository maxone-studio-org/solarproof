import { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { CsvImport } from './components/CsvImport'
import { ColumnMapping } from './components/ColumnMapping'
import { ImportWarnings } from './components/ImportWarnings'
import { GapWarnings } from './components/GapWarnings'
import { SimulationConfig } from './components/SimulationConfig'
import { Calendar } from './components/Calendar'
import { MonthSummary } from './components/MonthSummary'
import { DayDetailModal } from './components/DayDetailModal'
import { ExportPanel } from './components/ExportPanel'
import { LandingBanner } from './components/LandingBanner'
import { LandingOverlay } from './components/LandingOverlay'
import { DuplicateDialog } from './components/DuplicateDialog'
import { CreditsOverlay } from './components/CreditsOverlay'
import { CostComparison } from './components/CostComparison'
import { AllMonthsOverview } from './components/AllMonthsOverview'
import { FeedbackButton } from './components/FeedbackButton'
import { useAppStore } from './store'

function App() {
  const importStep = useAppStore((s) => s.importStep)
  const rehydrating = useAppStore((s) => s.rehydrating)
  const rehydrate = useAppStore((s) => s.rehydrate)
  const duplicateInfo = useAppStore((s) => s.duplicateInfo)
  const confirmDuplicate = useAppStore((s) => s.confirmDuplicate)
  const cancelDuplicate = useAppStore((s) => s.cancelDuplicate)
  const [landingOpen, setLandingOpen] = useState(false)
  const [creditsOpen, setCreditsOpen] = useState(false)

  // Restore data from IndexedDB on first load
  useEffect(() => { rehydrate() }, [rehydrate])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onCredits={() => setCreditsOpen(true)} />

      {/* Loading indicator for data restore */}
      {rehydrating && (
        <div className="px-6 py-8 text-center">
          <div className="inline-flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-6 py-3">
            <svg className="w-5 h-5 text-amber-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-amber-800 font-medium">Gespeicherte Daten werden geladen...</span>
          </div>
        </div>
      )}

      {/* Import area */}
      <CsvImport />
      {importStep === 'idle' && (
        <LandingBanner onOpen={() => setLandingOpen(true)} />
      )}
      <ColumnMapping />

      {/* Main content */}
      {importStep === 'done' && (
        <div className="px-6 py-4 space-y-4">
          <ImportWarnings />
          <GapWarnings />

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            {/* Sidebar */}
            <div className="space-y-4">
              <SimulationConfig />
              <CostComparison />
              <ExportPanel />
            </div>

            {/* Main area */}
            <div className="space-y-4">
              <AllMonthsOverview />
              <Calendar />
              <MonthSummary />
            </div>
          </div>
        </div>
      )}

      {/* Modals / Overlays */}
      <DayDetailModal />
      <LandingOverlay open={landingOpen} onClose={() => setLandingOpen(false)} />
      <CreditsOverlay open={creditsOpen} onClose={() => setCreditsOpen(false)} />

      {/* Feedback button */}
      <FeedbackButton />

      {/* Duplicate detection dialog */}
      {duplicateInfo && (
        <DuplicateDialog
          duplicateCount={duplicateInfo.duplicateCount}
          totalCount={duplicateInfo.totalCount}
          isFullDuplicate={duplicateInfo.isFullDuplicate}
          fileName={duplicateInfo.fileName}
          onImportNew={() => confirmDuplicate('new_only')}
          onReplaceAll={() => confirmDuplicate('replace')}
          onCancel={cancelDuplicate}
        />
      )}
    </div>
  )
}

export default App
