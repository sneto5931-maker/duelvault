import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { isExtra, img } from './api.js'

const KEY = 'duelvault:deck:v1'
const LIMITS = { main: 60, extra: 15, side: 15 }
const DeckCtx = createContext(null)
export const useDeck = () => useContext(DeckCtx)
export { LIMITS }

const slim = (c) => ({ id: c.id, name: c.name, type: c.type, img: img(c) })

export function DeckProvider({ children }) {
  const [deck, setDeck] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || { name: 'Meu deck', main: [], extra: [], side: [] } }
    catch { return { name: 'Meu deck', main: [], extra: [], side: [] } }
  })
  const deckRef = useRef(deck)
  deckRef.current = deck
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(deck)) } catch {} }, [deck])

  const count = useCallback((id) => ['main', 'extra', 'side'].reduce((n, z) => n + deck[z].filter((c) => c.id === id).length, 0), [deck])

  const add = useCallback((card, zone) => {
    const d = deckRef.current
    const z = zone || (isExtra(card.type) ? 'extra' : 'main')
    const total = ['main', 'extra', 'side'].reduce((n, k) => n + d[k].filter((c) => c.id === card.id).length, 0)
    if (total >= 3) return 'Máximo de 3 cópias por carta.'
    if (d[z].length >= LIMITS[z]) return `A zona ${z} está cheia.`
    if (z === 'extra' && !isExtra(card.type)) return 'Só monstros Fusion/Synchro/XYZ/Link vão no Extra Deck.'
    const next = { ...d, [z]: [...d[z], slim(card)] }
    deckRef.current = next
    setDeck(next)
    return null
  }, [])

  const remove = useCallback((zone, index) => setDeck((d) => ({ ...d, [zone]: d[zone].filter((_, i) => i !== index) })), [])
  const move = useCallback((zone, index) => setDeck((d) => {
    const card = d[zone][index]
    const to = zone === 'side' ? (isExtra(card.type) ? 'extra' : 'main') : 'side'
    if (d[to].length >= LIMITS[to]) return d
    return { ...d, [zone]: d[zone].filter((_, i) => i !== index), [to]: [...d[to], card] }
  }), [])
  const setName = useCallback((name) => setDeck((d) => ({ ...d, name })), [])
  const clear = useCallback(() => setDeck((d) => ({ ...d, main: [], extra: [], side: [] })), [])
  const replace = useCallback((next) => setDeck(next), [])

  const value = useMemo(() => ({ deck, add, remove, move, setName, clear, replace, count, total: deck.main.length + deck.extra.length + deck.side.length }), [deck, add, remove, move, setName, clear, replace, count])
  return <DeckCtx.Provider value={value}>{children}</DeckCtx.Provider>
}

export function toYdk(deck) {
  return ['#created by Cofre do Duelista', '#main', ...deck.main.map((c) => c.id), '#extra', ...deck.extra.map((c) => c.id), '!side', ...deck.side.map((c) => c.id), ''].join('\n')
}

export function parseYdk(text) {
  const zones = { main: [], extra: [], side: [] }
  let zone = 'main'
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim()
    if (l === '#main') zone = 'main'
    else if (l === '#extra') zone = 'extra'
    else if (l === '!side') zone = 'side'
    else if (/^\d+$/.test(l)) zones[zone].push(Number(l))
  }
  return zones
}
