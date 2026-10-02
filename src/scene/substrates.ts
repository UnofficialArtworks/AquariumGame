export interface SubstrateDefinition {
  id: string
  name: string
  description: string
  cost: number
  unlockLevel: number
  /** Sand color under the pebbles, plus a second tone mixed in by noise. */
  base: string
  baseAlt: string
  pebbleColors: string[]
  pebbleScale: number
  /** Pebbles glow in the dark (bloom picks them up at night). */
  glow?: boolean
}

export const SUBSTRATE_CATALOG: SubstrateDefinition[] = [
  {
    id: 'natural-sand',
    name: 'Natural Sand',
    description: 'Soft golden sand with river stones.',
    cost: 0,
    unlockLevel: 1,
    base: '#d8c39a',
    baseAlt: '#bfa47a',
    pebbleColors: ['#cdb68e', '#a58a67', '#8d8378', '#e0d2b4', '#7a6a58'],
    pebbleScale: 1,
  },
  {
    id: 'river-pebbles',
    name: 'River Pebbles',
    description: 'Chunky smooth stones in cool greys and rust.',
    cost: 250,
    unlockLevel: 3,
    base: '#8e8a82',
    baseAlt: '#6f6a62',
    pebbleColors: ['#9a958c', '#6d6a66', '#b08563', '#c9c3b6', '#54524f', '#8c5d44'],
    pebbleScale: 1.6,
  },
  {
    id: 'white-coral-sand',
    name: 'White Coral Sand',
    description: 'Bright tropical sand with pink shell bits.',
    cost: 400,
    unlockLevel: 5,
    base: '#f2eee4',
    baseAlt: '#e3dccb',
    pebbleColors: ['#ffffff', '#f7d6d9', '#f0e6d2', '#ffc3cf', '#e8e1d0'],
    pebbleScale: 0.8,
  },
  {
    id: 'black-sand',
    name: 'Volcanic Black Sand',
    description: 'Dramatic black sand that makes colorful fish pop.',
    cost: 500,
    unlockLevel: 6,
    base: '#232327',
    baseAlt: '#16161a',
    pebbleColors: ['#2e2e33', '#1c1c20', '#45454c', '#8a8a92', '#3a2a28'],
    pebbleScale: 1.1,
  },
  {
    id: 'rainbow-gravel',
    name: 'Rainbow Gravel',
    description: 'Every color at once. Why choose?',
    cost: 600,
    unlockLevel: 8,
    base: '#e9e4f5',
    baseAlt: '#d4cde8',
    pebbleColors: ['#ff5d8f', '#ffb13d', '#ffe74c', '#4cd97b', '#3db8ff', '#8f6bff', '#ff7ae0'],
    pebbleScale: 1.15,
  },
  {
    id: 'glow-pebbles',
    name: 'Glow Pebbles',
    description: 'Charges in the light, glows in the dark. Try night mode!',
    cost: 1200,
    unlockLevel: 12,
    base: '#1b2233',
    baseAlt: '#121827',
    pebbleColors: ['#3dffd0', '#58b8ff', '#c46bff', '#6dff7a', '#ff6bd6'],
    pebbleScale: 1.05,
    glow: true,
  },
  {
    id: 'pearl-sand',
    name: 'Pink Pearl Sand',
    description: 'Blush-pink sand scattered with real-looking pearls.',
    cost: 1800,
    unlockLevel: 27,
    base: '#f3d9dc',
    baseAlt: '#e6c2c8',
    pebbleColors: ['#fff8f2', '#f7e6ea', '#ffd9e4', '#e9d8f2', '#fdf3d8'],
    pebbleScale: 0.9,
  },
  {
    id: 'treasure-sand',
    name: 'Treasure Sand',
    description: 'Golden sand glittering with sunken coins and gems. Lights up at night.',
    cost: 2500,
    unlockLevel: 29,
    base: '#d9b25a',
    baseAlt: '#c39a40',
    pebbleColors: ['#ffd54a', '#ffe58a', '#f2b632', '#4fd6ff', '#ff5d8f', '#6dff9a'],
    pebbleScale: 0.95,
    glow: true,
  },
]

export const DEFAULT_SUBSTRATE_ID = 'natural-sand'

export function getSubstrateDef(id: string): SubstrateDefinition {
  return SUBSTRATE_CATALOG.find((s) => s.id === id) ?? SUBSTRATE_CATALOG[0]
}
