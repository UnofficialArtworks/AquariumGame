export interface BackgroundDefinition {
  id: string
  name: string
  description: string
  cost: number
  unlockLevel: number
  /** Index into the background shader's style switch. */
  style: number
  /** Swatch colors for the shop card (top, bottom). */
  swatch: [string, string]
}

export const BACKGROUND_CATALOG: BackgroundDefinition[] = [
  {
    id: 'ocean-blue',
    name: 'Open Ocean',
    description: 'Sunbeams over distant rocky hills.',
    cost: 0,
    unlockLevel: 1,
    style: 0,
    swatch: ['#2a8fc4', '#0b3a66'],
  },
  {
    id: 'coral-reef',
    name: 'Coral Reef',
    description: 'A bright, busy reef stretching into the blue.',
    cost: 300,
    unlockLevel: 2,
    style: 1,
    swatch: ['#35c2e0', '#e36a9a'],
  },
  {
    id: 'kelp-forest',
    name: 'Kelp Forest',
    description: 'Towering kelp swaying in green light.',
    cost: 350,
    unlockLevel: 4,
    style: 2,
    swatch: ['#58b89a', '#0f3b2c'],
  },
  {
    id: 'sunset-lagoon',
    name: 'Sunset Lagoon',
    description: 'Golden hour, forever.',
    cost: 450,
    unlockLevel: 5,
    style: 4,
    swatch: ['#ffa35c', '#4a2168'],
  },
  {
    id: 'bubblegum-dream',
    name: 'Bubblegum Dream',
    description: 'Pastel skies full of floating bubbles.',
    cost: 450,
    unlockLevel: 6,
    style: 6,
    swatch: ['#ffc2e2', '#b8f2e6'],
  },
  {
    id: 'deep-abyss',
    name: 'Deep Abyss',
    description: 'Pitch black, twinkling with glowing creatures. Amazing at night.',
    cost: 700,
    unlockLevel: 9,
    style: 3,
    swatch: ['#07163a', '#02060f'],
  },
  {
    id: 'volcano-vents',
    name: 'Volcanic Vents',
    description: 'Glowing lava cracks and drifting embers.',
    cost: 900,
    unlockLevel: 11,
    style: 7,
    swatch: ['#5a1a0e', '#ff7a1a'],
  },
  {
    id: 'outer-space',
    name: 'Outer Space',
    description: 'Who says fish can’t be astronauts?',
    cost: 1100,
    unlockLevel: 14,
    style: 5,
    swatch: ['#2a1150', '#05030d'],
  },
]

export const DEFAULT_BACKGROUND_ID = 'ocean-blue'

export function getBackgroundDef(id: string): BackgroundDefinition {
  return BACKGROUND_CATALOG.find((b) => b.id === id) ?? BACKGROUND_CATALOG[0]
}
