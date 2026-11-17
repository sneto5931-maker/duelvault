import { buildMapping } from './mapping.js'
import { UpstreamError } from './http.js'

export class NotFoundError extends Error { constructor(code, msg) { super(msg); this.code = code } }
export class BusyError extends Error { constructor(retryAfterSec) { super('Muitas consultas ao MYP Cards no momento'); this.code = 'busy'; this.retryAfterSec = retryAfterSec } }

const SEARCH_ROUTE = '/{jogo}/carta/{nome}'
const toNum = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

// Só expõe o que o frontend precisa (nada de campos internos/extras do upstream).
function slimProduct(p) {
  return {
    internal_code: p.internal_code,
    card_code: p.card_code,
    edition_code: p.edition_code ?? null,
    edition_en: p.edition_en ?? null,
    edition_pt: p.edition_pt ?? null,
    name_en: p.name_en ?? null,
    name_pt: p.name_pt ?? null,
    tcg_productId: p.tcg_productId ?? null,
    min_price: toNum(p.min_price),
    avg_price: toNum(p.avg_price),
    prices: (p.prices || []).map((x) => ({ language: x.language, printing: x.printing, min_price: toNum(x.min_price) })),
    img: p.img_pt || p.img_en || null,
    link: p.link
  }
}

export class PriceService {
  constructor({ config, myp, ygo, cache, store, limiter }) {
    Object.assign(this, { config, myp, ygo, cache, store, limiter })
  }

  async #ygoCard(id) {
    const { value } = await this.cache.get(`ygo:${id}`, { ttl: this.config.ttl.ygo, maxStale: this.config.ttl.ygo }, async () => {
      const card = await this.ygo.getCard(id)
      return card ? { value: card } : { value: null, ttl: this.config.ttl.notFound }
    })
    return value
  }

  /** Resolve a associação YGOPRODeck → MYP e devolve os produtos já com preço (1 requisição por carta). */
  async #resolve(ygoId) {
    const ygo = await this.#ygoCard(ygoId)
    if (!ygo) return { value: null, ttl: this.config.ttl.notFound }

    const ov = this.store.getOverride(ygoId)
    let products
    if (ov?.internalCodes?.length) {
      products = (await Promise.all(ov.internalCodes.map((c) => this.myp.getProduct(c)))).filter(Boolean)
    } else {
      const wait = this.limiter.estimateWait(SEARCH_ROUTE)
      if (wait > 30_000) throw new BusyError(Math.ceil(wait / 1000))
      products = await this.myp.searchByName('yugioh', ov?.mypName || ygo.name)
    }

    const mapping = buildMapping(ygo, products, { trust: Boolean(ov) })
    this.store.set(mapping)
    const slim = products.filter((p) => mapping.productIds.includes(p.internal_code)).map(slimProduct)
    return { value: { mapping, products: slim }, ttl: mapping.status === 'matched' ? undefined : this.config.ttl.notFound }
  }

  async getPrices(ygoId) {
    const t = this.config.ttl
    const { value, state, fetchedAt } = await this.cache.get(`card:${ygoId}`, { ttl: t.price, swr: t.priceSwr, maxStale: t.priceMaxStale }, () => this.#resolve(ygoId))
    if (!value) throw new NotFoundError('ygo_card_not_found', 'Carta não encontrada no YGOPRODeck')

    const printings = [...value.products].sort((a, b) => (a.min_price ?? Infinity) - (b.min_price ?? Infinity))
    const lowest = printings.find((p) => p.min_price !== null) || null
    return {
      ygoId: Number(ygoId),
      name: value.mapping.name,
      status: value.mapping.status,
      mappingSource: value.mapping.source,
      currency: 'BRL',
      lowest: lowest && { min_price: lowest.min_price, avg_price: lowest.avg_price, internal_code: lowest.internal_code, card_code: lowest.card_code, link: lowest.link },
      printings,
      setLinks: value.mapping.setLinks,
      cache: { state, fetchedAt: new Date(fetchedAt).toISOString() },
      attribution: { text: 'Preços por MYP Cards', url: 'https://mypcards.com' }
    }
  }

  async getHistory(ygoId, productId) {
    const prices = await this.getPrices(ygoId)
    if (prices.status !== 'matched') throw new NotFoundError('not_matched', 'Carta sem vínculo com o MYP Cards')
    const id = productId ?? prices.lowest?.internal_code ?? prices.printings[0].internal_code
    // só aceita produtos que pertencem a este vínculo: o servidor não vira proxy aberto
    if (!prices.printings.some((p) => p.internal_code === Number(id))) throw new NotFoundError('product_not_in_mapping', 'Produto não pertence a esta carta')
    const { value, state, fetchedAt } = await this.cache.get(`hist:${id}`, { ttl: this.config.ttl.history, maxStale: this.config.ttl.history * 4 }, async () => {
      const h = await this.myp.getHistory(id)
      return h ? { value: h } : { value: null, ttl: this.config.ttl.notFound }
    })
    if (!value) throw new NotFoundError('history_not_found', 'Sem histórico para este produto')
    return { ygoId: Number(ygoId), product: Number(id), history: value, cache: { state, fetchedAt: new Date(fetchedAt).toISOString() }, attribution: { text: 'Preços por MYP Cards', url: 'https://mypcards.com' } }
  }
}

export { UpstreamError }
