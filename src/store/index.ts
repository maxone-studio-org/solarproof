import { create } from 'zustand'
import type {
  ColumnMapping,
  DataGap,
  DayData,
  DaySimulation,
  DstWarning,
  FileMetadata,
  OverlapSummary,
  SimulationParams,
} from '../types'
import type { CostParams } from '../types/cost'
import { autoDetectMapping, parseCSVPreview, parseCSVWithMapping, validateMapping } from '../utils/csv'
import { processRawData } from '../utils/timezone'
import { runSimulation } from '../utils/simulation'
import { computeSHA256 } from '../utils/hash'
import { detectDataGaps, deduplicateIntervals } from '../utils/gapDetection'

export type ImportStep = 'idle' | 'mapping' | 'done'

interface AppState {
  // CSV / Import
  importStep: ImportStep
  csvTexts: string[] // one per file, for per-file parsing with sourceFileIndex
  csvText: string | null // merged text for preview
  csvHeaders: string[]
  csvPreview: string[][]
  columnMapping: ColumnMapping
  fileMetadataList: FileMetadata[]

  // Processed data
  days: DayData[]
  importErrors: { line: number; message: string }[]
  dstWarnings: DstWarning[]
  dataGaps: DataGap[]
  overlapSummaries: OverlapSummary[]

  // Simulation
  simulationParams: SimulationParams
  simulationResults: DaySimulation[]

  // Duplicate detection
  pendingFiles: { texts: string[]; metadata: FileMetadata[] } | null
  duplicateInfo: { duplicateCount: number; totalCount: number; isFullDuplicate: boolean; fileName: string } | null

  // Cost comparison
  costParams: CostParams
  costCapOverrides: Record<number, boolean>

  // UI
  selectedMonth: string | null // YYYY-MM
  selectedDay: string | null // YYYY-MM-DD
  inputIsUTC: boolean
  showCredits: boolean

  // Actions
  loadFiles: (files: File[]) => Promise<void>
  confirmDuplicate: (mode: 'new_only' | 'replace') => void
  cancelDuplicate: () => void
  setCostParam: <K extends keyof CostParams>(key: K, value: CostParams[K]) => void
  setCostCapOverride: (year: number, active: boolean) => void
  setMapping: (field: string, csvColumn: string) => void
  confirmMapping: () => void
  resetImport: () => void
  setSimulationParam: <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => void
  setSelectedMonth: (month: string) => void
  setSelectedDay: (day: string | null) => void
  setInputIsUTC: (isUTC: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  importStep: 'idle',
  csvTexts: [],
  csvText: null,
  csvHeaders: [],
  csvPreview: [],
  columnMapping: {},
  fileMetadataList: [],
  days: [],
  importErrors: [],
  dstWarnings: [],
  dataGaps: [],
  overlapSummaries: [],
  simulationParams: {
    kapazitaet_kwh: 10,
    entladetiefe_pct: 90,
    ladewirkungsgrad_pct: 95,
    entladewirkungsgrad_pct: 95,
    anfangs_soc_pct: 0,
  },
  simulationResults: [],
  costParams: {
    kreditrate_eur_monat: 0,
    nachzahlung_eur_jahr: 0,
    rueckerstattung_eur_jahr: 0,
    wartung_eur_jahr: 0,
    cloud_eur_monat: 0,
    einspeiseverguetung_ct_kwh: 8.2,
  },
  costCapOverrides: {},
  pendingFiles: null,
  duplicateInfo: null,
  selectedMonth: null,
  selectedDay: null,
  inputIsUTC: false,
  showCredits: false,

  loadFiles: async (files: File[]) => {
    // Process all files in parallel
    const fileResults = await Promise.all(
      files.map(async (file) => {
        const [text, arrayBuffer] = await Promise.all([
          file.text(),
          file.arrayBuffer(),
        ])
        const sha256 = await computeSHA256(arrayBuffer)
        return { text, file, sha256 }
      })
    )

    // Merge CSV texts: use header from first file, skip headers in subsequent files
    const texts = fileResults.map((r) => r.text)
    let mergedText: string

    if (texts.length === 1) {
      mergedText = texts[0]
    } else {
      const lines0 = texts[0].split('\n')
      const header = lines0[0]
      const dataLines = [
        ...lines0.slice(1),
        ...texts.slice(1).flatMap((t) => {
          const lines = t.split('\n')
          return lines.slice(1) // skip header
        }),
      ].filter((line) => line.trim().length > 0)
      mergedText = [header, ...dataLines].join('\n')
    }

    const { headers, preview } = parseCSVPreview(mergedText)
    const mapping = autoDetectMapping(headers)

    const metadataList: FileMetadata[] = fileResults.map((r) => ({
      name: r.file.name,
      size: r.file.size,
      sha256: r.sha256,
      importTimestamp: new Date(),
    }))

    // Check for duplicates against existing data
    const existingFiles = get().fileMetadataList
    if (existingFiles.length > 0) {
      // Compare SHA-256 hashes to detect full duplicates
      const existingHashes = new Set(existingFiles.map((f) => f.sha256))
      const newFile = metadataList[metadataList.length - 1]
      const isFullDuplicate = metadataList.every((m) => existingHashes.has(m.sha256))

      if (isFullDuplicate) {
        set({
          pendingFiles: { texts: fileResults.map((r) => r.text), metadata: metadataList },
          duplicateInfo: {
            duplicateCount: metadataList.reduce((s, m) => s + (existingHashes.has(m.sha256) ? 1 : 0), 0),
            totalCount: metadataList.length,
            isFullDuplicate: true,
            fileName: newFile.name,
          },
        })
        return
      }

      const hasSomeDuplicates = metadataList.some((m) => existingHashes.has(m.sha256))
      if (hasSomeDuplicates) {
        set({
          pendingFiles: { texts: fileResults.map((r) => r.text), metadata: metadataList },
          duplicateInfo: {
            duplicateCount: metadataList.filter((m) => existingHashes.has(m.sha256)).length,
            totalCount: metadataList.length,
            isFullDuplicate: false,
            fileName: metadataList.map((m) => m.name).join(', '),
          },
        })
        return
      }
    }

    set({
      csvTexts: fileResults.map((r) => r.text),
      csvText: mergedText,
      csvHeaders: headers,
      csvPreview: preview,
      columnMapping: mapping,
      importStep: 'mapping',
      fileMetadataList: metadataList,
      pendingFiles: null,
      duplicateInfo: null,
      days: [],
      importErrors: [],
      dstWarnings: [],
      dataGaps: [],
      overlapSummaries: [],
      simulationResults: [],
      selectedMonth: null,
      selectedDay: null,
    })
  },

  confirmDuplicate: (mode) => {
    const { pendingFiles } = get()
    if (!pendingFiles) return

    if (mode === 'replace') {
      // Replace all — use pending files as the new dataset
      const texts = pendingFiles.texts
      let mergedText: string
      if (texts.length === 1) {
        mergedText = texts[0]
      } else {
        const lines0 = texts[0].split('\n')
        const header = lines0[0]
        const dataLines = [
          ...lines0.slice(1),
          ...texts.slice(1).flatMap((t) => t.split('\n').slice(1)),
        ].filter((l) => l.trim().length > 0)
        mergedText = [header, ...dataLines].join('\n')
      }
      const { headers, preview } = parseCSVPreview(mergedText)
      const mapping = autoDetectMapping(headers)
      set({
        csvTexts: texts,
        csvText: mergedText,
        csvHeaders: headers,
        csvPreview: preview,
        columnMapping: mapping,
        importStep: 'mapping',
        fileMetadataList: pendingFiles.metadata,
        pendingFiles: null,
        duplicateInfo: null,
        days: [], importErrors: [], dstWarnings: [], dataGaps: [], overlapSummaries: [],
        simulationResults: [], selectedMonth: null, selectedDay: null,
      })
    } else {
      // Import only new (non-duplicate) files
      const existingHashes = new Set(get().fileMetadataList.map((f) => f.sha256))
      const newTexts = pendingFiles.texts.filter((_, i) => !existingHashes.has(pendingFiles.metadata[i].sha256))
      const newMeta = pendingFiles.metadata.filter((m) => !existingHashes.has(m.sha256))

      if (newTexts.length === 0) {
        set({ pendingFiles: null, duplicateInfo: null })
        return
      }

      // Merge with existing
      const allTexts = [...get().csvTexts, ...newTexts]
      const allMeta = [...get().fileMetadataList, ...newMeta]
      const lines0 = allTexts[0].split('\n')
      const header = lines0[0]
      const dataLines = [
        ...lines0.slice(1),
        ...allTexts.slice(1).flatMap((t) => t.split('\n').slice(1)),
      ].filter((l) => l.trim().length > 0)
      const mergedText = [header, ...dataLines].join('\n')
      const { headers, preview } = parseCSVPreview(mergedText)
      const mapping = autoDetectMapping(headers)

      set({
        csvTexts: allTexts,
        csvText: mergedText,
        csvHeaders: headers,
        csvPreview: preview,
        columnMapping: mapping,
        importStep: 'mapping',
        fileMetadataList: allMeta,
        pendingFiles: null,
        duplicateInfo: null,
        days: [], importErrors: [], dstWarnings: [], dataGaps: [], overlapSummaries: [],
        simulationResults: [], selectedMonth: null, selectedDay: null,
      })
    }
  },

  cancelDuplicate: () => {
    set({ pendingFiles: null, duplicateInfo: null })
  },

  setMapping: (field, csvColumn) => {
    set((s) => ({
      columnMapping: { ...s.columnMapping, [field]: csvColumn },
    }))
  },

  confirmMapping: () => {
    const { csvTexts, columnMapping, inputIsUTC, simulationParams } = get()
    if (csvTexts.length === 0) return

    const errors = validateMapping(columnMapping)
    if (errors.length > 0) {
      set({ importErrors: errors.map((e) => ({ line: 0, message: e })) })
      return
    }

    // Parse each file separately to tag with sourceFileIndex
    const allRows: import('../types').RawDataRow[] = []
    const allParseErrors: { line: number; message: string }[] = []

    for (let fileIdx = 0; fileIdx < csvTexts.length; fileIdx++) {
      const { rows, errors: parseErrors } = parseCSVWithMapping(csvTexts[fileIdx], columnMapping)
      for (const row of rows) {
        row.sourceFileIndex = fileIdx
      }
      allRows.push(...rows)
      allParseErrors.push(...parseErrors.map((e) => ({
        ...e,
        message: csvTexts.length > 1 ? `Datei ${fileIdx + 1}, ${e.message}` : e.message,
      })))
    }

    const { days: rawDays, warnings } = processRawData(allRows, inputIsUTC)

    // Deduplicate overlapping intervals (first file wins, detailed tracking)
    const { days, overlapSummaries } = deduplicateIntervals(rawDays)

    // Detect data gaps (missing days, missing intervals)
    const dataGaps = detectDataGaps(days)

    // Auto-select first month
    const firstMonth = days.length > 0 ? days[0].date.substring(0, 7) : null

    // Run simulation
    const simulationResults = runSimulation(days, simulationParams)

    set({
      days,
      importErrors: allParseErrors,
      dstWarnings: warnings,
      dataGaps,
      overlapSummaries,
      importStep: 'done',
      selectedMonth: firstMonth,
      simulationResults,
    })
  },

  resetImport: () => {
    set({
      importStep: 'idle',
      csvTexts: [],
      csvText: null,
      csvHeaders: [],
      csvPreview: [],
      columnMapping: {},
      fileMetadataList: [],
      pendingFiles: null,
      duplicateInfo: null,
      days: [],
      importErrors: [],
      dstWarnings: [],
      dataGaps: [],
      overlapSummaries: [],
      simulationResults: [],
      selectedMonth: null,
      selectedDay: null,
    })
  },

  setSimulationParam: (key, value) => {
    const state = get()
    const newParams = { ...state.simulationParams, [key]: value }
    const simulationResults = state.days.length > 0
      ? runSimulation(state.days, newParams)
      : []
    set({ simulationParams: newParams, simulationResults })
  },

  setSelectedMonth: (month) => set({ selectedMonth: month, selectedDay: null }),
  setSelectedDay: (day) => set({ selectedDay: day }),
  setInputIsUTC: (isUTC) => set({ inputIsUTC: isUTC }),

  setCostParam: (key, value) => {
    set((s) => ({ costParams: { ...s.costParams, [key]: value } }))
  },
  setCostCapOverride: (year, active) => {
    set((s) => ({ costCapOverrides: { ...s.costCapOverrides, [year]: active } }))
  },
}))
