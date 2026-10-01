import { ItemThumbnail } from './ItemThumbnail'
import { Button } from './components/Button'
import type { Rarity } from '../state/types'

interface ShopItemCardProps {
  previewKey?: string
  name: string
  description: string
  color: string
  swatch?: [string, string]
  icon?: string
  cost: number
  owned?: boolean
  equipped?: boolean
  affordable: boolean
  unlockLevel?: number
  rarity?: Rarity
  onBuy: () => void
  onEquip?: () => void
  countOwned?: number
  packSize?: number
  unavailableText?: string
  /** Highlighted perk line, e.g. a gadget bonus or a tool's stats. */
  badge?: string
}

export function ShopItemCard({ previewKey, name, description, color, swatch, icon, cost, owned, equipped, affordable, unlockLevel, rarity, onBuy, onEquip, countOwned, packSize, unavailableText, badge }: ShopItemCardProps) {
  const locked = unlockLevel !== undefined
  return <article className={`shop-item-card ${locked ? 'locked' : ''}`}>
    <div className="shop-item-art" style={swatch ? { background: `linear-gradient(160deg, ${swatch[0]}, ${swatch[1]})` } : undefined}>
      {previewKey ? <ItemThumbnail previewKey={previewKey} color={color} className="shop-item-preview" /> : <span className="shop-item-icon">{icon ?? '✦'}</span>}
      {locked && <span className="shop-lock">🔒 Level {unlockLevel}</span>}
    </div>
    <div className="shop-item-copy"><div className="shop-item-heading"><strong>{name}</strong>{!!countOwned && <span className="shop-item-count">×{countOwned}</span>}</div>{rarity && <span className={`rarity rarity-${rarity}`}>{rarity}</span>}{badge && <span className="shop-item-badge">✨ {badge}</span>}<p>{description}</p></div>
    <div className="shop-item-bottom"><span className="shop-item-cost">{packSize ? `${packSize} for ` : ''}{owned ? 'Owned' : `🪙 ${cost.toLocaleString()}`}</span><Button variant={equipped || owned ? 'secondary' : 'primary'} disabled={locked || (owned ? !onEquip || equipped : !affordable)} onClick={owned ? onEquip : onBuy}>{locked ? `Level ${unlockLevel}` : equipped ? 'Selected' : owned ? onEquip ? 'Use' : 'Owned' : affordable ? 'Buy' : unavailableText ?? 'Need coins'}</Button></div>
  </article>
}
