import type { FileEntry } from '../../types'

interface BigFilesProps { data: FileEntry | null }

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function flattenFiles(entry: FileEntry): FileEntry[] {
  if (!entry.isDirectory) return [entry]
  return (entry.children ?? []).flatMap(flattenFiles)
}

export default function BigFiles({ data }: BigFilesProps) {
  if (!data) return null
  const files = flattenFiles(data).sort((a, b) => b.size - a.size).slice(0, 50)

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border-primary">
        <h3 className="text-sm font-medium text-text-primary">Top 50 Largest Files</h3>
      </div>
      <div className="overflow-y-auto max-h-96">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-text-muted border-b border-border-secondary">
              <th className="text-left px-4 py-2 font-medium">#</th>
              <th className="text-left px-4 py-2 font-medium">File</th>
              <th className="text-right px-4 py-2 font-medium">Size</th>
              <th className="text-right px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file, i) => (
              <tr key={file.path} className="border-b border-border-secondary hover:bg-bg-tertiary">
                <td className="px-4 py-1.5 text-text-muted">{i + 1}</td>
                <td className="px-4 py-1.5 text-text-primary truncate max-w-[400px]" title={file.path}>{file.name}</td>
                <td className="px-4 py-1.5 text-right text-status-yellow">{formatBytes(file.size)}</td>
                <td className="px-4 py-1.5 text-right">
                  <button onClick={() => window.api.revealFile(file.path)} className="text-status-blue hover:underline">Reveal</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
