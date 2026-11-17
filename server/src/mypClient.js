import { fetchJson, UpstreamError } from './http.js'

// Único lugar que conhece o token do MYP Cards. Ele nunca é logado nem devolvido ao navegador.
export class MypClient {
  constructor({ baseUrl, token, timeoutMs, limiter }) {
    this.baseUrl = baseUrl
    this.token = token
    this.timeoutMs = timeoutMs
    this.limiter = limiter
  }

  /** @param routeKey modelo da rota (ex.: "/{jogo}/carta/{nome}"): o MYP conta o limite por rota. */
  async #get(routeKey, path, attempt = 0) {
    const res = await this.limiter.schedule(routeKey, async () => {
      const r = await fetchJson(`${this.baseUrl}${path}`, { headers: this.token ? { 'X-Api-Token': this.token } : {}, timeoutMs: this.timeoutMs })
      this.limiter.noteHeaders(routeKey, {
        limit: parseInt(r.headers.get('x-rate-limit-limit'), 10),
        remaining: parseInt(r.headers.get('x-rate-limit-remaining'), 10)
      })
      return r
    })
    if (res.status === 429) {
      this.limiter.noteRateLimited(routeKey)
      if (attempt < 1) return this.#get(routeKey, path, attempt + 1)
      throw new UpstreamError('myp_rate_limited', 'MYP Cards limitou as requisições', 429)
    }
    if (res.status >= 500) throw new UpstreamError('myp_unavailable', 'MYP Cards indisponível', res.status)
    return res
  }

  /** Cartas com o nome exato (todas as impressões). Sem resultado → []. */
  async searchByName(game, name) {
    const r = await this.#get('/{jogo}/carta/{nome}', `/${encodeURIComponent(game)}/carta/${encodeURIComponent(name)}`)
    if (r.status === 404 || r.status === 400) return []
    if (r.status !== 200) throw new UpstreamError('myp_bad_response', `Resposta inesperada (${r.status})`, r.status)
    return r.body?.cards ?? []
  }

  async getProduct(id) {
    const r = await this.#get('/produto/{id_produto}', `/produto/${encodeURIComponent(id)}`)
    if (r.status === 404 || r.status === 400) return null
    if (r.status !== 200) throw new UpstreamError('myp_bad_response', `Resposta inesperada (${r.status})`, r.status)
    return r.body
  }

  async getHistory(id) {
    const r = await this.#get('/produto/{id_produto}/historico', `/produto/${encodeURIComponent(id)}/historico`)
    if (r.status === 404) return null
    if (r.status !== 200) throw new UpstreamError('myp_bad_response', `Resposta inesperada (${r.status})`, r.status)
    return r.body
  }
}
