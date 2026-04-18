/** Raw CSV row after column mapping */
export interface RawDataRow {
  datum: string
  uhrzeit: string
  erzeugung_kwh: number
  verbrauch_kwh: number
  einspeisung_kwh: number | null
  netzbezug_kwh: number | null
  sourceFileIndex: number
}

/**
 * Unit of the numeric values in the input CSV.
 * - 'kWh' / 'Wh': energy per interval (sum aggregation)
 * - 'kW' / 'W': instantaneous power (integration over interval duration required)
 */
export type InputUnit = 'kWh' | 'Wh' | 'kW' | 'W'

/** Single measurement interval with UTC timestamp */
export interface MeasurementInterval {
  timestamp: Date // UTC
  erzeugung_kwh: number
  verbrauch_kwh: number
  einspeisung_kwh: number
  netzbezug_kwh: number
  sourceFileIndex: number // index into fileMetadataList
}

/** Aggregated day data */
export interface DayData {
  date: string // YYYY-MM-DD
  intervals: MeasurementInterval[]
  totals: {
    erzeugung_kwh: number
    verbrauch_kwh: number
    einspeisung_kwh: number
    netzbezug_kwh: number
  }
}

/** Column mapping: internal field name → CSV column header */
export type ColumnMapping = Record<string, string>

/** Known CSV column synonyms per manufacturer */
export interface ManufacturerProfile {
  name: string
  synonyms: Record<string, string[]>
}

/** Simulation parameters */
export interface SimulationParams {
  kapazitaet_kwh: number
  entladetiefe_pct: number
  ladewirkungsgrad_pct: number
  entladewirkungsgrad_pct: number
  anfangs_soc_pct: number
}

/** Simulation result per interval */
export interface SimulationInterval {
  timestamp: Date
  soc_kwh: number
  geladen_kwh: number
  entladen_kwh: number
  netzbezug_sim_kwh: number
  einspeisung_sim_kwh: number
}

/** Simulation result per day */
export interface DaySimulation {
  date: string
  soc_start_kwh: number // SoC at beginning of this day (carried from previous day)
  intervals: SimulationInterval[]
  totals: {
    geladen_kwh: number
    entladen_kwh: number
    netzbezug_sim_kwh: number
    einspeisung_sim_kwh: number
    soc_min_kwh: number
    soc_max_kwh: number
  }
}

/** File metadata captured at upload (one per CSV file) */
export interface FileMetadata {
  name: string
  size: number
  sha256: string
  importTimestamp: Date
}

/** Combined metadata for all uploaded files */
export type FileMetadataList = FileMetadata[]

/** DST warning for display */
export interface DstWarning {
  date: string
  type: 'missing_hour' | 'double_hour'
  message: string
}

/** Data gap detected after merge */
export interface DataGap {
  type: 'missing_days' | 'missing_intervals' | 'overlap'
  from: string // ISO timestamp or YYYY-MM-DD
  to: string
  durationHours: number
  message: string
}

/** Detailed overlap conflict record */
export interface OverlapConflict {
  timestamp: Date
  keptFileIndex: number   // sourceFileIndex that was kept
  droppedFileIndex: number // sourceFileIndex that was discarded
}

/** Summary of overlaps between two files */
export interface OverlapSummary {
  fileIndexA: number
  fileIndexB: number
  count: number
  conflicts: OverlapConflict[] // all individual conflicts
}
