import { useState } from 'react'
import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'
import { useRealtimeData } from './hooks/useRealtimeData'

type Page = 'dashboard' | 'memory' | 'disk' | 'network' | 'settings'

const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Dashboard',
  memory: 'Memory Analysis',
  disk: 'Disk Analysis',
  network: 'Network Analysis',
  settings: 'Settings',
}

export default function App() {
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
      return <PlaceholderPage name="Dashboard" />
    case 'memory':
      return <PlaceholderPage name="Memory Analysis" />
    case 'disk':
      return <PlaceholderPage name="Disk Analysis" />
    case 'network':
      return <PlaceholderPage name="Network Analysis" />
    case 'settings':
      return <PlaceholderPage name="Settings" />
  }
}

function PlaceholderPage({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full text-text-muted font-mono">
      {name} — coming soon
    </div>
  )
}
