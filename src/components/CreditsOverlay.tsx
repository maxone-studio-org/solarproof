import { useEffect, useCallback } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

export function CreditsOverlay({ open, onClose }: Props) {
  const handleClose = useCallback(() => onClose(), [onClose])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, handleClose])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto animate-fade-in">
      {/* Close */}
      <button
        onClick={handleClose}
        className="fixed top-6 right-6 z-10 p-2 rounded-full bg-white/80 backdrop-blur border border-gray-200 hover:bg-gray-100 transition-colors"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Credits</h1>
        <p className="text-gray-500 mb-12">SolarProof v{__APP_VERSION__} ({__GIT_COMMIT__})</p>

        {/* Developer */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Entwicklung</h2>
          <div className="bg-gray-50 rounded-xl p-6">
            <p className="text-gray-700 font-medium mb-1">maxone.one</p>
            <p className="text-sm text-gray-500 mb-4">
              Software-Entwicklung, Architektur und Design
            </p>
            <a
              href="https://maxone.one"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors"
            >
              maxone.one besuchen
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </section>

        {/* Technology */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Technologie</h2>
          <div className="grid grid-cols-2 gap-3">
            <TechCard name="React" description="UI Framework" />
            <TechCard name="Vite" description="Build Tool" />
            <TechCard name="TypeScript" description="Typsicherheit" />
            <TechCard name="Tailwind CSS" description="Styling" />
            <TechCard name="Chart.js" description="Diagramme" />
            <TechCard name="jsPDF" description="PDF-Generierung" />
            <TechCard name="PapaParse" description="CSV-Verarbeitung" />
            <TechCard name="date-fns" description="Zeitberechnung" />
            <TechCard name="Web Crypto API" description="SHA-256 Hashing" />
            <TechCard name="FreeTSA" description="RFC 3161 Zeitstempel" />
          </div>
        </section>

        {/* Version */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Versionierung</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">App-Version</span>
              <span className="font-mono text-gray-900">{__APP_VERSION__}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">Git-Commit</span>
              <span className="font-mono text-gray-900">{__GIT_COMMIT__}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">Spezifikation</span>
              <span className="font-mono text-gray-900">v1.2</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4 leading-relaxed">
            Alle Berechnungen sind anhand der Engine-Version und des Git-Commits jederzeit
            reproduzierbar. Der Quellcode ist auf GitHub verfügbar.
          </p>
        </section>

        {/* Legal */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Hinweise</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            SolarProof ist ein Werkzeug zur Simulation und Dokumentation.
            Die erzeugten Berichte stellen keine rechtliche oder technische Beratung dar.
            Für die Verwendung vor Gericht wird die Validierung durch einen
            Sachverständigen empfohlen.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed mt-3">
            Alle Daten werden ausschließlich in deinem Browser verarbeitet.
            Keine Messdaten verlassen deinen Rechner — nur der PDF-Hash wird
            für den Zeitstempel an die Zeitstempelbehörde übermittelt.
          </p>
        </section>

        {/* Back */}
        <button
          onClick={handleClose}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Zurück zum Tool
        </button>
      </div>
    </div>
  )
}

function TechCard({ name, description }: { name: string; description: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <p className="text-sm font-medium text-gray-900">{name}</p>
      <p className="text-xs text-gray-500">{description}</p>
    </div>
  )
}
