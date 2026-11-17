import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d)
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000

export function loadConfig(env = process.env) {
  const token = (env.MYP_API_TOKEN || '').trim()
  const safety = Math.min(1, Math.max(0.1, num(env.MYP_RATE_SAFETY, 0.9)))
  const officialLimit = token ? 60 : 10 // limites documentados pelo MYP Cards (por IP e por rota)
  return {
    port: num(env.PORT, 3001),
    dataDir: env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'),
    myp: {
      baseUrl: (env.MYP_BASE_URL || 'https://mypcards.com/api/v1').replace(/\/$/, ''),
      token,
      limitPerMin: Math.max(1, Math.floor(officialLimit * safety)),
      timeoutMs: num(env.MYP_TIMEOUT_MS, 10_000)
    },
    ygo: {
      baseUrl: (env.YGOPRO_BASE_URL || 'https://db.ygoprodeck.com/api/v7').replace(/\/$/, ''),
      limitPerMin: 300, // a API deles aceita 20 req/s; usamos bem menos
      timeoutMs: 10_000
    },
    adminKey: env.ADMIN_KEY || '',
    corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    inboundLimitPerMin: num(env.INBOUND_LIMIT_PER_MIN, 300),
    batchMax: 30,
    batchWaitMs: num(env.BATCH_WAIT_MS, 6_000),
    ttl: {
      price: num(env.PRICE_TTL_MIN, 30) * MIN,        // fresco
      priceSwr: 2 * HOUR,                              // serve velho e atualiza em segundo plano
      priceMaxStale: DAY,                              // serve velho se o MYP estiver fora do ar
      history: num(env.HISTORY_TTL_HOURS, 6) * HOUR,
      ygo: 7 * DAY,
      notFound: 6 * HOUR,
      mappingRefresh: num(env.MAPPING_REFRESH_DAYS, 30) * DAY
    },
    cacheMax: 5000
  }
}
