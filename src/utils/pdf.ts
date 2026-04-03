import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { DayData, DaySimulation, FileMetadata, SimulationParams } from '../types'

interface PdfExportOptions {
  month: string // YYYY-MM
  anlagenname: string
  days: DayData[]
  simResults: DaySimulation[]
  params: SimulationParams
  fileMetadata: FileMetadata
  socChartImage?: string // base64 data URL
  evChartImage?: string  // base64 data URL
}

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}`
}

function formatDateTime(date: Date): string {
  const d = date.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
  const t = date.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' })
  return `${d} ${t}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Bytes`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function generateMonthlyPdf(options: PdfExportOptions): ArrayBuffer {
  const { month, anlagenname, days, simResults, params, fileMetadata, socChartImage, evChartImage } = options

  const [yearStr, monthStr] = month.split('-')
  const monthName = MONTHS[parseInt(monthStr) - 1]
  const now = new Date()

  const monthDays = days.filter((d) => d.date.startsWith(month))
  const monthSim = simResults.filter((d) => d.date.startsWith(month))

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin

  // ── Deckblatt ──────────────────────────────────────────

  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('PV-Analyse-Pro', margin, 40)

  doc.setFontSize(16)
  doc.setFont('helvetica', 'normal')
  doc.text('Monatsbericht — Simulation Batteriespeicher', margin, 52)

  doc.setFontSize(12)
  let y = 70

  const addField = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold')
    doc.text(label, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, margin + 55, y)
    y += 7
  }

  addField('Anlage:', anlagenname || '(nicht angegeben)')
  addField('Zeitraum:', `${monthName} ${yearStr}`)
  addField('Erstellt:', formatDateTime(now))
  addField('Tage mit Daten:', `${monthDays.length}`)

  y += 5
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  // Quelldatei-Informationen
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Quelldatei', margin, y)
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  addField('Dateiname:', fileMetadata.name)
  addField('Dateigröße:', formatBytes(fileMetadata.size))
  addField('Import:', formatDateTime(fileMetadata.importTimestamp))

  doc.setFont('helvetica', 'bold')
  doc.text('SHA-256:', margin, y)
  doc.setFont('courier', 'normal')
  doc.setFontSize(8)
  doc.text(fileMetadata.sha256, margin + 55, y)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  y += 12

  // Engine-Version
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Engine-Version', margin, y)
  y += 7
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  addField('Version:', __APP_VERSION__)
  addField('Git-Commit:', __GIT_COMMIT__)
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text('Berechnung kann auf Basis dieses Commits reproduziert werden.', margin, y)
  doc.setTextColor(0, 0, 0)
  y += 10

  // Simulationsparameter
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Simulationsparameter', margin, y)
  y += 7
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')

  addField('Speicherkapazität:', `${params.kapazitaet_kwh} kWh`)
  addField('Entladetiefe (DoD):', `${params.entladetiefe_pct} %`)
  addField('Ladewirkungsgrad:', `${params.ladewirkungsgrad_pct} %`)
  addField('Entladewirkungsgrad:', `${params.entladewirkungsgrad_pct} %`)
  addField('Anfangs-SoC:', `${params.anfangs_soc_pct} %`)

  y += 3
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text(
    'Simulationsparameter wurden vom Nutzer festgelegt. Eine Validierung durch einen',
    margin, y
  )
  y += 4
  doc.text(
    'Sachverständigen wird für gerichtliche Zwecke empfohlen.',
    margin, y
  )
  doc.setTextColor(0, 0, 0)
  y += 8

  // Disclaimer
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'italic')
  doc.text(
    'Dieses Dokument enthält eine Simulation / Theoretische Berechnung.',
    margin, y
  )
  y += 5
  doc.text(
    'Die dargestellten Speicherwerte sind simuliert und nicht gemessen.',
    margin, y
  )

  // ── Seite 2: Monatliche Zusammenfassung ──────────────

  doc.addPage()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(`Monatszusammenfassung — ${monthName} ${yearStr}`, margin, 20)

  // Monthly totals
  const mTotals = {
    erzeugung: monthDays.reduce((s, d) => s + d.totals.erzeugung_kwh, 0),
    verbrauch: monthDays.reduce((s, d) => s + d.totals.verbrauch_kwh, 0),
    einspeisung: monthDays.reduce((s, d) => s + d.totals.einspeisung_kwh, 0),
    netzbezug: monthDays.reduce((s, d) => s + d.totals.netzbezug_kwh, 0),
    geladen: monthSim.reduce((s, d) => s + d.totals.geladen_kwh, 0),
    entladen: monthSim.reduce((s, d) => s + d.totals.entladen_kwh, 0),
    netzbezugSim: monthSim.reduce((s, d) => s + d.totals.netzbezug_sim_kwh, 0),
    einspeisungSim: monthSim.reduce((s, d) => s + d.totals.einspeisung_sim_kwh, 0),
  }

  const autarkieOhne = mTotals.verbrauch > 0
    ? ((mTotals.verbrauch - mTotals.netzbezug) / mTotals.verbrauch) * 100 : 0
  const autarkieMit = mTotals.verbrauch > 0
    ? ((mTotals.verbrauch - mTotals.netzbezugSim) / mTotals.verbrauch) * 100 : 0

  autoTable(doc, {
    startY: 28,
    margin: { left: margin, right: margin },
    head: [['Kennzahl', 'Ist (kWh)', 'Simuliert (kWh)']],
    body: [
      ['Erzeugung', mTotals.erzeugung.toFixed(2), '—'],
      ['Verbrauch', mTotals.verbrauch.toFixed(2), '—'],
      ['Einspeisung', mTotals.einspeisung.toFixed(2), mTotals.einspeisungSim.toFixed(2)],
      ['Netzbezug', mTotals.netzbezug.toFixed(2), mTotals.netzbezugSim.toFixed(2)],
      ['Sp. geladen', '—', mTotals.geladen.toFixed(2)],
      ['Sp. entladen', '—', mTotals.entladen.toFixed(2)],
      ['Autarkiegrad', `${autarkieOhne.toFixed(1)} %`, `${autarkieMit.toFixed(1)} %`],
    ],
    styles: { fontSize: 9, font: 'helvetica' },
    headStyles: { fillColor: [245, 158, 11], textColor: 255 },
    alternateRowStyles: { fillColor: [252, 250, 245] },
  })

  // Charts if available
  const afterTable = (doc as unknown as Record<string, Record<string, number>>).lastAutoTable?.finalY ?? 100

  if (socChartImage) {
    const chartY = afterTable + 10
    if (chartY + 60 < doc.internal.pageSize.getHeight() - margin) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('SoC-Verlauf (simuliert)', margin, chartY)
      doc.addImage(socChartImage, 'PNG', margin, chartY + 3, contentWidth, 55)
    }
  }

  if (evChartImage) {
    let chartY = (afterTable + (socChartImage ? 75 : 10))
    if (chartY + 60 > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage()
      chartY = 20
    }
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Erzeugung vs. Verbrauch', margin, chartY)
    doc.addImage(evChartImage, 'PNG', margin, chartY + 3, contentWidth, 55)
  }

  // ── Seite 3+: Tagesliste ─────────────────────────────

  doc.addPage()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(`Tagesdaten — ${monthName} ${yearStr}`, margin, 20)

  const tableData = monthDays.map((day, i) => {
    const sim = monthSim[i]
    return [
      formatDate(day.date),
      day.totals.erzeugung_kwh.toFixed(2),
      day.totals.verbrauch_kwh.toFixed(2),
      day.totals.einspeisung_kwh.toFixed(2),
      day.totals.netzbezug_kwh.toFixed(2),
      sim ? sim.totals.geladen_kwh.toFixed(2) : '—',
      sim ? sim.totals.entladen_kwh.toFixed(2) : '—',
      sim ? sim.totals.netzbezug_sim_kwh.toFixed(2) : '—',
    ]
  })

  autoTable(doc, {
    startY: 28,
    margin: { left: margin, right: margin },
    head: [[
      'Datum',
      'Erzeugung\n(kWh)',
      'Verbrauch\n(kWh)',
      'Einspeisng.\nist (kWh)',
      'Netzbezug\nist (kWh)',
      'Sp. geladen\n(kWh)',
      'Sp. entladen\n(kWh)',
      'Netzbezug\nsim. (kWh)',
    ]],
    body: tableData,
    styles: { fontSize: 7, font: 'helvetica', cellPadding: 2 },
    headStyles: { fillColor: [245, 158, 11], textColor: 255, fontSize: 7 },
    alternateRowStyles: { fillColor: [252, 250, 245] },
  })

  // ── Footer auf allen Seiten ──────────────────────────

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const pageH = doc.internal.pageSize.getHeight()
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150, 150, 150)
    doc.text(
      `PV-Analyse-Pro v${__APP_VERSION__} (${__GIT_COMMIT__}) — Seite ${i}/${pageCount}`,
      margin,
      pageH - 8
    )
    doc.text(
      'Simulation / Theoretische Berechnung — Keine gemessenen Speicherdaten',
      pageWidth - margin,
      pageH - 8,
      { align: 'right' }
    )
    doc.setTextColor(0, 0, 0)
  }

  return doc.output('arraybuffer') as unknown as ArrayBuffer
}
