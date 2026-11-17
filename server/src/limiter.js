// Limitador de SAÍDA: o MYP Cards conta requisições por IP e por rota (janela de 60 s).
// Cada rota tem sua própria fila; as requisições esperam a vez em vez de estourar o limite.
export class QueueFullError extends Error {
  constructor() { super('Fila de requisições cheia'); this.code = 'queue_full' }
}

export class OutboundLimiter {
  constructor({ limitPerMin, windowMs = 60_000, maxQueue = 500, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    this.limit = limitPerMin
    this.windowMs = windowMs
    this.maxQueue = maxQueue
    this.now = now
    this.sleep = sleep
    this.routes = new Map()
    this.sent = 0
  }

  #route(key) {
    let r = this.routes.get(key)
    if (!r) { r = { stamps: [], queue: [], running: false, blockedUntil: 0 }; this.routes.set(key, r) }
    return r
  }

  #wait(r) {
    const t = this.now()
    while (r.stamps.length && t - r.stamps[0] >= this.windowMs) r.stamps.shift()
    let wait = Math.max(0, r.blockedUntil - t)
    if (r.stamps.length >= this.limit) wait = Math.max(wait, r.stamps[0] + this.windowMs - t)
    return wait
  }

  /** Tempo estimado (ms) até uma nova tarefa nesta rota poder sair. */
  estimateWait(key) {
    const r = this.#route(key)
    return this.#wait(r) + Math.floor(r.queue.length / this.limit) * this.windowMs
  }

  schedule(key, task) {
    const r = this.#route(key)
    if (r.queue.length >= this.maxQueue) return Promise.reject(new QueueFullError())
    return new Promise((resolve, reject) => {
      r.queue.push({ task, resolve, reject })
      this.#drain(r)
    })
  }

  /** Sincroniza com os cabeçalhos X-Rate-Limit-* da resposta. */
  noteHeaders(key, { limit, remaining }) {
    const r = this.#route(key)
    if (Number.isFinite(limit) && limit > 0 && limit < this.limit) this.limit = limit
    if (Number.isFinite(remaining) && remaining <= 0) this.#block(r)
  }

  /** O servidor respondeu 429: pausa a rota por uma janela inteira. */
  noteRateLimited(key) { this.#block(this.#route(key)) }

  #block(r) {
    const t = this.now()
    r.blockedUntil = Math.max(r.blockedUntil, (r.stamps[0] ?? t) + this.windowMs)
  }

  async #drain(r) {
    if (r.running) return
    r.running = true
    try {
      while (r.queue.length) {
        const wait = this.#wait(r)
        if (wait > 0) { await this.sleep(wait); continue }
        const job = r.queue.shift()
        r.stamps.push(this.now())
        this.sent++
        try { job.resolve(await job.task()) } catch (e) { job.reject(e) }
      }
    } finally { r.running = false }
  }

  stats() {
    const out = {}
    for (const [k, r] of this.routes) out[k] = { queued: r.queue.length, usedInWindow: r.stamps.filter((s) => this.now() - s < this.windowMs).length, limit: this.limit, blockedForMs: Math.max(0, r.blockedUntil - this.now()) }
    return { sent: this.sent, routes: out }
  }
}
