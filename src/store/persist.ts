/**
 * IndexedDB persistence for SolarProof.
 * Stores CSV texts + config locally in the browser.
 * Data never leaves the device.
 */

import type { ColumnMapping, FileMetadata, InputUnit, SimulationParams } from '../types'
import type { CostParams } from '../types/cost'

const DB_NAME = 'solarproof'
const DB_VERSION = 1
const STORE_NAME = 'state'
const KEY = 'app'

export interface PersistedState {
  csvTexts: string[]
  fileMetadataList: Array<Omit<FileMetadata, 'importTimestamp'> & { importTimestamp: string }>
  columnMapping: ColumnMapping
  inputIsUTC: boolean
  inputIsWh?: boolean
  inputUnit?: InputUnit
  simulationParams: SimulationParams
  costParams: CostParams
  costCapOverrides: Record<number, boolean>
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveState(state: PersistedState): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(state, KEY)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  } catch (e) {
    console.warn('Failed to save state to IndexedDB:', e)
  }
}

export async function loadState(): Promise<PersistedState | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(KEY)
      req.onsuccess = () => { db.close(); resolve(req.result ?? null) }
      req.onerror = () => { db.close(); reject(req.error) }
    })
  } catch (e) {
    console.warn('Failed to load state from IndexedDB:', e)
    return null
  }
}

export async function clearState(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(KEY)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  } catch (e) {
    console.warn('Failed to clear IndexedDB:', e)
  }
}
