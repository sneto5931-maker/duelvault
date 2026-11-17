import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Filters from '../components/Filters.jsx'
import CardTile from '../components/CardTile.jsx'
import useSearch, { EMPTY } from '../components/useSearch.js'
import { PAGE_SIZE } from '../api.js'
import { useDeck } from '../deck.jsx'

export default function Cards({ openCard, notify }) {
  const [params] = useSearchParams()
  const [f, setF] = useState({ ...EMPTY, q: params.get('q') || '' })
  const [page, setPage] = useState(0)
  const { add } = useDeck()
  const set = (patch) => { setF((s) => ({ ...s, ...patch })); setPage(0) }
  const { cards, total, loading, error } = useSearch(f, page, PAGE_SIZE)
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }, [page])

  return (
    <div className="wrap">
      <h1 className="page-title">Cartas</h1>
      <Filters f={f} set={set} />
      <p className="count">{loading ? 'Carregando…' : `${total.toLocaleString('pt-BR')} cartas encontradas`}</p>
      {error && <p className="empty">{error}</p>}
      {!loading && !error && cards.length === 0 && <p className="empty">Nenhuma carta com esses filtros.</p>}
      <div className={`grid ${loading ? 'dim' : ''}`}>
        {cards.map((c) => <CardTile key={c.id} card={c} onOpen={openCard} onAdd={(card) => notify(add(card) || `${card.name} adicionada.`)} />)}
      </div>
      {total > PAGE_SIZE && (
        <div className="pager">
          <button className="btn ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>← Anterior</button>
          <span>Página {page + 1} de {pages}</span>
          <button className="btn ghost" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Próxima →</button>
        </div>
      )}
    </div>
  )
}
