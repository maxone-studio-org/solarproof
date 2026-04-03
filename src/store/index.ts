import { create } from 'zustand'
import type {
  ColumnMapping,
  DayData,
  DaySimulation,
  DstWarning,
  FileMetadata,
  SimulationParams,
} from '../types'
import { autoDetectMapping, parseCSVPreview, parseCSVWithMapping, validateMapping } from '../utils/csv'
import { processRawData } from '../utils/timezone'
import { runSimulation } from '../utils/simulation'
import { computeSHA256 } from '../utils/hash'

export type ImportStep = 'idle' | 'mapping' | 'done'

interface AppState {
  // CSV / Import
  importStep: ImportStep
  csvText: string | null
  csvHeaders: string[]
  csvPreview: string[][]
  columnMapping: ColumnMapping
  fileMetadataList: FileMetadata[]

  // Processed data
  days: DayData[]
  importErrors: { line: number; message: string }[]
  dstWarnings: DstWarning[]

  // Simulation
  simulationParams: SimulationParams
  simulationResults: DaySimulation[]

  // UI
  selectedMonth: string | null // YYYY-MM
  selectedDay: string | null // YYYY-MM-DD
  inputIsUTC: boolean

  // Actions
  loadFiles: (files: File[]) => Promise<void>
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
  csvText: null,
  csvHeaders: [],
  csvPreview: [],
  columnMapping: {},
  fileMetadataList: [],
  days: [],
  importErrors: [],
  dstWarnings: [],
  simulationParams: {
    kapazitaet_kwh: 10,
    entladetiefe_pct: 90,
    ladewirkungsgrad_pct: 95,
    entladewirkungsgrad_pct: 95,
    anfangs_soc_pct: 0,
  },
  simulationResults: [],
  selectedMonth: null,
  selectedDay: null,
  inputIsUTC: false,

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

    set({
      csvText: mergedText,
      csvHeaders: headers,
      csvPreview: preview,
      columnMapping: mapping,
      importStep: 'mapping',
      fileMetadataList: metadataList,
      // Reset previous data
      days: [],
      importErrors: [],
      dstWarnings: [],
      simulationResults: [],
      selectedMonth: null,
      selectedDay: null,
    })
  },

  setMapping: (field, csvColumn) => {
    set((s) => ({
      columnMapping: { ...s.columnMapping, [field]: csvColumn },
    }))
  },

  confirmMapping: () => {
    const { csvText, columnMapping, inputIsUTC, simulationParams } = get()
    if (!csvText) return

    const errors = validateMapping(columnMapping)
    if (errors.length > 0) {
      set({ importErrors: errors.map((e) => ({ line: 0, message: e })) })
      return
    }

    const { rows, errors: parseErrors } = parseCSVWithMapping(csvText, columnMapping)
    const { days, warnings } = processRawData(rows, inputIsUTC)

    // Auto-select first month
    const firstMonth = days.length > 0 ? days[0].date.substring(0, 7) : null

    // Run simulation
    const simulationResults = runSimulation(days, simulationParams)

    set({
      days,
      importErrors: parseErrors,
      dstWarnings: warnings,
      importStep: 'done',
      selectedMonth: firstMonth,
      simulationResults,
    })
  },

  resetImport: () => {
    set({
      importStep: 'idle',
      csvText: null,
      csvHeaders: [],
      csvPreview: [],
      columnMapping: {},
      fileMetadataList: [],
      days: [],
      importErrors: [],
      dstWarnings: [],
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
}))
