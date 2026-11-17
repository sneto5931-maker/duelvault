export class UpstreamError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status }
}

export async function fetchJson(url, { headers = {}, timeoutMs = 10_000 } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: ctrl.signal })
    let body = null
    try { body = await res.json() } catch { /* corpo vazio ou HTML (ex.: 404 de rota) */ }
    return { status: res.status, headers: res.headers, body }
  } catch (e) {
    throw new UpstreamError(e.name === 'AbortError' ? 'upstream_timeout' : 'upstream_unreachable', 'Falha ao contatar o serviço externo')
  } finally { clearTimeout(t) }
}
