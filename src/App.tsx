import { useState } from 'react'
import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'
import { useRealtimeData } from './hooks/useRealtimeData'
import Overview from './components/dashboard/Overview'
import MemoryOverview from './components/memory/MemoryOverview'
import DiskOverview from './components/disk/DiskOverview'
import NetworkOverview from './components/network/NetworkOverview'
import Settings from './components/settings/Settings'
import TrayPanel from './components/tray/TrayPanel'

type Page = 'dashboard' | 'memory' | 'disk' | 'network' | 'settings'

const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Dashboard',
  memory: 'Memory Analysis',
  disk: 'Disk Analysis',
  network: 'Network Analysis',
  settings: 'Settings',
}

export default function App() {
  const isTray = window.location.hash === '#/tray'

  if (isTray) {
    return <TrayApp />
  }

  return <MainApp />
}

function TrayApp() {
  useRealtimeData()
  return <TrayPanel />
}

function MainApp() {
  const [page, setPage] = useState<Page>('dashboard')
  useRealtimeData()

  return (
    <div className="h-screen flex bg-bg-primary text-text-primary">
      <Sidebar activePage={page} onNavigate={setPage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={PAGE_TITLES[page]} />
        <main className="flex-1 overflow-y-auto p-4">
          <PageContent page={page} />
        </main>
      </div>
    </div>
  )
}

function PageContent({ page }: { page: Page }) {
  switch (page) {
    case 'dashboard':
      return <Overview />
    case 'memory':
      return <MemoryOverview />
    case 'disk':
      return <DiskOverview />
    case 'network':
      return <NetworkOverview />
    case 'settings':
      return <Settings />
  }
}
