import { ItemThumbnail } from './ItemThumbnail'
import { useUIStore } from '../state/useUIStore'
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
  /** Unlocked since the player last browsed the shop. */
  isNew?: boolean
  /** Why it can't be bought yet: tapping the greyed-out button explains. */
  whyNot?: { text: string; icon: string }
}

export function ShopItemCard({ previewKey, name, description, color, swatch, icon, cost, owned, equipped, affordable, unlockLevel, rarity, onBuy, onEquip, countOwned, packSize, unavailableText, badge, isNew, whyNot }: ShopItemCardProps) {
  const locked = unlockLevel !== undefined
  const canAct = !locked && (owned ? Boolean(onEquip) && !equipped : affordable)
  // A blocked button stays tappable on touch screens so it can say why.
  const explain = !canAct && whyNot ? whyNot : undefined
  const label = locked ? `🔒 Level ${unlockLevel}` : equipped ? '✓ In use' : owned ? (onEquip ? 'Use' : 'Owned') : affordable ? `🪙 ${cost.toLocaleString()}` : unavailableText ?? `🪙 ${cost.toLocaleString()}`
  return (
    <article className={`shop-card ${locked ? 'is-locked' : ''} ${equipped ? 'is-equipped' : ''} ${rarity ? `rarity-edge-${rarity}` : ''}`} title={description}>
      <div className="shop-art" style={swatch ? { background: `linear-gradient(160deg, ${swatch[0]}, ${swatch[1]})` } : undefined}>
        {previewKey ? <ItemThumbnail previewKey={previewKey} color={color} className="shop-thumb" /> : <span className="shop-icon">{icon ?? '✦'}</span>}
        {!!countOwned && <span className="shop-count">×{countOwned}</span>}
        {rarity && rarity !== 'common' && <span className={`rarity rarity-${rarity}`}>{rarity}</span>}
        {isNew && <span className="shop-new">New</span>}
      </div>
      <div className="shop-copy">
        <strong>{name}</strong>
        {badge && <span className="shop-badge">✨ {badge}</span>}
        <p>{description}</p>
      </div>
      <button
        className={`shop-buy ${owned || equipped ? 'is-owned' : ''} ${!locked && !owned && !affordable ? 'is-short' : ''}`}
        disabled={!canAct && !explain}
        aria-disabled={explain ? true : undefined}
        title={explain?.text}
        onClick={explain ? () => useUIStore.getState().pushToast(explain.text, 'info', explain.icon) : owned ? onEquip : onBuy}
      >
        {packSize && !owned && !locked ? <small>{packSize} for </small> : null}
        {label}
      </button>
    </article>
  )
}
