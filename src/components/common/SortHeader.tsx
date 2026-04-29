export interface SortState<T extends string> {
  column: T
  dir: 'asc' | 'desc'
}

interface Props<T extends string> {
  col: T
  sort: SortState<T>
  onClick: (c: T) => void
  label: string
  align?: 'left' | 'right'
}

export default function SortHeader<T extends string>({
  col, sort, onClick, label, align = 'left',
}: Props<T>) {
  const indicator = sort.column === col ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''
  return (
    <th
      onClick={() => onClick(col)}
      className={`px-3 py-2 cursor-pointer select-none font-medium text-${align}`}
    >
      {label}{indicator}
    </th>
  )
}
