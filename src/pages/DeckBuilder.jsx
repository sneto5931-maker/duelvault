import { useRef, useState } from 'react'
import Filters from '../components/Filters.jsx'
import useSearch, { EMPTY } from '../components/useSearch.js'
import { useDeck, LIMITS, toYdk, parseYdk } from '../deck.jsx'
import { getCardsByIds, img } from '../api.js'

function Zone({ title, zone, cards, onOpen }) {
  const { remove, move } = useDeck()
  const min = zone === 'main' ? 40 : null
  const bad = min && cards.length > 0 && cards.length < min
  return (
    <section className="zone">
      <h3>{title} <span className={bad ? 'warn' : ''}>{cards.length}/{LIMITS[zone]}{min ? ` (mín. ${min})` : ''}</span></h3>
      <div className="zone-grid">
        {cards.length === 0 && <p className="hint">Vazio. Adicione cartas pela busca.</p>}
        {cards.map((c, i) => (
          <div className="mini" key={`${c.id}-${i}`}>
            <img src={c.img} alt={c.name} loading="lazy" title={c.name} onClick={() => onOpen(c)} />
            <div className="mini-act">
              <button onClick={() => move(zone, i)} title={zone === 'side' ? 'Mover para o deck' : 'Mover para o Side'}>⇄</button>
              <button onClick={() => remove(zone, i)} title="Remover">×</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function DeckBuilder({ openCard, notify }) {
  const { deck, add, setName, clear, replace } = useDeck()
  const [f, setF] = useState(EMPTY)
  const [page, setPage] = useState(0)
  const fileRef = useRef()
  const set = (patch) => { setF((s) => ({ ...s, ...patch })); setPage(0) }
  const { cards, total, loading, error } = useSearch(f, page, 12)
  const pages = Math.max(1, Math.ceil(total / 12))

  const openById = async (c) => { const [full] = await getCardsByIds([c.id]); if (full) openCard(full) }

  const exportYdk = () => {
    const url = URL.createObjectURL(new Blob([toYdk(deck)], { type: 'text/plain' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${deck.name || 'deck'}.ydk` })
    a.click(); URL.revokeObjectURL(url)
  }

  const importYdk = async (file) => {
    if (!file) return
    const zones = parseYdk(await file.text())
    const ids = [...new Set([...zones.main, ...zones.extra, ...zones.side])]
    if (!ids.length) return notify('Arquivo .ydk vazio ou inválido.')
    notify('Importando…')
    const data = []
    for (let i = 0; i < ids.length; i += 50) data.push(...await getCardsByIds(ids.slice(i, i + 50)))
    const map = new Map(data.map((c) => [c.id, { id: c.id, name: c.name, type: c.type, img: img(c) }]))
    const build = (arr) => arr.map((id) => map.get(id)).filter(Boolean)
    replace({ name: file.name.replace(/\.ydk$/i, ''), main: build(zones.main), extra: build(zones.extra), side: build(zones.side) })
    notify('Deck importado.')
  }

  return (
    <div className="wrap builder">
      <aside className="panel">
        <h2>Buscar cartas</h2>
        <Filters f={f} set={set} compact />
        {error && <p className="empty">{error}</p>}
        <p className="count">{loading ? 'Carregando…' : `${total.toLocaleString('pt-BR')} resultados`}</p>
        <div className={`list ${loading ? 'dim' : ''}`}>
          {cards.map((c) => (
            <div className="li" key={c.id}>
              <img src={img(c)} alt="" loading="lazy" onClick={() => openCard(c)} />
              <div className="li-t" onClick={() => openCard(c)}><b>{c.name}</b><small>{c.type}</small></div>
              <button className="btn sm" onClick={() => { const e = add(c); if (e) notify(e) }}>+</button>
            </div>
          ))}
        </div>
        {total > 12 && (
          <div className="pager tight">
            <button className="btn ghost sm" disabled={page === 0} onClick={() => setPage(page - 1)}>←</button>
            <span>{page + 1}/{pages}</span>
            <button className="btn ghost sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>→</button>
          </div>
        )}
      </aside>

      <div className="deck">
        <div className="deck-bar">
          <input className="deck-name" value={deck.name} onChange={(e) => setName(e.target.value)} aria-label="Nome do deck" />
          <div className="deck-actions">
            <button className="btn ghost" onClick={() => fileRef.current.click()}>Importar .ydk</button>
            <input ref={fileRef} type="file" accept=".ydk" hidden onChange={(e) => { importYdk(e.target.files[0]); e.target.value = '' }} />
            <button className="btn" onClick={exportYdk} disabled={!deck.main.length && !deck.extra.length}>Exportar .ydk</button>
            <button className="btn ghost danger" onClick={() => confirm('Limpar o deck inteiro?') && clear()}>Limpar</button>
          </div>
        </div>
        <Zone title="Main Deck" zone="main" cards={deck.main} onOpen={openById} />
        <Zone title="Extra Deck" zone="extra" cards={deck.extra} onOpen={openById} />
        <Zone title="Side Deck" zone="side" cards={deck.side} onOpen={openById} />
      </div>
    </div>
  )
}
