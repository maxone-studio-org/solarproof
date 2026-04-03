import { Header } from './components/Header'
import { CsvImport } from './components/CsvImport'
import { ColumnMapping } from './components/ColumnMapping'
import { ImportWarnings } from './components/ImportWarnings'
import { SimulationConfig } from './components/SimulationConfig'
import { Calendar } from './components/Calendar'
import { MonthSummary } from './components/MonthSummary'
import { DayDetailModal } from './components/DayDetailModal'
import { ExportPanel } from './components/ExportPanel'
import { useAppStore } from './store'

function App() {
  const importStep = useAppStore((s) => s.importStep)

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      {/* Import area */}
      <CsvImport />
      <ColumnMapping />

      {/* Main content */}
      {importStep === 'done' && (
        <div className="px-6 py-4 space-y-4">
          <ImportWarnings />

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            {/* Sidebar */}
            <div className="space-y-4">
              <SimulationConfig />
              <ExportPanel />
            </div>

            {/* Main area */}
            <div className="space-y-4">
              <Calendar />
              <MonthSummary />
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      <DayDetailModal />
    </div>
  )
}

export default App
