import type { Rarity, StyleTag } from '../../state/types'
import { TANK_BOTTOM_Y, TANK_DEPTH, TANK_WIDTH } from '../TankBounds'

/** Shared stand dimensions: every style fills the same box under the tank. */
export const STAND_TOP_Y = TANK_BOTTOM_Y - 0.06
export const STAND_HEIGHT = 2.3
export const STAND_WIDTH = TANK_WIDTH + 0.5
export const STAND_DEPTH = TANK_DEPTH + 0.4
/** Room floor height (the stand's feet rest here). */
export const ROOM_FLOOR_Y = STAND_TOP_Y - STAND_HEIGHT

export type StandStyle =
  | 'walnut'
  | 'arctic'
  | 'bubblegum'
  | 'racer'
  | 'pirate'
  | 'mermaid'
  | 'bamboo'
  | 'galaxy'
  | 'candy'

export interface StandDefinition {
  id: StandStyle
  name: string
  description: string
  cost: number
  unlockLevel: number
  rarity: Rarity
  styleTags: StyleTag[]
  /** Card gradient in the shop. */
  swatch: [string, string]
  icon: string
}

export const STAND_CATALOG: StandDefinition[] = [
  {
    id: 'walnut', name: 'Walnut Cabinet', cost: 0, unlockLevel: 1, rarity: 'common', styleTags: ['classic', 'neutral'],
    description: 'Warm dark wood with brass handles. A timeless classic.', swatch: ['#5a3b26', '#2b1d15'], icon: '🪵',
  },
  {
    id: 'arctic', name: 'Arctic Gloss', cost: 300, unlockLevel: 2, rarity: 'common', styleTags: ['neutral'],
    description: 'Glossy white panels, chrome handles and a cool glow underneath.', swatch: ['#f4f8fb', '#b9d3e2'], icon: '❄️',
  },
  {
    id: 'bubblegum', name: 'Bubblegum Vanity', cost: 420, unlockLevel: 3, rarity: 'uncommon', styleTags: ['sparkle'],
    description: 'Candy-pink lacquer, gold trim, heart handles and a ruffled skirt.', swatch: ['#ff8fc8', '#ffd6ec'], icon: '🎀',
  },
  {
    id: 'racer', name: 'Turbo Racer', cost: 420, unlockLevel: 3, rarity: 'uncommon', styleTags: ['adventure'],
    description: 'Jet black with racing stripes, chrome bolts and a checkered finish line.', swatch: ['#1b1d22', '#e2342d'], icon: '🏁',
  },
  {
    id: 'bamboo', name: 'Tiki Bamboo', cost: 500, unlockLevel: 4, rarity: 'uncommon', styleTags: ['nature', 'adventure'],
    description: 'Lashed bamboo poles and woven panels, straight from a beach hut.', swatch: ['#d8b56a', '#7d5a2c'], icon: '🌴',
  },
  {
    id: 'pirate', name: 'Pirate Treasure Chest', cost: 650, unlockLevel: 5, rarity: 'rare', styleTags: ['adventure'],
    description: 'Weathered planks, iron straps, rivets and a skull medallion. Arr!', swatch: ['#6b4a2c', '#2f2a26'], icon: '🏴‍☠️',
  },
  {
    id: 'mermaid', name: 'Mermaid Lagoon', cost: 650, unlockLevel: 5, rarity: 'rare', styleTags: ['sparkle'],
    description: 'Pastel lavender-to-teal panels with seashell handles and pearl trim.', swatch: ['#b79cff', '#6fe0d8'], icon: '🧜',
  },
  {
    id: 'galaxy', name: 'Space Station', cost: 1000, unlockLevel: 8, rarity: 'epic', styleTags: ['scifi'],
    description: 'Gunmetal hull plates with glowing control lights that blink in the dark.', swatch: ['#2a3140', '#38e1ff'], icon: '🚀',
  },
  {
    id: 'candy', name: 'Rainbow Candy', cost: 1000, unlockLevel: 8, rarity: 'epic', styleTags: ['sparkle'],
    description: 'Rainbow-striped doors, lollipop handles and gumdrop feet.', swatch: ['#ff6b9d', '#7dd3ff'], icon: '🍭',
  },
]

export const DEFAULT_STAND_ID: StandStyle = 'walnut'

export function getStandDef(id: string): StandDefinition {
  return STAND_CATALOG.find((s) => s.id === id) ?? STAND_CATALOG[0]
}
