import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { NotFoundError, BusyError } from './service.js'
import { UpstreamError } from './http.js'
import { QueueFullError } from './limiter.js'

const withTimeout = (p, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), ms)
  p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
})
const asyncH = (fn) => (req, res, next) => fn(req, res, next).catch(next)
const validId = (v) => /^\d{1,10}$/.test(String(v)) && Number(v) > 0

function inboundLimiter(limitPerMin) {
  const hits = new Map()
  setInterval(() => hits.clear(), 60_000).unref()
  return (req, res, next) => {
    const n = (hits.get(req.ip) || 0) + 1
    hits.set(req.ip, n)
    if (n > limitPerMin) return res.status(429).set('Retry-After', '60').json({ error: 'Muitas requisições. Tente novamente em instantes.', code: 'rate_limited' })
    next()
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

export function createApp({ config, service, store, cache, limiters, staticDir }) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback')
  app.use(express.json({ limit: '10kb' }))

  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
    const origin = req.get('origin')
    if (origin && config.corsOrigins.includes(origin)) res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin' })
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  const api = express.Router()
  api.use(inboundLimiter(config.inboundLimitPerMin))

  api.get('/health', (req, res) => res.json({ ok: true, mypToken: Boolean(config.myp.token) }))

  // Um só endpoint em lote evita que o navegador dispare dezenas de requisições.
  api.get('/prices', asyncH(async (req, res) => {
    const ids = [...new Set(String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean))]
    if (!ids.length || ids.length > config.batchMax || !ids.every(validId)) {
      return res.status(400).json({ error: `Informe de 1 a ${config.batchMax} IDs numéricos em ?ids=`, code: 'invalid_parameter' })
    }
    const results = await Promise.all(ids.map(async (id) => {
      const p = service.getPrices(id)
      p.catch(() => {}) // se o tempo estourar, a consulta continua e popula o cache
      try { return [id, { result: 'ok', ...(await withTimeout(p, config.batchWaitMs)) }] }
      catch (e) {
        if (e.code === 'timeout' || e instanceof BusyError || e instanceof QueueFullError) return [id, { result: 'pending' }]
        if (e instanceof NotFoundError) return [id, { result: 'not_found', code: e.code }]
        return [id, { result: 'error', code: e instanceof UpstreamError ? e.code : 'internal_error' }]
      }
    }))
    res.set('Cache-Control', 'public, max-age=60').json({ results: Object.fromEntries(results) })
  }))

  api.get('/prices/:id', asyncH(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'ID inválido', code: 'invalid_parameter' })
    const data = await withTimeout(service.getPrices(req.params.id), 15_000)
    res.set('Cache-Control', 'public, max-age=60').json(data)
  }))

  api.get('/prices/:id/history', asyncH(async (req, res) => {
    const { id } = req.params
    const product = req.query.product
    if (!validId(id) || (product !== undefined && !validId(product))) return res.status(400).json({ error: 'Parâmetro inválido', code: 'invalid_parameter' })
    res.set('Cache-Control', 'public, max-age=300').json(await withTimeout(service.getHistory(id, product), 15_000))
  }))

  // ---- administração (desativada se ADMIN_KEY estiver vazio) ----
  const admin = express.Router()
  admin.use((req, res, next) => {
    if (!config.adminKey) return res.status(404).json({ error: 'Não encontrado', code: 'not_found' })
    if (!safeEqual(String(req.get('x-admin-key') || ''), config.adminKey)) return res.status(401).json({ error: 'Não autorizado', code: 'unauthorized' })
    next()
  })
  admin.get('/stats', (req, res) => res.json({ cache: { size: cache.size(), ...cache.stats }, mapping: store.counts(), outbound: { myp: limiters.myp.stats(), ygo: limiters.ygo.stats() } }))
  admin.get('/unmatched', (req, res) => res.json({ items: store.unmatched().map((m) => ({ ygoId: m.ygoId, name: m.name, status: m.status, updatedAt: m.updatedAt })) }))
  admin.get('/mapping/:id', (req, res) => res.json({ mapping: store.get(req.params.id) ?? null, override: store.getOverride(req.params.id) ?? null }))
  // Ex.: PUT {"mypName":"Nome exato no MYP"}  ou  {"internalCodes":[123,456]}  ou  null para remover
  admin.put('/mapping/:id', (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'ID inválido', code: 'invalid_parameter' })
    const b = req.body
    if (b === null) { store.setOverride(req.params.id, null); cache.delete(`card:${req.params.id}`); return res.json({ ok: true }) }
    const ov = {}
    if (typeof b?.mypName === 'string' && b.mypName.trim()) ov.mypName = b.mypName.trim().slice(0, 200)
    if (Array.isArray(b?.internalCodes) && b.internalCodes.length && b.internalCodes.length <= 50 && b.internalCodes.every(validId)) ov.internalCodes = b.internalCodes.map(Number)
    if (!ov.mypName && !ov.internalCodes) return res.status(400).json({ error: 'Envie mypName e/ou internalCodes', code: 'invalid_parameter' })
    store.setOverride(req.params.id, ov)
    cache.delete(`card:${req.params.id}`)
    res.json({ ok: true, override: ov })
  })
  api.use('/admin', admin)

  api.use((req, res) => res.status(404).json({ error: 'Rota não encontrada', code: 'not_found' }))
  app.use('/api', api)

  // Serve o frontend compilado (npm run build) para expor tudo por uma única porta/túnel.
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) app.use(express.static(staticDir))

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = 500, code = 'internal_error', msg = 'Erro interno'
    if (err instanceof NotFoundError) { status = 404; code = err.code; msg = err.message }
    else if (err instanceof BusyError) { status = 503; code = 'busy'; msg = err.message; res.set('Retry-After', String(err.retryAfterSec)) }
    else if (err instanceof QueueFullError) { status = 503; code = 'busy'; msg = 'Servidor ocupado, tente novamente'; res.set('Retry-After', '30') }
    else if (err?.code === 'timeout') { status = 503; code = 'busy'; msg = 'A consulta está demorando; tente novamente em instantes'; res.set('Retry-After', '15') }
    else if (err instanceof UpstreamError) { status = 502; code = err.code; msg = 'Serviço de preços indisponível no momento' }
    else if (err?.type === 'entity.parse.failed') { status = 400; code = 'invalid_parameter'; msg = 'JSON inválido' }
    else console.error('erro inesperado:', err?.message)
    res.status(status).json({ error: msg, code })
  })
  return app
}
