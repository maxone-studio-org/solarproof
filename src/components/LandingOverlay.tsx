import { useEffect, useCallback } from 'react'

const STORAGE_KEY = 'pv-analyse-pro-landing-seen'

interface Props {
  open: boolean
  onClose: () => void
}

export function LandingOverlay({ open, onClose }: Props) {
  const handleClose = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    onClose()
  }, [onClose])

  // Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, handleClose])

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto animate-fade-in">
      {/* Close button */}
      <button
        onClick={handleClose}
        className="fixed top-6 right-6 z-10 p-2 rounded-full bg-white/80 backdrop-blur border border-gray-200 hover:bg-gray-100 transition-colors"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* ── Hero ── */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-4 py-1.5 mb-6">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-xs font-medium text-amber-800">Open Source — kostenlos — kein Account</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight">
          SolarProof
        </h1>
        <p className="mt-4 text-lg text-gray-600 max-w-xl mx-auto leading-relaxed">
          Rechtssichere Dokumentation von PV-Einspeisedaten.
          Wenn der Batteriespeicher ausfällt und der Nachweis vor Gericht zählt.
        </p>
        <button
          onClick={handleClose}
          className="mt-8 inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 py-3 rounded-xl transition-colors text-sm"
        >
          Tool starten
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </section>

      {/* ── Problem / Lösung ── */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Das Problem</h2>
          <div className="space-y-4 text-gray-600 leading-relaxed">
            <p>
              Dein Batteriespeicher ist defekt. Seit Monaten speist du Strom ins Netz ein,
              den du eigentlich selbst hättest nutzen können. Der Hersteller reagiert nicht.
              Du ziehst vor Gericht.
            </p>
            <p>
              Und dann die Frage des Richters:
              <span className="font-semibold text-gray-900"> "Wie hoch ist Ihr tatsächlicher Schaden?"</span>
            </p>
            <p>
              Du hast Messdaten aus deinem Wechselrichter. Aber kein Werkzeug, das daraus
              einen belastbaren, nachvollziehbaren Nachweis macht.
            </p>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-6">Die Lösung</h2>
          <p className="text-gray-600 leading-relaxed">
            SolarProof nimmt deine realen Messdaten, simuliert einen funktionierenden
            Speicher mit den exakten Parametern deiner Anlage und erstellt ein PDF-Gutachten
            mit kryptografischer Integritätssicherung — gerichtsverwertbar und reproduzierbar.
          </p>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-10 text-center">Was das Tool kann</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<UploadIcon />}
              title="CSV-Import"
              description="Messdaten von SMA, Fronius, Huawei, Kostal, SENEC — automatische Spaltenerkennung."
            />
            <FeatureCard
              icon={<CpuIcon />}
              title="Speichersimulation"
              description="Kapazität, Entladetiefe, Wirkungsgrade — alle Parameter konfigurierbar und dokumentiert."
            />
            <FeatureCard
              icon={<FileIcon />}
              title="PDF-Gutachten"
              description="Monatsbericht mit Tagesdaten, Charts, Simulationsparametern und Disclaimer."
            />
            <FeatureCard
              icon={<ShieldIcon />}
              title="SHA-256 Integrität"
              description="Kryptografischer Fingerabdruck der Quelldatei — Manipulation nachweisbar ausgeschlossen."
            />
            <FeatureCard
              icon={<ClockIcon />}
              title="RFC 3161 Zeitstempel"
              description="Akkreditierte Zeitstempelbehörde bestätigt: Dieses Dokument existierte zu diesem Zeitpunkt."
            />
            <FeatureCard
              icon={<CodeIcon />}
              title="Reproduzierbar"
              description="Engine-Version und Git-Commit im PDF — die Berechnung ist auch Jahre später nachvollziehbar."
            />
          </div>
        </div>
      </section>

      {/* ── So funktioniert's ── */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-10 text-center">Drei Schritte</h2>
          <div className="space-y-8">
            <Step
              number="1"
              title="CSV hochladen"
              description="Exportiere deine Messdaten aus dem Wechselrichter-Portal. Drag & Drop in die App. Die Spalten werden automatisch erkannt."
            />
            <Step
              number="2"
              title="Speicher simulieren"
              description="Stelle die Parameter deines Speichers ein — Kapazität, Entladetiefe, Wirkungsgrade. Die Simulation läuft sofort."
            />
            <Step
              number="3"
              title="PDF + Zeitstempel exportieren"
              description="Ein Klick erstellt das Gutachten-PDF mit SHA-256-Hash und RFC 3161 Zeitstempel. Bereit für den Anwalt."
            />
          </div>
        </div>
      </section>

      {/* ── Vertrauen ── */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Warum gerichtsverwertbar?</h2>
          <p className="text-gray-600 mb-10 max-w-xl mx-auto">
            Drei unabhängige Mechanismen sichern die Integrität des Ergebnisses.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <TrustCard
              title="Quelldaten-Hash"
              description="SHA-256 der CSV-Datei wird beim Upload berechnet und im PDF dokumentiert. Jede Änderung an den Eingabedaten wäre sofort nachweisbar."
            />
            <TrustCard
              title="Zeitstempel"
              description="Das fertige PDF wird bei einer akkreditierten Stelle (RFC 3161 / eIDAS) signiert. Das beweist, wann das Dokument erstellt wurde."
            />
            <TrustCard
              title="Versionierung"
              description="App-Version und Git-Commit-Hash sind im PDF dokumentiert. Die Berechnung kann jederzeit exakt reproduziert werden."
            />
          </div>
        </div>
      </section>

      {/* ── CTA Footer ── */}
      <section className="py-16 bg-gradient-to-b from-white to-amber-50">
        <div className="max-w-xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Bereit?</h2>
          <p className="text-gray-600 mb-8">
            Kostenlos. Ohne Anmeldung. Alles läuft in deinem Browser — keine Daten verlassen deinen Rechner.
          </p>
          <button
            onClick={handleClose}
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-10 py-3.5 rounded-xl transition-colors"
          >
            Jetzt starten
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
          <p className="mt-6 text-xs text-gray-400">
            SolarProof v{__APP_VERSION__} — Open Source auf GitHub
          </p>
        </div>
      </section>
    </div>
  )
}

// ── Sub-Components ────────────────────────────────────

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-5 bg-white">
      <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 mb-3">
        {icon}
      </div>
      <h3 className="font-semibold text-gray-900 text-sm mb-1">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
    </div>
  )
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-8 h-8 rounded-full bg-amber-500 text-white font-bold text-sm flex items-center justify-center">
        {number}
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </div>
  )
}

function TrustCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900 text-sm mb-2">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  )
}

function CpuIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  )
}
