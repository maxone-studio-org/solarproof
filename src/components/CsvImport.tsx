import { useCallback, useRef, useState } from 'react'
import { useAppStore } from '../store'

export function CsvImport() {
  const loadFiles = useAppStore((s) => s.loadFiles)
  const importStep = useAppStore((s) => s.importStep)
  const resetImport = useAppStore((s) => s.resetImport)
  const fileCount = useAppStore((s) => s.fileMetadataList.length)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      const csvFiles = Array.from(fileList).filter((f) => f.name.endsWith('.csv'))
      if (csvFiles.length === 0) {
        alert('Bitte mindestens eine CSV-Datei auswählen.')
        return
      }
      await loadFiles(csvFiles)
    },
    [loadFiles]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
    },
    [handleFiles]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const onDragLeave = useCallback(() => setDragActive(false), [])

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files)
    },
    [handleFiles]
  )

  if (importStep !== 'idle') {
    return (
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm text-gray-600">
          {importStep === 'mapping'
            ? `Spalten-Mapping konfigurieren (${fileCount} ${fileCount === 1 ? 'Datei' : 'Dateien'})...`
            : `Daten geladen (${fileCount} ${fileCount === 1 ? 'Datei' : 'Dateien'})`}
        </span>
        <button
          onClick={resetImport}
          className="text-sm text-red-600 hover:text-red-700 font-medium"
        >
          Neue Dateien laden
        </button>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragActive
            ? 'border-amber-400 bg-amber-50'
            : 'border-gray-300 hover:border-gray-400 bg-white'
        }`}
      >
        <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-lg font-medium text-gray-700 mb-1">
          CSV-Dateien hierher ziehen
        </p>
        <p className="text-sm text-gray-500">
          oder klicken zum Auswählen — mehrere Dateien möglich
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          multiple
          onChange={onFileSelect}
          className="hidden"
        />
      </div>
    </div>
  )
}
