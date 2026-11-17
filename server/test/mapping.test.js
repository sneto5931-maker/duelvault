import test from 'node:test'
import assert from 'node:assert/strict'
import { setKey, buildMapping, normName } from '../src/mapping.js'

test('setKey normaliza códigos dos dois catálogos para a mesma chave', () => {
  assert.equal(setKey('LOB-EN001'), setKey('LOB-001'))
  assert.equal(setKey('RA01-EN012'), 'RA01-12')
  assert.equal(setKey('SDY-006'), 'SDY-6')
  assert.equal(setKey('LDK2-ENK01'), 'LDK2-K1')
  assert.equal(setKey('LOB-E001', { loose: true }), setKey('LOB-001', { loose: true }))
})

test('normName ignora caixa, acentos e espaços extras', () => {
  assert.equal(normName('  Mago  NEGRO '), 'mago negro')
  assert.equal(normName('Dragão'), 'dragao')
})

test('buildMapping liga sets do YGOPRODeck às impressões do MYP e descarta nomes diferentes', () => {
  const ygo = { id: 1, name: 'Dark Magician', sets: [{ set_code: 'LOB-EN005', set_rarity: 'UR' }, { set_code: 'MRD-EN001', set_rarity: 'C' }] }
  const products = [
    { internal_code: 1, card_code: 'LOB-005', id_marca: 3, name_en: 'Dark Magician' },
    { internal_code: 2, card_code: 'DUPO-001', id_marca: 3, name_en: 'Dark Magician' },
    { internal_code: 3, card_code: 'AAA-001', id_marca: 3, name_en: 'Dark Magician Girl' },
    { internal_code: 4, card_code: 'LOB-005', id_marca: 1, name_en: 'Dark Magician' } // outro jogo
  ]
  const m = buildMapping(ygo, products)
  assert.equal(m.status, 'matched')
  assert.deepEqual(m.productIds, [1, 2])
  assert.deepEqual(m.setLinks.map((l) => [l.set_code, l.internal_code]), [['LOB-EN005', 1]])
  assert.deepEqual(m.unlinkedProducts, [2])
  assert.equal(buildMapping(ygo, []).status, 'not_found')
})
