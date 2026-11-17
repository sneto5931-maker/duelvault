import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { randomCard, imgBig } from '../api.js'

export default function Home({ openCard }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [cards, setCards] = useState([])
  const [err, setErr] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    Promise.all([1, 2, 3, 4, 5].map(() => randomCard(ctrl.signal)))
      .then((r) => setCards(r.filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i)))
      .catch((e) => e.name !== 'AbortError' && setErr(true))
    return () => ctrl.abort()
  }, [])

  const submit = (e) => { e.preventDefault(); nav(`/cartas?q=${encodeURIComponent(q)}`) }

  return (
    <>
      <section className="hero">
        <div className="wrap hero-in">
          <p className="eyebrow">Banco de cartas · Montador de decks</p>
          <h1>Encontre qualquer carta.<br /><em>Monte o deck do próximo duelo.</em></h1>
          <form className="hero-search" onSubmit={submit}>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: Dark Magician, Blue-Eyes, Ash Blossom…" aria-label="Buscar carta" />
            <button className="btn">Buscar</button>
          </form>
          <div className="hero-links">
            <Link to="/cartas">Explorar todas as cartas</Link>
            <Link to="/deck">Abrir Deck Builder</Link>
          </div>
        </div>
      </section>

      <section className="wrap">
        <h2 className="sec">Cartas do dia <small>sorteadas a cada visita</small></h2>
        {err && <p className="empty">Não foi possível carregar as cartas agora. Verifique sua conexão.</p>}
        <div className="strip">
          {cards.length === 0 && !err && Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton" />)}
          {cards.map((c) => (
            <button key={c.id} className="strip-card" onClick={() => openCard(c)} aria-label={c.name}>
              <img src={imgBig(c)} alt={c.name} loading="lazy" />
            </button>
          ))}
        </div>
      </section>

      <section className="wrap features">
        {[
          ['Busca com filtros', 'Nome, tipo, atributo, raça e nível, com resultados paginados.'],
          ['Detalhes completos', 'Efeito, ATK/DEF, sets, raridades e preços de cada carta.'],
          ['Deck Builder', 'Main, Extra e Side Deck com regra de 3 cópias, salvo no navegador.'],
          ['Importar e exportar .ydk', 'Compatível com simuladores populares de duelo.'],
        ].map(([t, d]) => <div className="feat" key={t}><h3>{t}</h3><p>{d}</p></div>)}
      </section>
    </>
  )
}
