import { fetchJson, UpstreamError } from './http.js'

export class YgoClient {
  constructor({ baseUrl, timeoutMs, limiter }) { Object.assign(this, { baseUrl, timeoutMs, limiter }) }

  /** Dados mínimos da carta no YGOPRODeck (ou null se o ID não existe). */
  async getCard(id) {
    const r = await this.limiter.schedule('ygo', () => fetchJson(`${this.baseUrl}/cardinfo.php?id=${encodeURIComponent(id)}`, { timeoutMs: this.timeoutMs }))
    if (r.status === 400 || r.status === 404) return null
    if (r.status === 429) throw new UpstreamError('ygo_rate_limited', 'YGOPRODeck limitou as requisições', 429)
    if (r.status !== 200) throw new UpstreamError('ygo_unavailable', 'YGOPRODeck indisponível', r.status)
    const c = r.body?.data?.[0]
    if (!c) return null
    return { id: c.id, name: c.name, sets: (c.card_sets || []).map((s) => ({ set_code: s.set_code, set_name: s.set_name, set_rarity: s.set_rarity })) }
  }
}
