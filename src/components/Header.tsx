import { useAppStore } from '../store'

export function Header() {
  const fileMetadataList = useAppStore((s) => s.fileMetadataList)
  const importStep = useAppStore((s) => s.importStep)

  const fileCount = fileMetadataList.length
  const firstFile = fileMetadataList[0]

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">PV-Analyse-Pro</h1>
          <p className="text-xs text-gray-500">v{__APP_VERSION__}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {firstFile && importStep === 'done' && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="font-mono truncate max-w-48" title={firstFile.sha256}>
              SHA-256: {firstFile.sha256.substring(0, 16)}...
            </span>
            {fileCount > 1 && (
              <span className="text-gray-400">+{fileCount - 1}</span>
            )}
          </div>
        )}
        {fileCount > 0 && (
          <span className="text-sm text-gray-600">
            {fileCount === 1 ? firstFile.name : `${fileCount} Dateien`}
          </span>
        )}
      </div>
    </header>
  )
}
