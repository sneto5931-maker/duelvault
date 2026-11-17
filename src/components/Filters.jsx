import { TYPES, ATTRIBUTES, RACES } from '../api.js'

const Sel = ({ label, value, onChange, options }) => (
  <label className="sel">
    <span>{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Todos</option>
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  </label>
)

export default function Filters({ f, set, compact }) {
  return (
    <div className={`filters ${compact ? 'compact' : ''}`}>
      <input className="search" type="search" placeholder="Buscar carta pelo nome…" value={f.q} onChange={(e) => set({ q: e.target.value })} />
      <Sel label="Tipo" value={f.type} onChange={(v) => set({ type: v })} options={TYPES} />
      <Sel label="Atributo" value={f.attribute} onChange={(v) => set({ attribute: v })} options={ATTRIBUTES} />
      <Sel label="Raça" value={f.race} onChange={(v) => set({ race: v })} options={RACES} />
      <Sel label="Nível" value={f.level} onChange={(v) => set({ level: v })} options={Array.from({ length: 12 }, (_, i) => String(i + 1))} />
    </div>
  )
}
