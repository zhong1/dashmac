import { useEffect } from 'react'
import { useFilesStore } from '../../stores/filesStore'
import FileSidebar from './FileSidebar'
import PathBar from './PathBar'
import FileList from './FileList'

export default function FilesPage() {
  const navigate = useFilesStore((s) => s.navigate)

  useEffect(() => { navigate('~') }, [navigate])

  return (
    <div className="flex h-full -m-4">
      <FileSidebar />
      <div className="flex-1 flex flex-col">
        <PathBar />
        <FileList
          onContextRow={(e, _entry) => { e.preventDefault() /* Task 18 */ }}
          onContextEmpty={(e) => { e.preventDefault() /* Task 18 */ }}
        />
      </div>
    </div>
  )
}
