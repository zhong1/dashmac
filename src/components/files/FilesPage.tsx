import { useEffect } from 'react'
import { useFilesStore } from '../../stores/filesStore'
import FileSidebar from './FileSidebar'

export default function FilesPage() {
  const navigate = useFilesStore((s) => s.navigate)

  useEffect(() => {
    // Initial navigation to home on first mount
    navigate('~')
  }, [navigate])

  return (
    <div className="flex h-full -m-4">
      <FileSidebar />
      <div className="flex-1 flex flex-col">
        <div className="text-text-muted font-mono text-sm p-4">
          (PathBar + FileList in next tasks)
        </div>
      </div>
    </div>
  )
}
