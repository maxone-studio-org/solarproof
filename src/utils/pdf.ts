import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { DataGap, DayData, DaySimulation, FileMetadata, OverlapSummary, SimulationParams } from '../types'

interface PdfExportOptions {
  month: string // YYYY-MM
  anlagenname: string
  days: DayData[]
  simResults: DaySimulation[]
  params: SimulationParams
  fileMetadataList: FileMetadata[]
  dataGaps: DataGap[]
  overlapSummaries: OverlapSummary[]
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
  const { month, anlagenname, days, simResults, params, fileMetadataList, dataGaps, overlapSummaries, socChartImage, evChartImage } = options

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
  doc.text(fileMetadataList.length === 1 ? 'Quelldatei' : `Quelldateien (${fileMetadataList.length})`, margin, y)
  y += 7

  for (const fileMeta of fileMetadataList) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    addField('Dateiname:', fileMeta.name)
    addField('Dateigröße:', formatBytes(fileMeta.size))
    addField('Import:', formatDateTime(fileMeta.importTimestamp))

    doc.setFont('helvetica', 'bold')
    doc.text('SHA-256:', margin, y)
    doc.setFont('courier', 'normal')
    doc.setFontSize(8)
    doc.text(fileMeta.sha256, margin + 55, y)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    y += 8

    if (fileMetadataList.length > 1) {
      doc.setDrawColor(230, 230, 230)
      doc.line(margin + 10, y - 2, pageWidth - margin - 10, y - 2)
      y += 2
    }
  }
  y += 4

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

  // Datenvollständigkeit
  const totalOverlaps = overlapSummaries.reduce((s, o) => s + o.count, 0)
  if (dataGaps.length > 0 || totalOverlaps > 0) {
    // Check if we need a new page
    if (y > 240) {
      doc.addPage()
      y = 20
    }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(180, 0, 0)
    doc.text('Datenvollständigkeit — Lückenprotokoll', margin, y)
    doc.setTextColor(0, 0, 0)
    y += 7

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')

    const totalGapHours = dataGaps.reduce((s, g) => s + g.durationHours, 0)
    doc.text(
      `${dataGaps.length} Lücke${dataGaps.length !== 1 ? 'n' : ''} erkannt. Gesamtdauer ohne Daten: ${totalGapHours < 24 ? totalGapHours.toFixed(1) + ' Stunden' : (totalGapHours / 24).toFixed(1) + ' Tage'}.`,
      margin, y
    )
    y += 5

    // Per-file-pair overlap summaries
    for (const os of overlapSummaries) {
      const nameA = fileMetadataList[os.fileIndexA]?.name ?? `Datei ${os.fileIndexA + 1}`
      const hashA = fileMetadataList[os.fileIndexA]?.sha256.substring(0, 16) ?? '?'
      const nameB = fileMetadataList[os.fileIndexB]?.name ?? `Datei ${os.fileIndexB + 1}`
      const hashB = fileMetadataList[os.fileIndexB]?.sha256.substring(0, 16) ?? '?'
      doc.text(
        `${os.count} Konflikte: ${nameA} (${hashA}...) vs. ${nameB} (${hashB}...) — Vorrang: ${nameA}`,
        margin, y
      )
      y += 4
    }

    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.text(
      'Die Simulation hat für die genannten Zeiträume keine Datengrundlage. Die simulierten Werte',
      margin, y
    )
    y += 3.5
    doc.text(
      'beziehen sich ausschließlich auf Zeiträume mit vorhandenen Messdaten.',
      margin, y
    )
    doc.setTextColor(0, 0, 0)
    y += 5

    // Gap table
    if (dataGaps.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Typ', 'Zeitraum', 'Dauer', 'Beschreibung']],
        body: dataGaps.slice(0, 30).map((g) => [
          g.type === 'missing_days' ? 'Fehlende Tage' :
          g.type === 'missing_intervals' ? 'Fehlende Intervalle' : 'Überlappung',
          `${g.from} – ${g.to}`,
          g.durationHours < 1 ? `${Math.round(g.durationHours * 60)} Min.` :
          g.durationHours < 24 ? `${g.durationHours.toFixed(1)} Std.` :
          `${(g.durationHours / 24).toFixed(1)} Tage`,
          g.message,
        ]),
        styles: { fontSize: 7, font: 'helvetica', cellPadding: 1.5 },
        headStyles: { fillColor: [180, 0, 0], textColor: 255, fontSize: 7 },
        alternateRowStyles: { fillColor: [255, 245, 245] },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 30 },
          2: { cellWidth: 18 },
          3: { cellWidth: 'auto' },
        },
      })

      if (dataGaps.length > 30) {
        const tableEnd = (doc as unknown as Record<string, Record<string, number>>).lastAutoTable?.finalY ?? y + 20
        doc.setFontSize(7)
        doc.setTextColor(150, 150, 150)
        doc.text(`... und ${dataGaps.length - 30} weitere Lücken.`, margin, tableEnd + 4)
        doc.setTextColor(0, 0, 0)
      }
    }

    y = (doc as unknown as Record<string, Record<string, number>>).lastAutoTable?.finalY ?? y
    y += 4

    // Overlap detail table (only if ≤50 total conflicts)
    if (totalOverlaps > 0 && totalOverlaps <= 50) {
      if (y > 240) { doc.addPage(); y = 20 }
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('Konfliktprotokoll (Überlappungen)', margin, y)
      y += 4

      const conflictRows = overlapSummaries.flatMap((os) =>
        os.conflicts.map((c) => {
          const nameA = fileMetadataList[c.keptFileIndex]?.name ?? `Datei ${c.keptFileIndex + 1}`
          const nameB = fileMetadataList[c.droppedFileIndex]?.name ?? `Datei ${c.droppedFileIndex + 1}`
          const ts = c.timestamp.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
          return [ts, nameA, nameB, nameA]
        })
      )

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Zeitstempel', 'Verwendet (Datei)', 'Verworfen (Datei)', 'Vorrang']],
        body: conflictRows,
        styles: { fontSize: 7, font: 'helvetica', cellPadding: 1.5 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 7 },
        alternateRowStyles: { fillColor: [239, 246, 255] },
      })

      y = (doc as unknown as Record<string, Record<string, number>>).lastAutoTable?.finalY ?? y
    } else if (totalOverlaps > 50) {
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      doc.text(
        `Vollständiges Konfliktprotokoll (${totalOverlaps} Einträge) auf Anfrage reproduzierbar via Git-Commit ${__GIT_COMMIT__}.`,
        margin, y
      )
      doc.setTextColor(0, 0, 0)
      y += 5
    }

    y += 4
  }

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
      ['Ersparnis Netzbezug', '—', (mTotals.netzbezug - mTotals.netzbezugSim).toFixed(2)],
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
