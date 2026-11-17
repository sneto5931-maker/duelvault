import fs from 'node:fs'
import path from 'node:path'

// ---------- normalização ----------
export const normName = (s = '') =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const LANGS = /^(EN|PT|SP|FR|DE|IT|JP|JA|KR|KO|AE|SC|TC)/

/**
 * Chave comparável entre os dois catálogos:
 *   YGOPRODeck "LOB-EN001"  ->  "LOB-1"
 *   MYP Cards  "LOB-001"    ->  "LOB-1"
 * Remove o código de idioma/região (EN, PT, SP…) e zeros à esquerda.
 * `loose` ignora também letras antes do número (ex.: "LOB-E001" -> "LOB-1").
 */
export function setKey(code = '', { loose = false } = {}) {
  const c = String(code).toUpperCase().trim()
  const i = c.indexOf('-')
  if (i < 1) return c
  const prefix = c.slice(0, i)
  const rest = c.slice(i + 1).replace(LANGS, '')
  const m = /^([A-Z]*)0*(\d+)$/.exec(rest)
  if (!m) return `${prefix}-${rest}`
  return loose ? `${prefix}-${m[2]}` : `${prefix}-${m[1]}${m[2]}`
}

// ---------- construção do vínculo ----------
/**
 * Liga uma carta do YGOPRODeck aos produtos (impressões) do MYP Cards.
 * `ygo`: { id, name, sets[] }   `products`: lista devolvida pelo MYP.
 */
export function buildMapping(ygo, products, { trust = false } = {}) {
  const target = normName(ygo.name)
  const matched = trust ? products : products.filter((p) => (p.id_marca === undefined || p.id_marca === 3) && (normName(p.name_en) === target || normName(p.name_pt) === target))

  const strict = new Map(), loose = new Map()
  for (const p of matched) {
    const k = setKey(p.card_code)
    if (!strict.has(k)) strict.set(k, p)
    const l = setKey(p.card_code, { loose: true })
    loose.set(l, loose.has(l) ? null : p) // null = ambíguo, não usar
  }
  const setLinks = []
  for (const s of ygo.sets || []) {
    const p = strict.get(setKey(s.set_code)) || loose.get(setKey(s.set_code, { loose: true }))
    if (p) setLinks.push({ set_code: s.set_code, set_rarity: s.set_rarity, internal_code: p.internal_code, card_code: p.card_code })
  }

  return {
    ygoId: ygo.id,
    name: ygo.name,
    status: matched.length ? 'matched' : 'not_found',
    productIds: [...new Set(matched.map((p) => p.internal_code))],
    setLinks,
    // impressões do MYP sem equivalente nos sets do YGOPRODeck (úteis para revisão manual)
    unlinkedProducts: matched.filter((p) => !setLinks.some((l) => l.internal_code === p.internal_code)).map((p) => p.internal_code),
    source: trust ? 'manual' : 'auto',
    updatedAt: Date.now()
  }
}

// ---------- armazenamento durável ----------
// mapping.json : vínculos descobertos automaticamente (reconstruíveis)
// overrides.json: correções manuais { "<ygoId>": { mypName?: string, internalCodes?: number[] } }
export class MappingStore {
  constructor(dir, { now = () => Date.now(), log = () => {} } = {}) {
    this.dir = dir; this.now = now; this.log = log
    this.mappingFile = path.join(dir, 'mapping.json')
    this.overridesFile = path.join(dir, 'overrides.json')
    this.mappings = new Map(Object.entries(this.#read(this.mappingFile)))
    this.overrides = this.#read(this.overridesFile)
    this.timer = null
  }

  #read(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return {} }
  }
  #write(file, obj) {
    fs.mkdirSync(this.dir, { recursive: true })
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(obj, null, 2)); fs.renameSync(`${file}.tmp`, file)
  }

  get(ygoId) { return this.mappings.get(String(ygoId)) }
  set(m) { this.mappings.set(String(m.ygoId), m); this.#debounceSave() }
  #debounceSave() {
    if (this.timer) return
    this.timer = setTimeout(() => this.save(), 3000); this.timer.unref?.()
  }
  save() {
    clearTimeout(this.timer); this.timer = null
    try { this.#write(this.mappingFile, Object.fromEntries(this.mappings)) } catch (e) { this.log('mapping: falha ao salvar', e.message) }
  }

  getOverride(ygoId) { return this.overrides[String(ygoId)] }
  setOverride(ygoId, ov) {
    if (ov === null) delete this.overrides[String(ygoId)]
    else this.overrides[String(ygoId)] = ov
    this.#write(this.overridesFile, this.overrides)
    this.mappings.delete(String(ygoId)); this.save()
  }

  unmatched() { return [...this.mappings.values()].filter((m) => m.status !== 'matched') }
  counts() {
    const all = [...this.mappings.values()]
    return { total: all.length, matched: all.filter((m) => m.status === 'matched').length, notFound: all.filter((m) => m.status === 'not_found').length, overrides: Object.keys(this.overrides).length }
  }
}
