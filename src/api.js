// Dados vindos da API pública de cartas (db.ygoprodeck.com). Troque BASE se tiver seu próprio backend.
const BASE = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

export const TYPES = [
  'Normal Monster', 'Effect Monster', 'Ritual Monster', 'Fusion Monster', 'Synchro Monster',
  'XYZ Monster', 'Link Monster', 'Pendulum Effect Monster', 'Spell Card', 'Trap Card'
]
export const ATTRIBUTES = ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE']
export const RACES = [
  'Aqua', 'Beast', 'Beast-Warrior', 'Dinosaur', 'Divine-Beast', 'Dragon', 'Fairy', 'Fiend', 'Fish',
  'Insect', 'Machine', 'Plant', 'Psychic', 'Pyro', 'Reptile', 'Rock', 'Sea Serpent', 'Spellcaster',
  'Thunder', 'Warrior', 'Winged Beast', 'Zombie'
]
export const PAGE_SIZE = 24

export async function searchCards({ q = '', type = '', attribute = '', race = '', level = '', page = 0, num = PAGE_SIZE, sort = 'name' }, signal) {
  const p = new URLSearchParams()
  if (q) p.set('fname', q)
  if (type) p.set('type', type)
  if (attribute) p.set('attribute', attribute)
  if (race) p.set('race', race)
  if (level) p.set('level', level)
  p.set('sort', sort)
  p.set('num', num)
  p.set('offset', page * num)
  const res = await fetch(`${BASE}?${p}`, { signal })
  if (res.status === 400) return { cards: [], total: 0 } // API devolve 400 quando não há resultado
  if (!res.ok) throw new Error('Falha ao consultar a API de cartas.')
  const json = await res.json()
  return { cards: json.data || [], total: json.meta?.total_rows ?? (json.data || []).length }
}

export async function getCardsByIds(ids, signal) {
  if (!ids.length) return []
  const res = await fetch(`${BASE}?id=${ids.join(',')}`, { signal })
  if (!res.ok) return []
  return (await res.json()).data || []
}

export async function randomCard(signal) {
  const res = await fetch('https://db.ygoprodeck.com/api/v7/randomcard.php', { signal })
  if (!res.ok) throw new Error('Falha ao buscar carta aleatória.')
  return res.json()
}

export const img = (c) => c.card_images?.[0]?.image_url_small || c.card_images?.[0]?.image_url
export const imgBig = (c) => c.card_images?.[0]?.image_url
export const isExtra = (type = '') => /Fusion|Synchro|XYZ|Link/i.test(type)

// Preços em R$ vêm do NOSSO backend (que consulta o MYP Cards com cache e token protegido).
export async function getMypPrice(ygoId, signal) {
  const res = await fetch(`/api/prices/${ygoId}`, { signal })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).code || 'erro')
  return res.json()
}
export const brl = (n) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
