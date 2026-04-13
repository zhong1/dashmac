import { useState, useEffect, useCallback } from 'react'
import type { HistoryQuery, HistoryPoint } from '../types'

export function useHistoryQuery(query: HistoryQuery | null) {
  const [data, setData] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!query) return
    setLoading(true)
    try {
      const result = await window.api.queryHistory(query)
      setData(result)
    } catch (err) {
      console.error('History query failed:', err)
    } finally {
      setLoading(false)
    }
  }, [query?.type, query?.range])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, refetch: fetch }
}
