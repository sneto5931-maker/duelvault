import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.js'
import { OutboundLimiter } from './limiter.js'
import { Cache } from './cache.js'
import { MypClient } from './mypClient.js'
import { YgoClient } from './ygoClient.js'
import { MappingStore } from './mapping.js'
import { PriceService } from './service.js'
import { createApp } from './app.js'

const config = loadConfig()
const log = (...a) => console.log('[duelvault]', ...a)

const limiters = {
  myp: new OutboundLimiter({ limitPerMin: config.myp.limitPerMin }),
  ygo: new OutboundLimiter({ limitPerMin: config.ygo.limitPerMin })
}
const cache = new Cache({ max: config.cacheMax, file: path.join(config.dataDir, 'cache.json'), log })
const store = new MappingStore(config.dataDir, { log })
const myp = new MypClient({ ...config.myp, limiter: limiters.myp })
const ygo = new YgoClient({ ...config.ygo, limiter: limiters.ygo })
const service = new PriceService({ config, myp, ygo, cache, store, limiter: limiters.myp })

const staticDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist')
const app = createApp({ config, service, store, cache, limiters, staticDir })

const server = app.listen(config.port, () => {
  log(`API em http://localhost:${config.port}/api`)
  log(config.myp.token
    ? `MYP Cards: token carregado, limite ${config.myp.limitPerMin} req/min por rota`
    : `MYP Cards: SEM token (limite ${config.myp.limitPerMin} req/min por rota). Defina MYP_API_TOKEN no .env`)
  if (!config.adminKey) log('Rotas /api/admin desativadas (ADMIN_KEY vazio)')
})

const shutdown = () => { cache.save(); store.save(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref() }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
