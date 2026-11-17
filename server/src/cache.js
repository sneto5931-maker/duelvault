import fs from 'node:fs'
import path from 'node:path'

// Cache em memória (LRU) com TTL, "stale-while-revalidate", coalescência de requisições
// idênticas e persistência opcional em disco (sobrevive a reinícios).
export class Cache {
  constructor({ max = 5000, file = null, now = () => Date.now(), saveDelayMs = 5000, log = () => {} } = {}) {
    this.max = max
    this.file = file
    this.now = now
    this.saveDelayMs = saveDelayMs
    this.log = log
    this.map = new Map()
    this.inflight = new Map()
    this.timer = null
    this.stats = { hits: 0, stale: 0, misses: 0, coalesced: 0, errorsServedStale: 0 }
    this.load()
  }

  load() {
    if (!this.file || !fs.existsSync(this.file)) return
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      const t = this.now()
      for (const [k, e] of data.entries || []) if (e.hardExpiresAt > t) this.map.set(k, e)
    } catch (e) { this.log('cache: não foi possível ler o arquivo, começando vazio', e.message) }
  }

  save() {
    if (!this.file) return
    clearTimeout(this.timer); this.timer = null
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries: [...this.map] }))
      fs.renameSync(tmp, this.file)
    } catch (e) { this.log('cache: falha ao salvar', e.message) }
  }

  #scheduleSave() {
    if (!this.file || this.timer) return
    this.timer = setTimeout(() => this.save(), this.saveDelayMs)
    this.timer.unref?.()
  }

  peek(key) {
    const e = this.map.get(key)
    if (!e) return undefined
    if (e.hardExpiresAt <= this.now()) { this.map.delete(key); return undefined }
    return e
  }

  set(key, value, { ttl, swr = 0, maxStale = 0 }) {
    const t = this.now()
    this.map.delete(key)
    this.map.set(key, { value, fetchedAt: t, freshUntil: t + ttl, swrUntil: t + ttl + swr, hardExpiresAt: t + ttl + Math.max(swr, maxStale) })
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value)
    this.#scheduleSave()
  }

  delete(key) { this.map.delete(key); this.#scheduleSave() }

  /**
   * get-or-load. `loader` devolve { value, ttl? } (ttl opcional para cache negativo).
   * Retorna { value, state: 'hit' | 'miss' | 'stale' | 'stale-error', fetchedAt }.
   */
  async get(key, opts, loader) {
    const t = this.now()
    const e = this.peek(key)
    if (e && t < e.freshUntil) { this.stats.hits++; return { value: e.value, state: 'hit', fetchedAt: e.fetchedAt } }
    if (e && t < e.swrUntil) {
      this.stats.stale++
      this.#refresh(key, opts, loader).catch((err) => this.log(`cache: refresh em segundo plano falhou (${key}):`, err.code || err.message))
      return { value: e.value, state: 'stale', fetchedAt: e.fetchedAt }
    }
    this.stats.misses++
    try {
      const fresh = await this.#refresh(key, opts, loader)
      return { value: fresh.value, state: 'miss', fetchedAt: fresh.fetchedAt }
    } catch (err) {
      if (e) { this.stats.errorsServedStale++; return { value: e.value, state: 'stale-error', fetchedAt: e.fetchedAt } }
      throw err
    }
  }

  #refresh(key, opts, loader) {
    const running = this.inflight.get(key)
    if (running) { this.stats.coalesced++; return running }
    const p = (async () => {
      const { value, ttl } = await loader()
      this.set(key, value, { ...opts, ttl: ttl ?? opts.ttl })
      return this.map.get(key)
    })().finally(() => this.inflight.delete(key))
    this.inflight.set(key, p)
    return p
  }

  size() { return this.map.size }
}
