import { useEffect, useState } from 'react'
import { searchCards } from '../api.js'

export const EMPTY = { q: '', type: '', attribute: '', race: '', level: '' }

export default function useSearch(filters, page, num) {
  const [state, setState] = useState({ cards: [], total: 0, loading: true, error: '' })
  const key = JSON.stringify(filters)
  useEffect(() => {
    const ctrl = new AbortController()
    setState((s) => ({ ...s, loading: true, error: '' }))
    const t = setTimeout(() => {
      searchCards({ ...filters, page, num }, ctrl.signal)
        .then((r) => setState({ ...r, loading: false, error: '' }))
        .catch((e) => e.name !== 'AbortError' && setState({ cards: [], total: 0, loading: false, error: e.message }))
    }, 300)
    return () => { clearTimeout(t); ctrl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, num])
  return state
}
