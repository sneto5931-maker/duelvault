import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Cache } from '../src/cache.js'

const mk = (extra = {}) => { let t = 1000; const c = new Cache({ now: () => t, ...extra }); return { c, adv: (ms) => { t += ms } } }
const opts = { ttl: 100, swr: 100, maxStale: 1000 }

test('hit dentro do TTL não chama o loader de novo', async () => {
  const { c } = mk(); let n = 0
  const load = async () => ({ value: ++n })
  assert.equal((await c.get('k', opts, load)).state, 'miss')
  assert.equal((await c.get('k', opts, load)).state, 'hit')
  assert.equal(n, 1)
})

test('requisições simultâneas iguais viram uma só (coalescência)', async () => {
  const { c } = mk(); let n = 0
  const load = async () => { n++; await new Promise((r) => setTimeout(r, 20)); return { value: 'x' } }
  await Promise.all(Array.from({ length: 10 }, () => c.get('k', opts, load)))
  assert.equal(n, 1)
  assert.equal(c.stats.coalesced, 9)
})

test('stale-while-revalidate devolve o velho e atualiza em segundo plano', async () => {
  const { c, adv } = mk(); let n = 0
  const load = async () => ({ value: ++n })
  await c.get('k', opts, load); adv(150)
  const r = await c.get('k', opts, load)
  assert.deepEqual([r.state, r.value], ['stale', 1])
  await new Promise((r2) => setTimeout(r2, 10))
  assert.equal((await c.get('k', opts, load)).value, 2)
})

test('se o upstream falhar, serve o velho; sem velho, propaga o erro', async () => {
  const { c, adv } = mk()
  await c.get('k', opts, async () => ({ value: 'old' })); adv(500)
  const r = await c.get('k', opts, async () => { throw new Error('boom') })
  assert.deepEqual([r.state, r.value], ['stale-error', 'old'])
  await assert.rejects(c.get('novo', opts, async () => { throw new Error('boom') }))
})

test('persiste em disco e recarrega após reinício', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-')), 'c.json')
  const a = new Cache({ file }); await a.get('k', { ttl: 60_000 }, async () => ({ value: { ok: 1 } })); a.save()
  const b = new Cache({ file }); let n = 0
  const r = await b.get('k', { ttl: 60_000 }, async () => ({ value: ++n }))
  assert.deepEqual([r.state, r.value, n], ['hit', { ok: 1 }, 0])
})

test('LRU descarta o mais antigo', async () => {
  const { c } = mk({ max: 2 })
  for (const k of ['a', 'b', 'c']) await c.get(k, opts, async () => ({ value: k }))
  assert.equal(c.peek('a'), undefined); assert.ok(c.peek('c'))
})
