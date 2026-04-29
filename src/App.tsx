import { useState } from 'react'
import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'
import { useRealtimeData } from './hooks/useRealtimeData'
import { useTranslation } from './i18n/index'
import Overview from './components/dashboard/Overview'
import MemoryOverview from './components/memory/MemoryOverview'
import NetworkOverview from './components/network/NetworkOverview'
import FilesPage from './components/files/FilesPage'
import Settings from './components/settings/Settings'
import TrayPanel from './components/tray/TrayPanel'
import ToastRoot from './components/common/Toast'

type Page = 'dashboard' | 'memory' | 'network' | 'files' | 'settings'

export default function App() {
  const isTray = window.location.hash === '#/tray'

  return (
    <>
      {isTray ? <TrayApp /> : <MainApp />}
      <ToastRoot />
    </>
  )
}

function TrayApp() {
  useRealtimeData()
  return <TrayPanel />
}

function MainApp() {
  const [page, setPage] = useState<Page>('dashboard')
  const { t } = useTranslation()
  useRealtimeData()

  return (
    <div className="h-screen flex bg-bg-primary text-text-primary">
      <Sidebar activePage={page} onNavigate={setPage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={t(`pages.${page}`)} />
        <main className="flex-1 overflow-y-auto p-4">
          <PageContent page={page} onNavigate={setPage} />
        </main>
      </div>
    </div>
  )
}

function PageContent({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  switch (page) {
    case 'dashboard':
      return <Overview onNavigate={onNavigate} />
    case 'memory':
      return <MemoryOverview />
    case 'network':
      return <NetworkOverview />
    case 'files':
      return <FilesPage />
    case 'settings':
      return <Settings />
  }
}
