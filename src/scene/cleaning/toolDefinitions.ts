import type { Rarity } from '../../state/types'

export type ToolCategory = 'glass' | 'gravel'
export type GlassToolLook = 'sponge' | 'squeegee' | 'magnet' | 'turbo'
export type GravelToolLook = 'siphon' | 'turbo' | 'hydro'

interface ToolBase {
  id: string
  name: string
  description: string
  cost: number
  unlockLevel: number
  rarity: Rarity
  icon: string
  /** One-line stat summary for the shop card. */
  stat: string
}

export interface GlassToolDef extends ToolBase {
  category: 'glass'
  look: GlassToolLook
  /** Half-extents of the cleaning head on the glass: along the wall, and vertical. */
  halfWidth: number
  halfHeight: number
  /** Algae removed per pass (grid units, 0..1 per cell). */
  strength: number
}

export interface GravelToolDef extends ToolBase {
  category: 'gravel'
  look: GravelToolLook
  /** Radius that sucks waste up instantly. */
  radius: number
  /** Extra radius that drags nearby waste toward the nozzle. */
  pullRadius: number
}

export type CleaningToolDef = GlassToolDef | GravelToolDef

export const TOOL_CATALOG: CleaningToolDef[] = [
  {
    id: 'sponge', category: 'glass', look: 'sponge', name: 'Sponge', icon: '🧽', rarity: 'common', cost: 0, unlockLevel: 1,
    description: 'A trusty scrubbing sponge.', stat: 'Small scrub area',
    halfWidth: 0.2, halfHeight: 0.14, strength: 0.24,
  },
  {
    id: 'squeegee', category: 'glass', look: 'squeegee', name: 'Pro Squeegee', icon: '🪟', rarity: 'uncommon', cost: 260, unlockLevel: 3,
    description: 'A wide rubber blade that wipes a whole stripe of glass in one swipe.', stat: '3× wider than the sponge',
    halfWidth: 0.58, halfHeight: 0.12, strength: 0.42,
  },
  {
    id: 'magnet', category: 'glass', look: 'magnet', name: 'Magnet Scrubber', icon: '🧲', rarity: 'rare', cost: 650, unlockLevel: 6,
    description: 'Two magnetic pads that hug the glass and scrub hard from both sides.', stat: 'Big head, strong scrub',
    halfWidth: 0.42, halfHeight: 0.38, strength: 0.65,
  },
  {
    id: 'turbo-scrubber', category: 'glass', look: 'turbo', name: 'Turbo Spin Scrubber', icon: '🌀', rarity: 'epic', cost: 1600, unlockLevel: 10,
    description: 'A motorized spinning pad that blasts algae off in a flurry of bubbles.', stat: 'Huge head, one-pass clean',
    halfWidth: 0.6, halfHeight: 0.56, strength: 1,
  },
  {
    id: 'vacuum', category: 'gravel', look: 'siphon', name: 'Gravel Vacuum', icon: '🫧', rarity: 'common', cost: 0, unlockLevel: 1,
    description: 'A classic siphon tube for sucking up waste.', stat: 'Small nozzle',
    radius: 0.34, pullRadius: 0.2,
  },
  {
    id: 'turbo-siphon', category: 'gravel', look: 'turbo', name: 'Turbo Siphon', icon: '🌪️', rarity: 'uncommon', cost: 380, unlockLevel: 4,
    description: 'A wider nozzle with a pump bulb that pulls nearby waste toward it.', stat: 'Wide nozzle + suction pull',
    radius: 0.5, pullRadius: 0.55,
  },
  {
    id: 'hydro-vac', category: 'gravel', look: 'hydro', name: 'Hydro-Vac 3000', icon: '🚀', rarity: 'epic', cost: 1300, unlockLevel: 9,
    description: 'A glowing power vacuum with a whirlpool that drags in every crumb nearby.', stat: 'Huge reach, whirlpool pull',
    radius: 0.7, pullRadius: 1.1,
  },
]

export const STARTER_TOOL_IDS = ['sponge', 'vacuum']
export const DEFAULT_GLASS_TOOL = 'sponge'
export const DEFAULT_GRAVEL_TOOL = 'vacuum'

export function getToolDef(id: string): CleaningToolDef | undefined {
  return TOOL_CATALOG.find((t) => t.id === id)
}

export function getGlassTool(id: string): GlassToolDef {
  const def = getToolDef(id)
  return def?.category === 'glass' ? def : (TOOL_CATALOG[0] as GlassToolDef)
}

export function getGravelTool(id: string): GravelToolDef {
  const def = getToolDef(id)
  return def?.category === 'gravel' ? def : (TOOL_CATALOG.find((t) => t.id === DEFAULT_GRAVEL_TOOL) as GravelToolDef)
}
