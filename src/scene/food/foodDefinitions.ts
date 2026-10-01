export type FoodEffect = 'none' | 'hearts' | 'rainbow' | 'glow' | 'golden' | 'zoomies' | 'growth'
export type FoodVisual = 'pellet' | 'flake' | 'worm' | 'star' | 'shrimp' | 'orb'

export interface FoodDefinition {
  id: string
  name: string
  description: string
  icon: string
  /** Free staple foods never run out. Treats are bought in packs. */
  unlimited: boolean
  packCost: number
  packSize: number
  unlockLevel: number
  /** Pieces dropped per tap. */
  pieces: number
  /** Hunger removed per piece eaten. */
  nutrition: number
  /** Units per second while sinking. */
  sinkSpeed: number
  /** Seconds spent floating at the surface before sinking. */
  floatTime: number
  visual: FoodVisual
  color: string
  effect: FoodEffect
  effectSeconds: number
}

export const FOOD_CATALOG: FoodDefinition[] = [
  {
    id: 'pellets',
    name: 'Pellets',
    description: 'Everyday sinking pellets. Don’t overfeed — leftovers make the tank dirty!',
    icon: '🟤',
    unlimited: true,
    packCost: 0,
    packSize: 0,
    unlockLevel: 1,
    pieces: 5,
    nutrition: 0.2,
    sinkSpeed: 0.38,
    floatTime: 0.6,
    visual: 'pellet',
    color: '#c7863c',
    effect: 'none',
    effectSeconds: 0,
  },
  {
    id: 'flakes',
    name: 'Flakes',
    description: 'Light flakes that float and flutter slowly down. Great for top swimmers.',
    icon: '🍂',
    unlimited: true,
    packCost: 0,
    packSize: 0,
    unlockLevel: 1,
    pieces: 7,
    nutrition: 0.14,
    sinkSpeed: 0.16,
    floatTime: 4,
    visual: 'flake',
    color: '#e8a24a',
    effect: 'none',
    effectSeconds: 0,
  },
  {
    id: 'bloodworms',
    name: 'Bloodworms',
    description: 'Wriggly and irresistible. Very filling, and fish LOVE them.',
    icon: '🪱',
    unlimited: false,
    packCost: 40,
    packSize: 5,
    unlockLevel: 1,
    pieces: 4,
    nutrition: 0.45,
    sinkSpeed: 0.3,
    floatTime: 0.3,
    visual: 'worm',
    color: '#c2263a',
    effect: 'hearts',
    effectSeconds: 4,
  },
  {
    id: 'rainbow-flakes',
    name: 'Rainbow Flakes',
    description: 'Makes a fish shimmer through every color of the rainbow.',
    icon: '🌈',
    unlimited: false,
    packCost: 60,
    packSize: 3,
    unlockLevel: 2,
    pieces: 3,
    nutrition: 0.2,
    sinkSpeed: 0.18,
    floatTime: 2.5,
    visual: 'star',
    color: '#ff66cc',
    effect: 'rainbow',
    effectSeconds: 90,
  },
  {
    id: 'zoom-shrimp',
    name: 'Zoomies Shrimp',
    description: 'A spicy snack. The fish that eats it goes turbo, leaving a bubble trail!',
    icon: '🦐',
    unlimited: false,
    packCost: 70,
    packSize: 3,
    unlockLevel: 3,
    pieces: 1,
    nutrition: 0.3,
    sinkSpeed: 0.28,
    floatTime: 0.5,
    visual: 'shrimp',
    color: '#ff7f50',
    effect: 'zoomies',
    effectSeconds: 40,
  },
  {
    id: 'glow-bites',
    name: 'Glow Bites',
    description: 'Glow-in-the-dark plankton. The fish glows for minutes — try it at night!',
    icon: '✨',
    unlimited: false,
    packCost: 90,
    packSize: 3,
    unlockLevel: 4,
    pieces: 2,
    nutrition: 0.2,
    sinkSpeed: 0.22,
    floatTime: 1.5,
    visual: 'orb',
    color: '#5dfff0',
    effect: 'glow',
    effectSeconds: 180,
  },
  {
    id: 'golden-pellet',
    name: 'Golden Pellet',
    description: 'Turns a fish to gold for a minute — and it showers you with coins.',
    icon: '🪙',
    unlimited: false,
    packCost: 150,
    packSize: 2,
    unlockLevel: 5,
    pieces: 1,
    nutrition: 0.3,
    sinkSpeed: 0.3,
    floatTime: 0.8,
    visual: 'pellet',
    color: '#ffd24a',
    effect: 'golden',
    effectSeconds: 60,
  },
  {
    id: 'growth-formula',
    name: 'Mega Munch',
    description: 'Super-food that makes a fish grow noticeably bigger (and earn more).',
    icon: '💪',
    unlimited: false,
    packCost: 250,
    packSize: 2,
    unlockLevel: 7,
    pieces: 1,
    nutrition: 0.5,
    sinkSpeed: 0.26,
    floatTime: 0.6,
    visual: 'orb',
    color: '#8cff5a',
    effect: 'growth',
    effectSeconds: 0,
  },
]

export const STARTER_TREATS: Record<string, number> = {
  bloodworms: 3,
  'rainbow-flakes': 1,
  'zoom-shrimp': 1,
  'glow-bites': 1,
  'golden-pellet': 1,
}

export function getFoodDef(id: string): FoodDefinition {
  return FOOD_CATALOG.find((f) => f.id === id) ?? FOOD_CATALOG[0]
}
