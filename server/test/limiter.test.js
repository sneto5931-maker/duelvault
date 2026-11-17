import test from 'node:test'
import assert from 'node:assert/strict'
import { OutboundLimiter } from '../src/limiter.js'

function fake(limit) {
  let t = 0
  const l = new OutboundLimiter({ limitPerMin: limit, now: () => t, sleep: async (ms) => { t += ms } })
  return { l, time: () => t }
}

test('nunca passa do limite por janela de 60 s: as demais esperam na fila', async () => {
  const { l, time } = fake(3)
  const starts = []
  await Promise.all(Array.from({ length: 7 }, () => l.schedule('r', async () => { starts.push(time()) })))
  assert.equal(starts.length, 7)
  // em qualquer janela de 60 s no máximo 3 saídas
  for (const s of starts) assert.ok(starts.filter((x) => x >= s && x < s + 60_000).length <= 3)
  assert.ok(time() >= 120_000)
})

test('cada rota tem seu próprio contador', async () => {
  const { l, time } = fake(1)
  await Promise.all([l.schedule('a', async () => {}), l.schedule('b', async () => {})])
  assert.equal(time(), 0)
})

test('429 bloqueia a rota por uma janela inteira', async () => {
  const { l, time } = fake(10)
  await l.schedule('r', async () => {})
  l.noteRateLimited('r')
  await l.schedule('r', async () => {})
  assert.ok(time() >= 60_000)
})

test('remaining=0 nos cabeçalhos pausa a rota', async () => {
  const { l, time } = fake(10)
  await l.schedule('r', async () => {})
  l.noteHeaders('r', { limit: 10, remaining: 0 })
  await l.schedule('r', async () => {})
  assert.ok(time() >= 60_000)
})
