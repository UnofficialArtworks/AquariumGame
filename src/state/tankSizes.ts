// Bigger tanks: a long-term upgrade that gives decorations and fish more
// room. Each size is wider and deeper (the height stays the same, so the
// water line and swimming band don't change), and holds a few more fish
// (only a few: every fish costs about a dozen draw calls a frame). Owning a
// bigger tank counts as owning every smaller one. The nursery and the Koi
// Pond share the same water box, so they grow with it.
import { MAX_OWNED_FISH } from '../scene/fish/fishDefinitions'
import { setTankSize } from '../scene/TankBounds'

export interface TankSizeDefinition {
  id: string
  name: string
  description: string
  icon: string
  width: number
  depth: number
  cost: number
  unlockLevel: number
  /** Extra fish the aquarium holds at this size. */
  extraFish: number
}

export const TANK_SIZES: TankSizeDefinition[] = [
  { id: 'classic', name: 'Classic Tank', description: 'Where every aquarium begins.', icon: '🐠', width: 8, depth: 4, cost: 0, unlockLevel: 1, extraFish: 0 },
  { id: 'roomy', name: 'Roomy Tank', description: 'A wider, deeper tank with room for more decorations and a couple more friends.', icon: '🐟', width: 9.5, depth: 4.6, cost: 3000, unlockLevel: 8, extraFish: 2 },
  { id: 'grand', name: 'Grand Tank', description: 'A grand tank for a growing collection and big scenes.', icon: '🐬', width: 11, depth: 5.2, cost: 9000, unlockLevel: 16, extraFish: 4 },
  { id: 'panorama', name: 'Panorama Tank', description: 'A huge panoramic tank. Room for a whole reef!', icon: '🐋', width: 12.5, depth: 5.8, cost: 22000, unlockLevel: 24, extraFish: 5 },
]

export const DEFAULT_TANK_SIZE = TANK_SIZES[0].id

export function tankSizeIndex(id: string | undefined): number {
  return Math.max(0, TANK_SIZES.findIndex((t) => t.id === id))
}

export function getTankSize(id: string | undefined): TankSizeDefinition {
  return TANK_SIZES[tankSizeIndex(id)]
}

/** Resize the tank everything else reads (a no-op when it's already this size). */
export function applyTankSize(id: string | undefined) {
  const size = getTankSize(id)
  setTankSize(size.width, size.depth)
}

/** How many fish the main aquarium holds at this size. */
export function aquariumCapacity(tankSizeId: string | undefined): number {
  return MAX_OWNED_FISH + getTankSize(tankSizeId).extraFish
}
