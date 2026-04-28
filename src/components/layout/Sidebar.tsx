import { useTranslation } from '../../i18n/index'

type Page = 'dashboard' | 'memory' | 'disk' | 'network' | 'settings'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
}

const NAV_ICONS: Record<Page, string> = {
  dashboard: '⊞',
  memory: '☰',
  disk: '◉',
  network: '⇅',
  settings: '⚙',
}

const NAV_ORDER: Page[] = ['dashboard', 'memory', 'disk', 'network', 'settings']

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { t } = useTranslation()
  return (
    <aside className="w-48 h-full bg-bg-secondary border-r border-border-primary flex flex-col">
      <div className="p-4 border-b border-border-primary">
        <h1 className="text-lg font-bold text-text-primary font-mono">DashMac</h1>
      </div>
      <nav className="flex-1 py-2">
        {NAV_ORDER.map((id) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${
              activePage === id
                ? 'bg-bg-tertiary text-text-primary border-l-2 border-status-blue'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            <span className="font-mono text-base">{NAV_ICONS[id]}</span>
            {t(`sidebar.${id}`)}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-border-primary text-xs text-text-muted font-mono">
        v0.1.0
      </div>
    </aside>
  )
}
