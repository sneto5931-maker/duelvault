import { img } from '../api.js'

export default function CardTile({ card, onOpen, onAdd }) {
  return (
    <div className="tile">
      <button className="tile-img" onClick={() => onOpen(card)} aria-label={`Ver ${card.name}`}>
        <img src={img(card)} alt={card.name} loading="lazy" width="168" height="246" />
      </button>
      <div className="tile-meta">
        <span className="tile-name" title={card.name}>{card.name}</span>
        <span className="tile-type">{card.type}</span>
      </div>
      {onAdd && <button className="btn sm" onClick={() => onAdd(card)}>+ Deck</button>}
    </div>
  )
}
