import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadConfig } from '../src/config.js'
import { OutboundLimiter } from '../src/limiter.js'
import { Cache } from '../src/cache.js'
import { MypClient } from '../src/mypClient.js'
import { YgoClient } from '../src/ygoClient.js'
import { MappingStore } from '../src/mapping.js'
import { PriceService } from '../src/service.js'
import { createApp } from '../src/app.js'

export const listen = (handler) => new Promise((resolve) => {
  const s = http.createServer(handler)
  s.listen(0, '127.0.0.1', () => resolve({ server: s, url: `http://127.0.0.1:${s.address().port}` }))
})

const DM = (id, code, ed, min) => ({ internal_code: id, card_code: code, id_marca: 3, name_en: 'Dark Magician', name_pt: 'Mago Negro', edition_code: ed, edition_en: ed, min_price: min, avg_price: min && String(Number(min) + 5), prices: [], link: `https://mypcards.com/yugioh/produto/${id}/dark-magician` })

/** MYP Cards + YGOPRODeck simulados; registra cada chamada recebida. */
export async function startMocks({ limit = 60, failMyp = false } = {}) {
  const calls = { myp: [], ygo: [], tokens: [] }
  const state = { failMyp, rateLimitNext: 0 }
  const myp = await listen((req, res) => {
    calls.myp.push(req.url); calls.tokens.push(req.headers['x-api-token'])
    res.setHeader('content-type', 'application/json')
    res.setHeader('X-Rate-Limit-Limit', String(limit)); res.setHeader('X-Rate-Limit-Remaining', '50')
    if (state.rateLimitNext > 0) { state.rateLimitNext--; res.statusCode = 429; return res.end(JSON.stringify({ error: 'x', code: 'rate_limited', status: 429 })) }
    if (state.failMyp) { res.statusCode = 503; return res.end('{}') }
    const m = /^\/yugioh\/carta\/(.+)$/.exec(req.url)
    if (m) {
      const name = decodeURIComponent(m[1])
      if (name === 'Dark Magician') return res.end(JSON.stringify({ cards: [DM(101, 'LOB-005', 'LOB', '15.00'), DM(102, 'SDY-006', 'SDY', '9.90'), DM(103, 'DUPO-001', 'DUPO', null)] }))
      if (name === 'Nome Diferente no MYP') return res.end(JSON.stringify({ cards: [{ ...DM(201, 'XYZ-001', 'XYZ', '3.00'), name_en: 'Nome Diferente no MYP', name_pt: null }] }))
      return res.end(JSON.stringify({ cards: [] }))
    }
    const p = /^\/produto\/(\d+)$/.exec(req.url)
    if (p) return res.end(JSON.stringify(DM(Number(p[1]), 'LOB-005', 'LOB', '15.00')))
    if (/^\/produto\/\d+\/historico$/.test(req.url)) return res.end(JSON.stringify({ internal_code: 101, currency: 'BRL', days: 90, version: null, points: [] }))
    res.statusCode = 404; res.end('{}')
  })
  const ygo = await listen((req, res) => {
    calls.ygo.push(req.url); res.setHeader('content-type', 'application/json')
    const id = new URL(req.url, 'http://x').searchParams.get('id')
    if (id === '46986414') return res.end(JSON.stringify({ data: [{ id: 46986414, name: 'Dark Magician', card_sets: [{ set_code: 'LOB-EN005', set_name: 'Legend of Blue Eyes', set_rarity: 'Ultra Rare' }, { set_code: 'SDY-006', set_name: 'Starter Deck: Yugi', set_rarity: 'Ultra Rare' }, { set_code: 'MRD-EN001', set_name: 'Metal Raiders', set_rarity: 'Common' }] }] }))
    if (id === '777') return res.end(JSON.stringify({ data: [{ id: 777, name: 'Nome Original', card_sets: [{ set_code: 'XYZ-EN001', set_name: 'X', set_rarity: 'Common' }] }] }))
    res.statusCode = 400; res.end(JSON.stringify({ error: 'no card' }))
  })
  return { calls, state, myp, ygo, close: () => { for (const x of [myp, ygo]) { x.server.closeAllConnections?.(); x.server.close() } } }
}

export async function buildStack({ token = 'segredo-super-secreto', mocks, dataDir, adminKey = 'admin123', env = {} } = {}) {
  const dir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'dv-'))
  const config = loadConfig({ MYP_API_TOKEN: token, MYP_BASE_URL: mocks.myp.url, YGOPRO_BASE_URL: mocks.ygo.url, ADMIN_KEY: adminKey, DATA_DIR: dir, ...env })
  const limiters = { myp: new OutboundLimiter({ limitPerMin: config.myp.limitPerMin }), ygo: new OutboundLimiter({ limitPerMin: 300 }) }
  const cache = new Cache({ file: path.join(dir, 'cache.json') })
  const store = new MappingStore(dir)
  const service = new PriceService({ config, myp: new MypClient({ ...config.myp, limiter: limiters.myp }), ygo: new YgoClient({ ...config.ygo, limiter: limiters.ygo }), cache, store, limiter: limiters.myp })
  const app = createApp({ config, service, store, cache, limiters })
  const web = await listen(app)
  return { config, cache, store, service, limiters, web, dir, close: () => { web.server.closeAllConnections?.(); web.server.close() } }
}
