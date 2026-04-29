import { useEffect } from 'react'
import { useFilesStore } from '../../stores/filesStore'
import FileSidebar from './FileSidebar'
import PathBar from './PathBar'

export default function FilesPage() {
  const navigate = useFilesStore((s) => s.navigate)

  useEffect(() => { navigate('~') }, [navigate])

  return (
    <div className="flex h-full -m-4">
      <FileSidebar />
      <div className="flex-1 flex flex-col">
        <PathBar />
        <div className="flex-1 text-text-muted font-mono text-sm p-4">
          (FileList in next task)
        </div>
      </div>
    </div>
  )
}
