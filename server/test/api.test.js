import test from 'node:test'
import assert from 'node:assert/strict'
import { startMocks, buildStack } from './helpers.js'

const get = async (s, p, headers) => { const r = await fetch(s.web.url + p, { headers }); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers, text: null } }
const DM_ID = 46986414

test('preço: associa YGOPRODeck→MYP, manda o token só ao MYP e nunca o devolve', async () => {
  const mocks = await startMocks(); const s = await buildStack({ mocks })
  const r = await get(s, `/api/prices/${DM_ID}`)
  assert.equal(r.status, 200)
  assert.equal(r.body.status, 'matched')
  assert.equal(r.body.lowest.min_price, 9.9)               // menor entre as impressões (SDY-006)
  assert.equal(r.body.printings.length, 3)
  assert.deepEqual(r.body.setLinks.map((l) => l.set_code).sort(), ['LOB-EN005', 'SDY-006'])
  assert.equal(r.body.attribution.url, 'https://mypcards.com')
  assert.equal(mocks.calls.tokens[0], 'segredo-super-secreto')
  assert.ok(!JSON.stringify(r.body).includes('segredo-super-secreto'))
  assert.ok(![...r.headers.values()].join().includes('segredo-super-secreto'))
  s.close(); mocks.close()
})

test('cache: 20 consultas da mesma carta geram 1 chamada ao MYP e 1 ao YGOPRODeck', async () => {
  const mocks = await startMocks(); const s = await buildStack({ mocks })
  await Promise.all(Array.from({ length: 20 }, () => get(s, `/api/prices/${DM_ID}`)))
  await get(s, `/api/prices/${DM_ID}`)
  assert.equal(mocks.calls.myp.length, 1)
  assert.equal(mocks.calls.ygo.length, 1)
  s.close(); mocks.close()
})

test('cache persistido: após reiniciar o servidor não consulta o MYP de novo', async () => {
  const mocks = await startMocks(); const s1 = await buildStack({ mocks })
  await get(s1, `/api/prices/${DM_ID}`); s1.cache.save(); s1.store.save(); s1.close()
  const s2 = await buildStack({ mocks, dataDir: s1.dir })
  const r = await get(s2, `/api/prices/${DM_ID}`)
  assert.equal(r.body.cache.state, 'hit'); assert.equal(mocks.calls.myp.length, 1)
  assert.equal(s2.store.get(DM_ID).status, 'matched')   // vínculo durável
  s2.close(); mocks.close()
})

test('MYP fora do ar: serve o cache velho; sem cache devolve 502 sem vazar detalhes', async () => {
  const mocks = await startMocks(); const s = await buildStack({ mocks, env: { PRICE_TTL_MIN: '0.0001' } })
  assert.equal((await get(s, `/api/prices/${DM_ID}`)).status, 200)
  await new Promise((r) => setTimeout(r, 50))
  mocks.state.failMyp = true
  const ok = await get(s, `/api/prices/${DM_ID}`)   // velho dentro da janela SWR
  assert.equal(ok.status, 200)
  const down = await get(s, '/api/prices/777')
  assert.equal(down.status, 502); assert.equal(down.body.code, 'myp_unavailable')
  assert.ok(!JSON.stringify(down.body).includes(mocks.myp.url))
  s.close(); mocks.close()
})

test('429 do MYP: tenta de novo depois da pausa e não propaga erro ao usuário', async () => {
  const mocks = await startMocks(); mocks.state.rateLimitNext = 1
  const s = await buildStack({ mocks })
  // acelera a pausa de 60 s trocando o relógio do limitador
  const lim = s.limiters.myp; let off = 0; lim.now = () => Date.now() + off; lim.sleep = async (ms) => { off += ms }
  const r = await get(s, `/api/prices/${DM_ID}`)
  assert.equal(r.status, 200); assert.equal(mocks.calls.myp.length, 2)
  s.close(); mocks.close()
})

test('lote: respeita o máximo e responde por item', async () => {
  const mocks = await startMocks(); const s = await buildStack({ mocks })
  const r = await get(s, `/api/prices?ids=${DM_ID},999,abc`)
  assert.equal(r.status, 400)
  const ok = await get(s, `/api/prices?ids=${DM_ID},999`)
  assert.equal(ok.body.results[DM_ID].result, 'ok'); assert.equal(ok.body.results['999'].result, 'not_found')
  assert.equal((await get(s, `/api/prices?ids=${Array.from({ length: 31 }, (_, i) => i + 1)}`)).status, 400)
  s.close(); mocks.close()
})

test('override manual corrige carta com nome diferente nos dois catálogos', async () => {
  const mocks = await startMocks(); const s = await buildStack({ mocks })
  assert.equal((await get(s, '/api/prices/777')).body.status, 'not_found')
  assert.equal((await get(s, '/api/admin/unmatched')).status, 401)
  const put = await fetch(`${s.web.url}/api/admin/mapping/777`, { method: 'PUT', headers: { 'x-admin-key': 'admin123', 'content-type': 'application/json' }, body: JSON.stringify({ mypName: 'Nome Diferente no MYP' }) })
  assert.equal(put.status, 200)
  const r = await get(s, '/api/prices/777')
  assert.equal(r.body.status, 'matched'); assert.equal(r.body.mappingSource, 'manual'); assert.equal(r.body.lowest.min_price, 3)
  s.close(); mocks.close()
})

test('histórico só aceita produtos do vínculo (não é proxy aberto)', async () => {
  const mocks = await startMocks(); const s = await buildStack({ mocks })
  assert.equal((await get(s, `/api/prices/${DM_ID}/history`)).status, 200)
  assert.equal((await get(s, `/api/prices/${DM_ID}/history?product=999999`)).status, 404)
  s.close(); mocks.close()
})

test('admin desativado sem ADMIN_KEY; entradas inválidas são rejeitadas', async () => {
  const mocks = await startMocks(); const s = await buildStack({ mocks, adminKey: '' })
  assert.equal((await get(s, '/api/admin/stats', { 'x-admin-key': '' })).status, 404)
  assert.equal((await get(s, '/api/prices/abc')).status, 400)
  assert.equal((await get(s, '/api/prices/0')).status, 400)
  s.close(); mocks.close()
})
