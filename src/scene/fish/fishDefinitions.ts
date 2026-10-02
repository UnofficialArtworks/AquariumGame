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
  'comet-goldfish': { sizeRange: [0.86, 1.16], eggCountRange: [2, 5] },
  'golden-orfe': { sizeRange: [0.88, 1.15], eggCountRange: [2, 4] },
  'butterfly-koi': { sizeRange: [0.9, 1.15], eggCountRange: [1, 3] },
  arowana: { sizeRange: [0.9, 1.13], eggCountRange: [1, 2] },
  'nerite-snail': { sizeRange: [0.85, 1.16], eggCountRange: [1, 4] },
  'cherry-shrimp': { sizeRange: [0.8, 1.16], eggCountRange: [3, 6] },
  'moon-jelly': { sizeRange: [0.86, 1.16], eggCountRange: [1, 3] },
  seahorse: { sizeRange: [0.85, 1.14], eggCountRange: [1, 3] },
  axolotl: { sizeRange: [0.87, 1.16], eggCountRange: [1, 3] },
  'regal-tang': { sizeRange: [0.88, 1.14], eggCountRange: [1, 3] },
  'moorish-idol': { sizeRange: [0.88, 1.14], eggCountRange: [1, 3] },
  octopus: { sizeRange: [0.86, 1.16], eggCountRange: [1, 2] },
  flowerhorn: { sizeRange: [0.9, 1.16], eggCountRange: [1, 3] },
  'manta-ray': { sizeRange: [0.9, 1.12], eggCountRange: [1, 1] },
  'starry-pleco': { sizeRange: [0.88, 1.16], eggCountRange: [1, 3] },
  'sea-turtle': { sizeRange: [0.9, 1.12], eggCountRange: [1, 2] },
  'emperor-angelfish': { sizeRange: [0.9, 1.14], eggCountRange: [1, 2] },
  'dragon-koi': { sizeRange: [0.92, 1.12], eggCountRange: [1, 1] },
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
  // --- late game (levels 13-30): something new every level or two ---
  fish({
    id: 'regal-tang', name: 'Regal Tang', rarity: 'rare', cost: 480, unlockLevel: 14,
    description: 'Electric blue with a sunny yellow tail. Always on the move.',
    color: '#1f5fd6', color2: '#0d1530', color3: '#ffd23a', pattern: 'stripe', finStyle: 'lunate',
    bodyLength: 0.42, bodyHeight: 0.3, bodyWidth: 0.45, maxSpeed: 0.75, turnSpeed: 2.4, zone: 'middle', coinValue: 9,
  }),
  fish({
    id: 'moorish-idol', name: 'Moorish Idol', rarity: 'epic', cost: 1100, unlockLevel: 16,
    description: 'Bold bands and a long streamer fin trailing like a ribbon.',
    color: '#f6f1de', color2: '#141414', color3: '#ffd84a', pattern: 'bands', finStyle: 'forked', features: ['longFins', 'pointyNose'],
    bodyLength: 0.4, bodyHeight: 0.38, bodyWidth: 0.35, maxSpeed: 0.55, turnSpeed: 2, zone: 'middle', coinValue: 13,
  }),
  fish({
    kind: 'octopus', id: 'octopus', name: 'Octopus', rarity: 'epic', cost: 1300, unlockLevel: 17,
    description: 'Eight curious arms and a skin that changes colour. Explores every rock.',
    color: '#e2643f', color2: '#ffb48a', color3: '#7a2a2a', pattern: 'solid', finStyle: 'round',
    bodyLength: 0.5, bodyHeight: 0.25, maxSpeed: 0.35, turnSpeed: 1.8, zone: 'bottom', coinValue: 15,
  }),
  fish({
    id: 'flowerhorn', name: 'Flowerhorn', rarity: 'epic', cost: 1400, unlockLevel: 19,
    description: 'A big, bold cichlid with a proud head bump and glittering spots.',
    color: '#e8434f', color2: '#2a1a24', color3: '#ffcf5a', pattern: 'spots', finStyle: 'fan', features: ['hump'],
    bodyLength: 0.55, bodyHeight: 0.36, bodyWidth: 0.55, maxSpeed: 0.5, turnSpeed: 1.8, zone: 'middle', coinValue: 16, appetite: 1.2,
  }),
  fish({
    kind: 'ray', id: 'manta-ray', name: 'Manta Ray', rarity: 'legendary', cost: 2600, unlockLevel: 20,
    description: 'Glides through the tank on giant wings, as if it were flying.',
    color: '#2b3a52', color2: '#eef3f7', pattern: 'solid', finStyle: 'round',
    bodyLength: 0.9, bodyHeight: 0.1, maxSpeed: 0.5, turnSpeed: 1.2, zone: 'middle', coinValue: 22,
  }),
  fish({
    id: 'starry-pleco', name: 'Starry Pleco', rarity: 'epic', cost: 1700, unlockLevel: 22,
    description: 'Night-sky spots and a sucker mouth. Loves lounging on the gravel.',
    color: '#1d2430', color2: '#e9f2ff', pattern: 'spots', finStyle: 'round', features: ['whiskers'],
    bodyLength: 0.55, bodyHeight: 0.16, bodyWidth: 0.9, maxSpeed: 0.35, turnSpeed: 1.4, zone: 'bottom', coinValue: 18,
  }),
  fish({
    kind: 'turtle', id: 'sea-turtle', name: 'Sea Turtle', rarity: 'legendary', cost: 3000, unlockLevel: 24,
    description: 'A wise old swimmer that rows slowly along on huge flippers.',
    color: '#6b8f4e', color2: '#8a5a2e', color3: '#e0c48a', pattern: 'solid', finStyle: 'round',
    bodyLength: 0.7, bodyHeight: 0.25, maxSpeed: 0.35, turnSpeed: 1, zone: 'middle', coinValue: 24, appetite: 0.8,
  }),
  fish({
    id: 'emperor-angelfish', name: 'Emperor Angelfish', rarity: 'legendary', cost: 3200, unlockLevel: 26,
    description: 'Royal blue with gold stripes. Every reef wants one.',
    color: '#1a3fa8', color2: '#ffd83a', color3: '#ffffff', pattern: 'stripe', finStyle: 'round',
    bodyLength: 0.5, bodyHeight: 0.42, bodyWidth: 0.4, maxSpeed: 0.55, turnSpeed: 2, zone: 'middle', coinValue: 26,
  }),
  fish({
    id: 'dragon-koi', name: 'Celestial Dragon Koi', rarity: 'legendary', cost: 6000, unlockLevel: 30,
    description: 'The crown jewel of any tank. Its scales shimmer like the night sky.',
    color: '#f5f7ff', color2: '#6c4dff', color3: '#64f5ff', pattern: 'calico', finStyle: 'veil', features: ['whiskers', 'longFins'], glow: true,
    bodyLength: 0.7, bodyHeight: 0.3, bodyWidth: 0.6, maxSpeed: 0.6, turnSpeed: 1.8, zone: 'middle', coinValue: 40,
  }),
  // --- Koi Pond fish (they arrive in the pond, which opens at level 20) ---
  fish({
    id: 'comet-goldfish', name: 'Comet Goldfish', rarity: 'uncommon', cost: 420, unlockLevel: 20, pond: true,
    description: 'A speedy pond goldfish with a long, streaming comet tail.',
    color: '#ff5a2a', color2: '#fff2e6', pattern: 'calico', finStyle: 'veil', features: ['longFins'],
    bodyLength: 0.4, bodyHeight: 0.16, maxSpeed: 0.85, turnSpeed: 2.4, zone: 'top', coinValue: 10, appetite: 1.2,
  }),
  fish({
    id: 'golden-orfe', name: 'Golden Orfe', rarity: 'rare', cost: 900, unlockLevel: 21, pond: true,
    description: 'A sleek golden pond fish that loves to cruise near the surface in a group.',
    color: '#ffb02e', color2: '#ffe7a0', pattern: 'gradient', finStyle: 'forked', schooling: true,
    bodyLength: 0.46, bodyHeight: 0.15, maxSpeed: 0.75, turnSpeed: 2.1, zone: 'top', coinValue: 14,
  }),
  fish({
    id: 'butterfly-koi', name: 'Butterfly Koi', rarity: 'epic', cost: 2200, unlockLevel: 23, pond: true,
    description: 'Long, flowing fins like butterfly wings. The pride of any pond.',
    color: '#fbf6ee', color2: '#ff6a2a', color3: '#1b1b1b', pattern: 'calico', finStyle: 'veil', features: ['whiskers', 'longFins'],
    bodyLength: 0.62, bodyHeight: 0.24, maxSpeed: 0.5, turnSpeed: 1.6, zone: 'middle', coinValue: 22,
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
