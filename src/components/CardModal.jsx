import { useEffect, useState } from 'react'
import { imgBig, getMypPrice, brl } from '../api.js'
import { useDeck } from '../deck.jsx'

const Row = ({ k, v }) => (v === undefined || v === null || v === '' ? null : <div className="row"><dt>{k}</dt><dd>{v}</dd></div>)

export default function CardModal({ card, onClose, notify }) {
  const { add, count } = useDeck()
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [onClose])

  const [myp, setMyp] = useState({ loading: true })
  useEffect(() => {
    const ctrl = new AbortController()
    setMyp({ loading: true })
    getMypPrice(card.id, ctrl.signal).then((d) => setMyp({ data: d })).catch((e) => e.name !== 'AbortError' && setMyp({ error: true }))
    return () => ctrl.abort()
  }, [card.id])
  const price = card.card_prices?.[0]
  const sets = (card.card_sets || []).slice(0, 8)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={card.name} onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Fechar">×</button>
        <img className="modal-img" src={imgBig(card)} alt={card.name} />
        <div className="modal-body">
          <h2>{card.name}</h2>
          <dl>
            <Row k="Tipo" v={card.type} />
            <Row k="Atributo" v={card.attribute} />
            <Row k="Raça" v={card.race} />
            <Row k="Nível/Rank" v={card.level} />
            <Row k="Link" v={card.linkval} />
            <Row k="ATK" v={card.atk} />
            <Row k="DEF" v={card.def} />
            <Row k="Arquétipo" v={card.archetype} />
          </dl>
          <p className="desc">{card.desc}</p>
          <div className="myp">
            <h4>Preço no Brasil</h4>
            {myp.loading && <p className="hint">Consultando preços…</p>}
            {myp.error && <p className="hint">Preços em R$ indisponíveis no momento.</p>}
            {myp.data && myp.data.status !== 'matched' && <p className="hint">Esta carta não foi encontrada no MYP Cards.</p>}
            {myp.data?.status === 'matched' && (
              <>
                <p className="myp-main">
                  {myp.data.lowest ? <>a partir de <b>{brl(myp.data.lowest.min_price)}</b></> : 'Sem estoque à venda agora'}
                </p>
                <ul className="myp-list">
                  {myp.data.printings.slice(0, 6).map((p) => (
                    <li key={p.internal_code}><a href={p.link} target="_blank" rel="noopener noreferrer">{p.card_code}</a><span>{brl(p.min_price)}</span></li>
                  ))}
                </ul>
              </>
            )}
            <p className="attr">Preços por <a href="https://mypcards.com" target="_blank" rel="noopener noreferrer">MYP Cards</a></p>
          </div>
          {price && (
            <p className="prices">
              <span>TCGPlayer US$ {price.tcgplayer_price}</span>
              <span>Cardmarket € {price.cardmarket_price}</span>
            </p>
          )}
          {sets.length > 0 && (
            <details>
              <summary>Sets e raridades ({card.card_sets.length})</summary>
              <ul className="sets">{sets.map((s, i) => <li key={i}>{s.set_code} · {s.set_name} · {s.set_rarity}</li>)}</ul>
            </details>
          )}
          <div className="actions">
            <button className="btn" onClick={() => { const e = add(card); notify(e || 'Carta adicionada ao deck.') }}>
              Adicionar ao deck {count(card.id) > 0 && `(${count(card.id)}/3)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
