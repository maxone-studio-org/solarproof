import { useState } from 'react'
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
  const duplicateInfo = useAppStore((s) => s.duplicateInfo)
  const confirmDuplicate = useAppStore((s) => s.confirmDuplicate)
  const cancelDuplicate = useAppStore((s) => s.cancelDuplicate)
  const [landingOpen, setLandingOpen] = useState(false)
  const [creditsOpen, setCreditsOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onCredits={() => setCreditsOpen(true)} />

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
