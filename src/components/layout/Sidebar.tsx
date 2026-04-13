type Page = 'dashboard' | 'memory' | 'disk' | 'network' | 'settings'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
}

const navItems: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { id: 'memory', label: 'Memory', icon: '☰' },
  { id: 'disk', label: 'Disk', icon: '◉' },
  { id: 'network', label: 'Network', icon: '⇅' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-48 h-full bg-bg-secondary border-r border-border-primary flex flex-col">
      <div className="p-4 border-b border-border-primary">
        <h1 className="text-lg font-bold text-text-primary font-mono">DashMac</h1>
      </div>
      <nav className="flex-1 py-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${
              activePage === item.id
                ? 'bg-bg-tertiary text-text-primary border-l-2 border-status-blue'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            <span className="font-mono text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-border-primary text-xs text-text-muted font-mono">
        v0.1.0
      </div>
    </aside>
  )
}
