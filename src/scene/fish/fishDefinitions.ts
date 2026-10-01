import type { FishDefinition } from '../../state/types'

type FishInput = Omit<FishDefinition, 'kind' | 'appetite' | 'sizeRange' | 'eggCountRange'> & Partial<Pick<FishDefinition, 'kind' | 'appetite'>>

/** Each species has its own adult size variation and possible clutch size. */
const SPECIES_TRAITS: Record<string, { sizeRange: [number, number]; eggCountRange: [number, number] }> = {
  goldfish: { sizeRange: [0.88, 1.16], eggCountRange: [2, 4] },
  guppy: { sizeRange: [0.82, 1.13], eggCountRange: [3, 5] },
  'neon-tetra': { sizeRange: [0.84, 1.12], eggCountRange: [4, 6] },
  'zebra-danio': { sizeRange: [0.84, 1.14], eggCountRange: [3, 6] },
  'cory-catfish': { sizeRange: [0.87, 1.16], eggCountRange: [2, 5] },
  platy: { sizeRange: [0.85, 1.15], eggCountRange: [3, 5] },
  molly: { sizeRange: [0.86, 1.17], eggCountRange: [2, 5] },
  damselfish: { sizeRange: [0.87, 1.14], eggCountRange: [2, 4] },
  clownfish: { sizeRange: [0.88, 1.16], eggCountRange: [2, 4] },
  swordtail: { sizeRange: [0.86, 1.15], eggCountRange: [2, 5] },
  rainbowfish: { sizeRange: [0.84, 1.14], eggCountRange: [3, 5] },
  betta: { sizeRange: [0.87, 1.17], eggCountRange: [1, 3] },
  angelfish: { sizeRange: [0.88, 1.16], eggCountRange: [1, 4] },
  oscar: { sizeRange: [0.89, 1.17], eggCountRange: [1, 3] },
  discus: { sizeRange: [0.88, 1.15], eggCountRange: [1, 4] },
  pufferfish: { sizeRange: [0.85, 1.16], eggCountRange: [1, 3] },
  parrotfish: { sizeRange: [0.88, 1.16], eggCountRange: [1, 3] },
  koi: { sizeRange: [0.89, 1.17], eggCountRange: [1, 3] },
  glowfin: { sizeRange: [0.85, 1.15], eggCountRange: [1, 4] },
  lionfish: { sizeRange: [0.88, 1.15], eggCountRange: [1, 2] },
  mandarin: { sizeRange: [0.83, 1.12], eggCountRange: [2, 4] },
  'reef-shark': { sizeRange: [0.9, 1.12], eggCountRange: [1, 2] },
  arowana: { sizeRange: [0.9, 1.13], eggCountRange: [1, 2] },
  'nerite-snail': { sizeRange: [0.85, 1.16], eggCountRange: [1, 4] },
  'cherry-shrimp': { sizeRange: [0.8, 1.16], eggCountRange: [3, 6] },
  'moon-jelly': { sizeRange: [0.86, 1.16], eggCountRange: [1, 3] },
  seahorse: { sizeRange: [0.85, 1.14], eggCountRange: [1, 3] },
  axolotl: { sizeRange: [0.87, 1.16], eggCountRange: [1, 3] },
}

function fish(input: FishInput): FishDefinition {
  return { kind: 'fish', appetite: 1, ...input, ...SPECIES_TRAITS[input.id] }
}

export const FISH_CATALOG: FishDefinition[] = [
  // --- common ---
  fish({
    id: 'goldfish', name: 'Goldfish', rarity: 'common', cost: 25, unlockLevel: 1,
    description: 'A classic! Always hungry, always happy to see you.',
    color: '#ff8a1e', color2: '#ffd98a', pattern: 'gradient', finStyle: 'fan', features: ['bigEyes'],
    bodyLength: 0.42, bodyHeight: 0.27, bodyWidth: 0.7, maxSpeed: 0.7, turnSpeed: 2.2, zone: 'middle', coinValue: 2, appetite: 1.3,
  }),
  fish({
    id: 'guppy', name: 'Guppy', rarity: 'common', cost: 20, unlockLevel: 1,
    description: 'Tiny body, huge colorful tail. Loves the top of the tank.',
    color: '#61c9ea', color2: '#ff6fb5', pattern: 'gradient', finStyle: 'fan',
    bodyLength: 0.26, bodyHeight: 0.13, maxSpeed: 0.95, turnSpeed: 2.9, zone: 'top', coinValue: 1,
  }),
  fish({
    id: 'neon-tetra', name: 'Neon Tetra', rarity: 'common', cost: 30, unlockLevel: 1,
    description: 'Glowing blue stripe. Swims in a school — get a few!',
    color: '#2b64d8', color2: '#ff3b4a', color3: '#3cf7ff', pattern: 'neon', finStyle: 'forked', glow: true, schooling: true,
    bodyLength: 0.2, bodyHeight: 0.09, maxSpeed: 1.2, turnSpeed: 3.6, zone: 'middle', coinValue: 1,
  }),
  fish({
    id: 'zebra-danio', name: 'Zebra Danio', rarity: 'common', cost: 30, unlockLevel: 2,
    description: 'Speedy striped zoomer that races around in groups.',
    color: '#e3e9f0', color2: '#27468c', pattern: 'stripe', finStyle: 'forked', schooling: true,
    bodyLength: 0.24, bodyHeight: 0.1, maxSpeed: 1.15, turnSpeed: 3.3, zone: 'top', coinValue: 1,
  }),
  fish({
    id: 'cory-catfish', name: 'Cory Catfish', rarity: 'common', cost: 50, unlockLevel: 2,
    description: 'Whiskery bottom-cleaner. Snaps up food that sinks to the gravel.',
    color: '#cdbb9b', color2: '#3a3226', pattern: 'spots', finStyle: 'forked', features: ['whiskers'], schooling: true,
    bodyLength: 0.24, bodyHeight: 0.13, bodyWidth: 0.8, maxSpeed: 0.55, turnSpeed: 2.4, zone: 'bottom', coinValue: 2,
  }),
  fish({
    id: 'platy', name: 'Sunset Platy', rarity: 'common', cost: 35, unlockLevel: 2,
    description: 'Glows like a sunset. Friendly with everyone.',
    color: '#ff6a2b', color2: '#ffd23f', pattern: 'gradient', finStyle: 'round',
    bodyLength: 0.25, bodyHeight: 0.15, maxSpeed: 0.85, turnSpeed: 2.7, zone: 'middle', coinValue: 2,
  }),
  fish({
    id: 'molly', name: 'Dalmatian Molly', rarity: 'common', cost: 45, unlockLevel: 3,
    description: 'Spotty like a puppy, twice as curious.',
    color: '#f4f4ef', color2: '#1b1b1b', pattern: 'spots', finStyle: 'round',
    bodyLength: 0.3, bodyHeight: 0.17, maxSpeed: 0.8, turnSpeed: 2.6, zone: 'middle', coinValue: 2,
  }),
  // --- uncommon ---
  fish({
    id: 'damselfish', name: 'Blue Damselfish', rarity: 'uncommon', cost: 70, unlockLevel: 3,
    description: 'Electric blue with a sunny yellow tail.',
    color: '#1f5bff', color2: '#ffd23f', pattern: 'gradient', finStyle: 'forked',
    bodyLength: 0.26, bodyHeight: 0.17, maxSpeed: 0.95, turnSpeed: 2.9, zone: 'middle', coinValue: 3,
  }),
  fish({
    id: 'clownfish', name: 'Clownfish', rarity: 'uncommon', cost: 90, unlockLevel: 3,
    description: 'Bold orange bands. Loves to snuggle into a sea anemone.',
    color: '#ff7417', color2: '#ffffff', color3: '#161616', pattern: 'bands', finStyle: 'round',
    bodyLength: 0.32, bodyHeight: 0.19, bodyWidth: 0.65, maxSpeed: 0.65, turnSpeed: 2.2, zone: 'middle', coinValue: 3,
  }),
  fish({
    id: 'swordtail', name: 'Swordtail', rarity: 'uncommon', cost: 90, unlockLevel: 4,
    description: 'Fiery red, with a tail shaped like a pirate’s sword.',
    color: '#e8412c', color2: '#ffb347', color3: '#1d1d1d', pattern: 'stripe', finStyle: 'sword',
    bodyLength: 0.3, bodyHeight: 0.14, maxSpeed: 0.9, turnSpeed: 2.6, zone: 'middle', coinValue: 3,
  }),
  fish({
    id: 'rainbowfish', name: 'Rainbowfish', rarity: 'uncommon', cost: 110, unlockLevel: 4,
    description: 'Blue up front, orange out back. Schools in a shimmering crowd.',
    color: '#3a5bd9', color2: '#ff8a1c', pattern: 'gradient', finStyle: 'forked', schooling: true,
    bodyLength: 0.3, bodyHeight: 0.16, maxSpeed: 1.0, turnSpeed: 2.9, zone: 'middle', coinValue: 3,
  }),
  fish({
    id: 'betta', name: 'Betta', rarity: 'uncommon', cost: 150, unlockLevel: 5,
    description: 'Royal flowing fins that ripple like silk.',
    color: '#3b2fd6', color2: '#ff2a9d', pattern: 'scales', finStyle: 'veil',
    bodyLength: 0.3, bodyHeight: 0.17, maxSpeed: 0.55, turnSpeed: 2.0, zone: 'top', coinValue: 4,
  }),
  // --- rare ---
  fish({
    id: 'angelfish', name: 'Angelfish', rarity: 'rare', cost: 220, unlockLevel: 6,
    description: 'Tall, elegant and striped, with long trailing fins.',
    color: '#ebe8e2', color2: '#232323', pattern: 'bands', finStyle: 'lunate', features: ['longFins'],
    bodyLength: 0.3, bodyHeight: 0.3, bodyWidth: 0.35, maxSpeed: 0.5, turnSpeed: 1.8, zone: 'middle', coinValue: 5,
  }),
  fish({
    id: 'oscar', name: 'Tiger Oscar', rarity: 'rare', cost: 300, unlockLevel: 7,
    description: 'A big personality with fiery tiger markings.',
    color: '#2e2a26', color2: '#ff7a1a', pattern: 'tiger', finStyle: 'round', features: ['bigEyes'],
    bodyLength: 0.46, bodyHeight: 0.3, maxSpeed: 0.55, turnSpeed: 1.7, zone: 'middle', coinValue: 6, appetite: 1.3,
  }),
  fish({
    id: 'discus', name: 'Discus', rarity: 'rare', cost: 350, unlockLevel: 8,
    description: 'A living dinner plate of swirling turquoise and red.',
    color: '#e0473a', color2: '#35c2e0', pattern: 'tiger', finStyle: 'round',
    bodyLength: 0.34, bodyHeight: 0.36, bodyWidth: 0.35, maxSpeed: 0.45, turnSpeed: 1.7, zone: 'middle', coinValue: 6,
  }),
  fish({
    id: 'pufferfish', name: 'Pufferfish', rarity: 'rare', cost: 380, unlockLevel: 8,
    description: 'Tap the glass near it and it puffs up into a spiky ball!',
    color: '#e8d47c', color2: '#5a4b2a', pattern: 'spots', finStyle: 'round', features: ['spikes', 'bigEyes'],
    bodyLength: 0.3, bodyHeight: 0.24, bodyWidth: 0.95, maxSpeed: 0.42, turnSpeed: 1.6, zone: 'middle', coinValue: 7,
  }),
  fish({
    id: 'parrotfish', name: 'Parrotfish', rarity: 'rare', cost: 420, unlockLevel: 9,
    description: 'Candy-colored scales and a beak like a parrot.',
    color: '#1fc4a6', color2: '#ff6ec7', pattern: 'scales', finStyle: 'lunate', features: ['beak'],
    bodyLength: 0.42, bodyHeight: 0.24, maxSpeed: 0.6, turnSpeed: 1.9, zone: 'middle', coinValue: 7,
  }),
  // --- epic ---
  fish({
    id: 'koi', name: 'Koi', rarity: 'epic', cost: 650, unlockLevel: 10,
    description: 'A graceful lucky fish with one-of-a-kind patches.',
    color: '#f7f4ee', color2: '#ff4d1f', color3: '#1b1b1b', pattern: 'calico', finStyle: 'fan', features: ['whiskers'],
    bodyLength: 0.6, bodyHeight: 0.24, maxSpeed: 0.5, turnSpeed: 1.5, zone: 'middle', coinValue: 9,
  }),
  fish({
    id: 'glowfin', name: 'Neon Glowfin', rarity: 'epic', cost: 800, unlockLevel: 11,
    description: 'A deep-sea marvel with glowing fins. Spectacular at night.',
    color: '#1a1245', color2: '#39f5ff', color3: '#ff3bd4', pattern: 'neon', finStyle: 'veil', glow: true,
    bodyLength: 0.36, bodyHeight: 0.18, maxSpeed: 0.7, turnSpeed: 2.2, zone: 'any', coinValue: 9,
  }),
  fish({
    id: 'lionfish', name: 'Lionfish', rarity: 'epic', cost: 900, unlockLevel: 12,
    description: 'Striped and spiky with a mane of feathery fins.',
    color: '#f5e6d8', color2: '#b3261e', pattern: 'bands', finStyle: 'fan', features: ['spines'],
    bodyLength: 0.38, bodyHeight: 0.24, maxSpeed: 0.4, turnSpeed: 1.6, zone: 'middle', coinValue: 11,
  }),
  fish({
    id: 'mandarin', name: 'Mandarin Dragonet', rarity: 'epic', cost: 1000, unlockLevel: 13,
    description: 'The most psychedelic fish in the sea. Hangs out near the bottom.',
    color: '#ff7b1c', color2: '#1c6bff', pattern: 'tiger', finStyle: 'fan', features: ['bigEyes'],
    bodyLength: 0.28, bodyHeight: 0.14, bodyWidth: 0.9, maxSpeed: 0.45, turnSpeed: 2.0, zone: 'bottom', coinValue: 10,
  }),
  // --- legendary ---
  fish({
    id: 'reef-shark', name: 'Reef Shark', rarity: 'legendary', cost: 1500, unlockLevel: 15,
    description: 'The king of the tank. (Don’t worry — it’s a gentle giant.)',
    color: '#8a96a3', color2: '#eef2f5', pattern: 'solid', finStyle: 'shark', features: ['pointyNose'],
    bodyLength: 0.85, bodyHeight: 0.24, bodyWidth: 0.8, maxSpeed: 0.75, turnSpeed: 1.3, zone: 'middle', coinValue: 14, appetite: 1.4,
  }),
  fish({
    id: 'arowana', name: 'Golden Arowana', rarity: 'legendary', cost: 2500, unlockLevel: 18,
    description: 'The legendary dragon fish. Its golden scales bring good fortune.',
    color: '#ffc02e', color2: '#fff0a0', pattern: 'scales', finStyle: 'round', features: ['whiskers'],
    bodyLength: 0.9, bodyHeight: 0.22, bodyWidth: 0.55, maxSpeed: 0.6, turnSpeed: 1.3, zone: 'top', coinValue: 18,
  }),
  // --- special creatures ---
  fish({
    kind: 'snail', id: 'nerite-snail', name: 'Nerite Snail', rarity: 'uncommon', cost: 60, unlockLevel: 2,
    description: 'Cleanup crew! Crawls along the glass munching algae.',
    color: '#3a2716', color2: '#e8c04a', pattern: 'stripe', finStyle: 'round',
    bodyLength: 0.16, bodyHeight: 0.12, maxSpeed: 0.08, turnSpeed: 1, zone: 'bottom', coinValue: 0, appetite: 0,
  }),
  fish({
    kind: 'shrimp', id: 'cherry-shrimp', name: 'Cherry Shrimp', rarity: 'uncommon', cost: 70, unlockLevel: 3,
    description: 'Cleanup crew! Scurries over the gravel eating leftovers and waste.',
    color: '#e8233a', color2: '#ff8a8a', pattern: 'solid', finStyle: 'round',
    bodyLength: 0.14, bodyHeight: 0.06, maxSpeed: 0.3, turnSpeed: 3, zone: 'bottom', coinValue: 0, appetite: 0,
  }),
  fish({
    kind: 'jellyfish', id: 'moon-jelly', name: 'Moon Jellyfish', rarity: 'rare', cost: 350, unlockLevel: 6,
    description: 'Pulses gently through the water. Glows beautifully at night.',
    color: '#c7ecff', color2: '#ff9de0', pattern: 'solid', finStyle: 'round', glow: true,
    bodyLength: 0.4, bodyHeight: 0.3, maxSpeed: 0.2, turnSpeed: 0.8, zone: 'any', coinValue: 5, appetite: 0.6,
  }),
  fish({
    kind: 'seahorse', id: 'seahorse', name: 'Seahorse', rarity: 'rare', cost: 400, unlockLevel: 7,
    description: 'Swims standing up, fluttering its tiny back fin.',
    color: '#ffab40', color2: '#ffe08a', pattern: 'solid', finStyle: 'round',
    bodyLength: 0.4, bodyHeight: 0.2, maxSpeed: 0.18, turnSpeed: 1.2, zone: 'middle', coinValue: 6, appetite: 0.8,
  }),
  fish({
    kind: 'axolotl', id: 'axolotl', name: 'Axolotl', rarity: 'epic', cost: 750, unlockLevel: 9,
    description: 'A smiling salamander with frilly gills. Wanders the gravel.',
    color: '#ffb8cb', color2: '#ff4f86', pattern: 'solid', finStyle: 'round',
    bodyLength: 0.55, bodyHeight: 0.14, maxSpeed: 0.3, turnSpeed: 1.6, zone: 'bottom', coinValue: 8,
  }),
]

export const STARTER_FISH_IDS = ['goldfish', 'guppy', 'neon-tetra']
export const MAX_OWNED_FISH = 30

/** Old save ids that were renamed. */
const FISH_ID_ALIASES: Record<string, string> = { catfish: 'cory-catfish' }

export function resolveFishId(defId: string): string {
  return FISH_ID_ALIASES[defId] ?? defId
}

export function getFishDef(defId: string): FishDefinition | undefined {
  const id = resolveFishId(defId)
  return FISH_CATALOG.find((f) => f.id === id)
}

export function sampleFishSize(defId: string): number {
  const [min, max] = getFishDef(defId)?.sizeRange ?? [1, 1]
  return min + Math.random() * (max - min)
}

export function isCleanupCrew(def: FishDefinition): boolean {
  return def.kind === 'snail' || def.kind === 'shrimp'
}
