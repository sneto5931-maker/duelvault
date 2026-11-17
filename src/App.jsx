import { useState, useCallback } from 'react'
import { Routes, Route, NavLink, Link } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Cards from './pages/Cards.jsx'
import DeckBuilder from './pages/DeckBuilder.jsx'
import CardModal from './components/CardModal.jsx'
import { useDeck } from './deck.jsx'

export default function App() {
  const [open, setOpen] = useState(null)
  const [toast, setToast] = useState('')
  const { total } = useDeck()
  const notify = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 2600) }, [])
  const ctx = { openCard: setOpen, notify }

  return (
    <>
      <header className="nav">
        <Link to="/" className="brand"><span className="brand-mark" /><span>Cofre do <b>Duelista</b></span></Link>
        <nav>
          <NavLink to="/" end>Início</NavLink>
          <NavLink to="/cartas">Cartas</NavLink>
          <NavLink to="/deck">Deck Builder{total > 0 && <span className="pill">{total}</span>}</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home {...ctx} />} />
          <Route path="/cartas" element={<Cards {...ctx} />} />
          <Route path="/deck" element={<DeckBuilder {...ctx} />} />
          <Route path="*" element={<div className="wrap empty">Página não encontrada.</div>} />
        </Routes>
      </main>
      <footer className="foot">
        Cofre do Duelista é um projeto de fã, sem afiliação com a Konami. Dados de cartas via API pública do YGOPRODeck. Preços em R$ por <a href="https://mypcards.com" target="_blank" rel="noopener noreferrer" style={{textDecoration:"underline"}}>MYP Cards</a>.
      </footer>
      {open && <CardModal card={open} onClose={() => setOpen(null)} notify={notify} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
