interface HeaderProps {
  title: string
}

export default function Header({ title }: HeaderProps) {
  return (
    <header className="h-12 bg-bg-secondary border-b border-border-primary flex items-center px-4 app-drag">
      <div className="w-16" />
      <h2 className="text-sm font-medium text-text-primary">{title}</h2>
    </header>
  )
}
