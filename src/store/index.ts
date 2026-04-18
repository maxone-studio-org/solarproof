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
import { autoDetectMapping, parseCSVPreview, parseCSVWithMapping, validateMapping, detectInputUnit, detectImplausibleValues } from '../utils/csv'
import type { InputUnit } from '../types'
import { processRawData } from '../utils/timezone'
import { runSimulation } from '../utils/simulation'
import { computeSHA256 } from '../utils/hash'
import { detectDataGaps, deduplicateIntervals } from '../utils/gapDetection'
import { saveState, loadState, clearState, type PersistedState } from './persist'

/** Yield to browser for a frame so UI can update (loading indicators, etc.) */
const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Merge multiple CSV texts: use header from first file, skip headers in rest */
function mergeCSVTexts(texts: string[]): string {
  if (texts.length === 1) return texts[0]
  const lines0 = texts[0].split('\n')
  const header = lines0[0]
  const dataLines = [
    ...lines0.slice(1),
    ...texts.slice(1).flatMap((t) => t.split('\n').slice(1)),
  ].filter((l) => l.trim().length > 0)
  return [header, ...dataLines].join('\n')
}

export type ImportStep = 'idle' | 'mapping' | 'processing' | 'done'

/**
 * Re-parse all CSV data with the current inputUnit / inputIsUTC settings
 * and re-run the full pipeline (parse → processRawData → dedup → simulate).
 * Used by setInputIsUTC, setInputIsWh, setInputUnit when the user toggles.
 */
function reparseAndRerun(
  getState: () => AppState,
  setState: (partial: Partial<AppState>) => void,
): void {
  const { csvTexts, columnMapping, inputIsUTC, inputUnit, simulationParams, importStep } = getState()
  if (importStep !== 'done' || csvTexts.length === 0) return

  const isPower = inputUnit === 'kW' || inputUnit === 'W'
  const allRows: import('../types').RawDataRow[] = []
  for (let fileIdx = 0; fileIdx < csvTexts.length; fileIdx++) {
    const { rows } = parseCSVWithMapping(csvTexts[fileIdx], columnMapping, inputUnit)
    for (const row of rows) row.sourceFileIndex = fileIdx
    allRows.push(...rows)
  }

  const { days: rawDays, warnings } = processRawData(allRows, inputIsUTC, isPower)
  const { days, overlapSummaries } = deduplicateIntervals(rawDays)
  const dataGaps = detectDataGaps(days)
  const firstMonth = days.length > 0 ? days[0].date.substring(0, 7) : null
  const simulationResults = runSimulation(days, simulationParams)

  setState({
    days,
    dstWarnings: warnings,
    dataGaps,
    overlapSummaries,
    selectedMonth: firstMonth,
    simulationResults,
  })
  persistCurrentState(getState())
}

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
  inputIsWh: boolean // true if CSV values are in Wh instead of kWh (legacy, derived from inputUnit)
  inputUnit: InputUnit // 'kWh' | 'Wh' | 'kW' | 'W' — authoritative source of truth
  unitAutoDetected: boolean // true if unit was auto-detected from headers (for info display)
  whAutoDetected: boolean // legacy alias for unitAutoDetected
  showCredits: boolean
  rehydrating: boolean // true while restoring from IndexedDB
  persistError: string | null

  // Actions
  rehydrate: () => Promise<void>
  loadFiles: (files: File[]) => Promise<void>
  confirmDuplicate: (mode: 'new_only' | 'replace') => void
  cancelDuplicate: () => void
  setCostParam: <K extends keyof CostParams>(key: K, value: CostParams[K]) => void
  setCostNachzahlungYear: (year: number, value: number) => void
  setCostCloudMonth: (month: string, value: number) => void
  setCostCapOverride: (year: number, active: boolean) => void
  setMapping: (field: string, csvColumn: string) => void
  confirmMapping: () => void
  resetImport: () => void
  setSimulationParam: <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => void
  setSelectedMonth: (month: string) => void
  setSelectedDay: (day: string | null) => void
  setInputIsUTC: (isUTC: boolean) => void
  setInputIsWh: (isWh: boolean) => void
  setInputUnit: (unit: InputUnit) => void
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
    nachzahlung_pro_jahr: {},
    rueckerstattung_eur_jahr: 0,
    wartung_eur_jahr: 0,
    cloud_eur_monat: 0,
    cloud_pro_monat: {},
    einspeiseverguetung_ct_kwh: 8.2,
  },
  costCapOverrides: {},
  pendingFiles: null,
  duplicateInfo: null,
  selectedMonth: null,
  selectedDay: null,
  inputIsUTC: false,
  inputIsWh: false,
  inputUnit: 'kWh' as InputUnit,
  unitAutoDetected: false,
  whAutoDetected: false,
  showCredits: false,
  rehydrating: false,
  persistError: null,

  rehydrate: async () => {
    const persisted = await loadState()
    if (!persisted || persisted.csvTexts.length === 0) return

    set({ rehydrating: true })
    await yieldToUI() // Let the loading indicator render

    // Restore config
    const fileMetadataList: FileMetadata[] = persisted.fileMetadataList.map((f) => ({
      ...f,
      importTimestamp: new Date(f.importTimestamp),
    }))

    // Merge CSV texts for preview
    const texts = persisted.csvTexts
    const mergedText = mergeCSVTexts(texts)
    const { headers, preview } = parseCSVPreview(mergedText)

    set({
      csvTexts: texts,
      csvText: mergedText,
      csvHeaders: headers,
      csvPreview: preview,
      columnMapping: persisted.columnMapping,
      fileMetadataList,
      inputIsUTC: persisted.inputIsUTC,
      inputIsWh: persisted.inputIsWh ?? false,
      inputUnit: (persisted as { inputUnit?: InputUnit }).inputUnit ?? (persisted.inputIsWh ? 'Wh' : 'kWh'),
      simulationParams: persisted.simulationParams,
      costParams: persisted.costParams,
      costCapOverrides: persisted.costCapOverrides,
    })

    // Re-process data (parse, deduplicate, simulate)
    const { csvTexts, columnMapping, inputIsUTC, inputUnit, simulationParams } = get()
    const isPower = inputUnit === 'kW' || inputUnit === 'W'
    const allRows: import('../types').RawDataRow[] = []
    for (let fileIdx = 0; fileIdx < csvTexts.length; fileIdx++) {
      const { rows } = parseCSVWithMapping(csvTexts[fileIdx], columnMapping, inputUnit)
      for (const row of rows) row.sourceFileIndex = fileIdx
      allRows.push(...rows)
    }

    const { days: rawDays, warnings } = processRawData(allRows, inputIsUTC, isPower)
    const { days, overlapSummaries } = deduplicateIntervals(rawDays)
    const dataGaps = detectDataGaps(days)
    const firstMonth = days.length > 0 ? days[0].date.substring(0, 7) : null
    const simulationResults = runSimulation(days, simulationParams)

    set({
      days,
      dstWarnings: warnings,
      dataGaps,
      overlapSummaries,
      importStep: 'done',
      selectedMonth: firstMonth,
      simulationResults,
      rehydrating: false,
    })
  },

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

    const texts = fileResults.map((r) => r.text)
    const mergedText = mergeCSVTexts(texts)
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

    // Auto-detect unit from column headers: kWh / Wh / kW / W
    const unitFromHeaders = detectInputUnit(mapping)
    // Quick parse (as kWh / no conversion) to check value magnitude for Wh fallback
    const quickParse = parseCSVWithMapping(mergedText, mapping, 'kWh')
    const implausibleWh = detectImplausibleValues(quickParse.rows)
    // If header is ambiguous (default kWh) but values are huge, fall back to Wh
    const detectedUnit: InputUnit =
      unitFromHeaders !== 'kWh' ? unitFromHeaders :
      implausibleWh ? 'Wh' : 'kWh'
    const isPowerDetected = detectedUnit === 'kW' || detectedUnit === 'W'
    const unitWasAutoDetected = detectedUnit !== 'kWh' || isPowerDetected

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
      inputUnit: detectedUnit,
      inputIsWh: detectedUnit === 'Wh',
      unitAutoDetected: unitWasAutoDetected,
      whAutoDetected: unitWasAutoDetected,
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
      const mergedText = mergeCSVTexts(texts)
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
      const mergedText = mergeCSVTexts(allTexts)
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

  confirmMapping: async () => {
    const { csvTexts, columnMapping, inputIsUTC, inputUnit, simulationParams } = get()
    if (csvTexts.length === 0) return

    const errors = validateMapping(columnMapping)
    if (errors.length > 0) {
      set({ importErrors: errors.map((e) => ({ line: 0, message: e })) })
      return
    }

    // Show processing state and yield so UI can update
    set({ importStep: 'processing' })
    await yieldToUI()

    const isPower = inputUnit === 'kW' || inputUnit === 'W'

    // Parse each file separately to tag with sourceFileIndex
    const allRows: import('../types').RawDataRow[] = []
    const allParseErrors: { line: number; message: string }[] = []

    for (let fileIdx = 0; fileIdx < csvTexts.length; fileIdx++) {
      const { rows, errors: parseErrors } = parseCSVWithMapping(csvTexts[fileIdx], columnMapping, inputUnit)
      for (const row of rows) {
        row.sourceFileIndex = fileIdx
      }
      allRows.push(...rows)
      allParseErrors.push(...parseErrors.map((e) => ({
        ...e,
        message: csvTexts.length > 1 ? `Datei ${fileIdx + 1}, ${e.message}` : e.message,
      })))
    }

    const { days: rawDays, warnings } = processRawData(allRows, inputIsUTC, isPower)

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

    // Persist to IndexedDB
    const s = get()
    persistCurrentState(s)
  },

  resetImport: () => {
    clearState()
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
    if (state.importStep === 'done') persistCurrentState(get())
  },

  setSelectedMonth: (month) => set({ selectedMonth: month, selectedDay: null }),
  setSelectedDay: (day) => set({ selectedDay: day }),
  setInputIsUTC: (isUTC) => {
    set({ inputIsUTC: isUTC })
    reparseAndRerun(get, set)
  },
  setInputIsWh: (isWh) => {
    // Legacy setter — forward to setInputUnit with the equivalent InputUnit value
    set({ inputIsWh: isWh, inputUnit: isWh ? 'Wh' : 'kWh' })
    reparseAndRerun(get, set)
  },
  setInputUnit: (unit) => {
    set({ inputUnit: unit, inputIsWh: unit === 'Wh' })
    reparseAndRerun(get, set)
  },

  setCostParam: (key, value) => {
    set((s) => ({ costParams: { ...s.costParams, [key]: value } }))
    if (get().importStep === 'done') persistCurrentState(get())
  },
  setCostNachzahlungYear: (year, value) => {
    set((s) => ({
      costParams: {
        ...s.costParams,
        nachzahlung_pro_jahr: { ...s.costParams.nachzahlung_pro_jahr, [year]: value },
      },
    }))
    if (get().importStep === 'done') persistCurrentState(get())
  },
  setCostCloudMonth: (month, value) => {
    set((s) => ({
      costParams: {
        ...s.costParams,
        cloud_pro_monat: { ...s.costParams.cloud_pro_monat, [month]: value },
      },
    }))
    if (get().importStep === 'done') persistCurrentState(get())
  },
  setCostCapOverride: (year, active) => {
    set((s) => ({ costCapOverrides: { ...s.costCapOverrides, [year]: active } }))
    if (get().importStep === 'done') persistCurrentState(get())
  },
}))

/** Save current inputs to IndexedDB (async, shows error on failure) */
function persistCurrentState(s: AppState) {
  const persisted: PersistedState = {
    csvTexts: s.csvTexts,
    fileMetadataList: s.fileMetadataList.map((f) => ({
      ...f,
      importTimestamp: f.importTimestamp.toISOString(),
    })),
    columnMapping: s.columnMapping,
    inputIsUTC: s.inputIsUTC,
    inputIsWh: s.inputIsWh,
    inputUnit: s.inputUnit,
    simulationParams: s.simulationParams,
    costParams: s.costParams,
    costCapOverrides: s.costCapOverrides,
  }
  saveState(persisted).catch(() => {
    useAppStore.setState({ persistError: 'Daten konnten nicht lokal gespeichert werden. Beim Neuladen gehen sie verloren.' })
  })
}
