import type { DecorationDefinition } from '../../state/types'

export type DecorationKind =
  | 'rocks'
  | 'driftwood'
  | 'fern'
  | 'grass'
  | 'kelp'
  | 'lily'
  | 'staghorn'
  | 'brain'
  | 'seafan'
  | 'anemone'
  | 'crystals'
  | 'shells'
  | 'clam'
  | 'palace'
  | 'arch'
  | 'mushrooms'
  | 'castle'
  | 'ruins'
  | 'tiki'
  | 'chest'
  | 'shipwreck'
  | 'anchor'
  | 'skull'
  | 'jaws'
  | 'diver'
  | 'submarine'
  | 'volcano'
  | 'ufo'
  | 'airstone'
  // Late-game centrepieces (builders/legends.ts).
  | 'citygate'
  | 'glowcave'
  | 'atlantis'
  | 'geode'
  // Gadgets: decorations with a passive bonus.
  | 'feeder'
  | 'marimo'
  | 'filter'
  | 'fountain'
  | 'growlamp'
  // Seasonal pieces (builders/seasonal.ts).
  | 'pumpkin'
  | 'snowman'

export interface DecorationCatalogEntry extends DecorationDefinition {
  kind: DecorationKind
  color: string
  accentColor: string
}

export const DECORATION_CATALOG: DecorationCatalogEntry[] = [
  // --- nature ---
  {
    id: 'rock-cluster', name: 'River Rocks', kind: 'rocks', rarity: 'common', cost: 30, unlockLevel: 1,
    description: 'Smooth stones with a little moss on top.',
    styleTags: ['neutral', 'nature'], footprintRadius: 0.5, height: 0.5, color: '#8f8a84', accentColor: '#5f8a3a',
  },
  {
    id: 'driftwood', name: 'Driftwood', kind: 'driftwood', rarity: 'common', cost: 30, unlockLevel: 1,
    description: 'Twisty sunken branches, great for hiding.',
    styleTags: ['neutral', 'nature'], footprintRadius: 0.6, height: 0.8, color: '#7a5236', accentColor: '#4f8a3a',
  },
  {
    id: 'green-plant', name: 'Java Fern', kind: 'fern', rarity: 'common', cost: 40, unlockLevel: 1,
    description: 'Leafy and lush. Sways in the current.',
    styleTags: ['nature'], footprintRadius: 0.35, height: 0.9, color: '#2f9e44', accentColor: '#7ed957',
  },
  {
    id: 'hair-grass', name: 'Hair Grass Meadow', kind: 'grass', rarity: 'common', cost: 35, unlockLevel: 1,
    description: 'A soft carpet of swaying grass.',
    styleTags: ['nature'], footprintRadius: 0.45, height: 0.35, color: '#4fbf45', accentColor: '#b6f27a',
  },
  {
    id: 'coral-reef', name: 'Staghorn Coral', kind: 'staghorn', rarity: 'common', cost: 60, unlockLevel: 2,
    description: 'Branching orange coral like antlers.',
    styleTags: ['nature'], footprintRadius: 0.45, height: 0.85, color: '#ff7a45', accentColor: '#ffd0a8',
  },
  {
    id: 'brain-coral', name: 'Brain Coral', kind: 'brain', rarity: 'uncommon', cost: 110, unlockLevel: 4,
    description: 'A big bumpy dome with twisty grooves.',
    styleTags: ['nature'], footprintRadius: 0.4, height: 0.45, color: '#d1b04a', accentColor: '#7d6420',
  },
  {
    id: 'tall-kelp', name: 'Giant Kelp', kind: 'kelp', rarity: 'uncommon', cost: 120, unlockLevel: 3,
    description: 'Towering ribbons that reach all the way to the surface.',
    styleTags: ['nature'], footprintRadius: 0.3, height: 3.6, color: '#7a9a2e', accentColor: '#c9b24a',
  },
  {
    id: 'flower-plant', name: 'Water Lily', kind: 'lily', rarity: 'uncommon', cost: 150, unlockLevel: 4,
    description: 'Stems stretch up to lily pads with a blossom on the surface.',
    styleTags: ['nature', 'sparkle'], footprintRadius: 0.3, height: 4, color: '#3e9e4a', accentColor: '#ff8fc7',
  },
  {
    id: 'sea-anemone', name: 'Sea Anemone', kind: 'anemone', rarity: 'rare', cost: 250, unlockLevel: 5,
    description: 'Wiggly glowing tentacles. Clownfish love it!',
    styleTags: ['nature', 'sparkle'], footprintRadius: 0.35, height: 0.55, color: '#ff8a5c', accentColor: '#9dfff0',
  },
  {
    id: 'sea-fan', name: 'Purple Sea Fan', kind: 'seafan', rarity: 'rare', cost: 220, unlockLevel: 6,
    description: 'A lacy fan of coral that ripples gently.',
    styleTags: ['nature', 'sparkle'], footprintRadius: 0.35, height: 1.15, color: '#9b4dff', accentColor: '#e0b8ff',
  },
  // --- sparkle ---
  {
    id: 'seashell-cluster', name: 'Starfish & Shells', kind: 'shells', rarity: 'common', cost: 45, unlockLevel: 1,
    description: 'Pretty shells and a friendly starfish.',
    styleTags: ['sparkle'], footprintRadius: 0.4, height: 0.2, color: '#ffc2d4', accentColor: '#ff8a3d',
  },
  {
    id: 'sparkle-coral', name: 'Bubblegum Coral', kind: 'staghorn', rarity: 'uncommon', cost: 80, unlockLevel: 3,
    description: 'Pink coral with glowing tips.',
    styleTags: ['sparkle'], footprintRadius: 0.45, height: 0.85, color: '#ff5fb5', accentColor: '#ffd1f0',
  },
  {
    id: 'gem-rock', name: 'Crystal Cluster', kind: 'crystals', rarity: 'uncommon', cost: 140, unlockLevel: 3,
    description: 'Glowing gemstones. They really shine at night.',
    styleTags: ['sparkle'], footprintRadius: 0.4, height: 0.75, color: '#b36bff', accentColor: '#6be4ff',
  },
  {
    id: 'giant-clam', name: 'Giant Clam', kind: 'clam', rarity: 'rare', cost: 300, unlockLevel: 6,
    description: 'Opens up to reveal a glowing pearl, puffing bubbles. Tap it!',
    styleTags: ['sparkle', 'adventure'], footprintRadius: 0.45, height: 0.45, color: '#7f74d6', accentColor: '#fff4fb',
  },
  {
    id: 'rainbow-arch', name: 'Rainbow Arch', kind: 'arch', rarity: 'rare', cost: 350, unlockLevel: 7,
    description: 'A rainbow for your fish to swim under.',
    styleTags: ['sparkle'], footprintRadius: 0.65, height: 1.2, color: '#ff5d8f', accentColor: '#ffffff',
  },
  {
    id: 'glow-mushrooms', name: 'Glow Mushrooms', kind: 'mushrooms', rarity: 'rare', cost: 380, unlockLevel: 8,
    description: 'Bioluminescent mushrooms that pulse softly in the dark.',
    styleTags: ['sparkle', 'nature'], footprintRadius: 0.4, height: 0.6, color: '#5dffea', accentColor: '#ff6bd6',
  },
  {
    id: 'crystal-palace', name: 'Crystal Palace', kind: 'palace', rarity: 'epic', cost: 900, unlockLevel: 10,
    description: 'Pastel spires and glowing windows fit for royalty.',
    styleTags: ['sparkle', 'classic'], footprintRadius: 0.65, height: 1.7, color: '#f1dcff', accentColor: '#8fd8ff',
  },
  // --- classic ---
  {
    id: 'air-stone', name: 'Bubble Stone', kind: 'airstone', rarity: 'common', cost: 50, unlockLevel: 1,
    description: 'Pumps out a sparkling stream of bubbles.',
    styleTags: ['neutral', 'classic'], footprintRadius: 0.2, height: 0.15, color: '#6a6f75', accentColor: '#bfe6ff',
  },
  {
    id: 'classic-castle', name: 'Classic Castle', kind: 'castle', rarity: 'uncommon', cost: 120, unlockLevel: 2,
    description: 'Towers, battlements, and a doorway to swim through.',
    styleTags: ['classic'], footprintRadius: 0.65, height: 1.5, color: '#d6b67e', accentColor: '#9c3b3b',
  },
  {
    id: 'tiki-head', name: 'Tiki Head', kind: 'tiki', rarity: 'uncommon', cost: 180, unlockLevel: 5,
    description: 'A mysterious carved head. Its eyes glow at night…',
    styleTags: ['adventure', 'classic'], footprintRadius: 0.4, height: 1.05, color: '#7a5a3a', accentColor: '#ffb347',
  },
  {
    id: 'temple-ruins', name: 'Sunken Temple', kind: 'ruins', rarity: 'rare', cost: 320, unlockLevel: 7,
    description: 'Ancient columns from a lost underwater city.',
    styleTags: ['classic', 'adventure'], footprintRadius: 0.75, height: 1.35, color: '#e6dfcd', accentColor: '#6fae5a',
  },
  // --- adventure ---
  {
    id: 'anchor', name: 'Old Anchor', kind: 'anchor', rarity: 'common', cost: 60, unlockLevel: 2,
    description: 'A rusty anchor with a length of chain.',
    styleTags: ['adventure'], footprintRadius: 0.4, height: 0.95, color: '#4a4d52', accentColor: '#9a5a32',
  },
  {
    id: 'treasure-chest', name: 'Treasure Chest', kind: 'chest', rarity: 'uncommon', cost: 100, unlockLevel: 2,
    description: 'Pops open with a burst of bubbles and gold. Tap it!',
    styleTags: ['classic', 'adventure'], footprintRadius: 0.4, height: 0.55, color: '#8b5a2b', accentColor: '#ffd24a',
  },
  {
    id: 'skull', name: 'Skull Rock', kind: 'skull', rarity: 'uncommon', cost: 150, unlockLevel: 4,
    description: 'A spooky giant skull with solid glowing eye sockets.',
    styleTags: ['adventure'], footprintRadius: 0.5, height: 0.85, color: '#e8e2cc', accentColor: '#ff3b3b',
  },
  {
    id: 'diver-helmet', name: 'Diver Helmet', kind: 'diver', rarity: 'rare', cost: 280, unlockLevel: 6,
    description: 'A brass diving helmet with a glowing porthole and bubbles.',
    styleTags: ['adventure', 'classic'], footprintRadius: 0.45, height: 0.85, color: '#c99a45', accentColor: '#9fe8ff',
  },
  {
    id: 'shark-decoy', name: 'Megalodon Jaws', kind: 'jaws', rarity: 'rare', cost: 400, unlockLevel: 8,
    description: 'The giant jaws of a prehistoric shark. Swim through if you dare!',
    styleTags: ['adventure'], footprintRadius: 0.6, height: 1, color: '#efe8d6', accentColor: '#c9b89a',
  },
  {
    id: 'shipwreck', name: 'Pirate Shipwreck', kind: 'shipwreck', rarity: 'epic', cost: 700, unlockLevel: 9,
    description: 'A broken pirate ship with a tattered sail and a spooky lantern.',
    styleTags: ['adventure'], footprintRadius: 0.95, height: 1.6, color: '#6b4f35', accentColor: '#ffb347',
  },
  {
    id: 'submarine', name: 'Yellow Submarine', kind: 'submarine', rarity: 'epic', cost: 850, unlockLevel: 11,
    description: 'Spinning propeller, glowing portholes, and a periscope.',
    styleTags: ['adventure', 'scifi'], footprintRadius: 0.85, height: 0.95, color: '#ffd23f', accentColor: '#8fe3ff',
  },
  {
    id: 'volcano', name: 'Bubbling Volcano', kind: 'volcano', rarity: 'epic', cost: 1000, unlockLevel: 12,
    description: 'Glowing lava cracks and a steady plume of bubbles.',
    styleTags: ['adventure'], footprintRadius: 0.75, height: 1.25, color: '#3b2b28', accentColor: '#ff5a1a',
  },
  {
    id: 'crashed-ufo', name: 'Crashed UFO', kind: 'ufo', rarity: 'legendary', cost: 1800, unlockLevel: 16,
    description: 'Something landed in your tank… and its lights are still blinking.',
    styleTags: ['scifi', 'adventure'], footprintRadius: 0.8, height: 0.85, color: '#b8c4d0', accentColor: '#6bff9a',
  },
  // --- late-game centrepieces ---
  {
    id: 'sunken-gate', name: 'Sunken City Gate', kind: 'citygate', rarity: 'epic', cost: 2000, unlockLevel: 21,
    description: 'A carved stone gateway from a lost city, its runes still faintly glowing.',
    styleTags: ['adventure', 'classic'], footprintRadius: 0.75, height: 1.15, color: '#d8cdb4', accentColor: '#3fd3c8',
  },
  {
    id: 'glow-cave', name: 'Glow Cave', kind: 'glowcave', rarity: 'epic', cost: 2400, unlockLevel: 23,
    description: 'A rocky grotto lined with crystals that light up after dark.',
    styleTags: ['nature', 'sparkle'], footprintRadius: 0.85, height: 0.9, color: '#4a4458', accentColor: '#7cf0ff',
  },
  {
    id: 'atlantis-palace', name: 'Atlantis Palace', kind: 'atlantis', rarity: 'legendary', cost: 4000, unlockLevel: 25,
    description: 'Golden domes and marble columns around a glowing orb. Fish feel rich just looking at it.',
    styleTags: ['classic', 'sparkle'], footprintRadius: 1, height: 1.5, color: '#e9e2cf', accentColor: '#ffd36a',
    bonus: { kind: 'coins', amount: 0.45, label: '+45% coin bubbles' },
  },
  {
    id: 'giant-geode', name: 'Giant Geode', kind: 'geode', rarity: 'legendary', cost: 3500, unlockLevel: 28,
    description: 'A huge cracked-open stone, its hollow heart packed with violet crystals.',
    styleTags: ['sparkle', 'nature'], footprintRadius: 0.65, height: 0.75, color: '#6d5a7a', accentColor: '#c58cff',
  },
  // --- gadgets (passive bonuses while placed) ---
  {
    id: 'marimo-moss', name: 'Marimo Moss Balls', kind: 'marimo', rarity: 'uncommon', cost: 220, unlockLevel: 3,
    description: 'Fuzzy green moss balls that soak up nutrients algae love.',
    styleTags: ['nature'], footprintRadius: 0.4, height: 0.3, color: '#3f8f3a', accentColor: '#9be36f',
    bonus: { kind: 'algae', amount: 0.35, label: '−35% algae growth' },
  },
  {
    id: 'auto-feeder', name: 'Auto-Feeder Lighthouse', kind: 'feeder', rarity: 'rare', cost: 450, unlockLevel: 4,
    description: 'Its lantern pops out pellets whenever your fish get peckish — even while you’re away.',
    styleTags: ['classic', 'adventure'], footprintRadius: 0.4, height: 1.35, color: '#f4f1ea', accentColor: '#e8483c',
    bonus: { kind: 'feeder', amount: 1, label: 'Feeds hungry fish' },
  },
  {
    id: 'bubble-filter', name: 'Bubble Filter Tower', kind: 'filter', rarity: 'rare', cost: 380, unlockLevel: 5,
    description: 'A humming filter column that keeps the water crystal clear.',
    styleTags: ['scifi', 'neutral'], footprintRadius: 0.35, height: 1.6, color: '#5e7f95', accentColor: '#8ff1ff',
    bonus: { kind: 'murk', amount: 0.4, label: '−40% murky water' },
  },
  {
    id: 'grow-lamp', name: 'Sunstone Coral', kind: 'growlamp', rarity: 'rare', cost: 600, unlockLevel: 7,
    description: 'A warm glowing coral that helps little fish grow up big and strong.',
    styleTags: ['nature', 'sparkle'], footprintRadius: 0.4, height: 1, color: '#ff9a3c', accentColor: '#fff0a0',
    bonus: { kind: 'growth', amount: 0.25, label: 'Fish grow 25% faster' },
  },
  {
    id: 'coin-fountain', name: 'Lucky Coin Fountain', kind: 'fountain', rarity: 'epic', cost: 900, unlockLevel: 8,
    description: 'A golden fountain that brings your fish good fortune.',
    styleTags: ['classic', 'sparkle'], footprintRadius: 0.5, height: 0.95, color: '#e0bd5c', accentColor: '#7fe0ff',
    bonus: { kind: 'coins', amount: 0.3, label: '+30% coin bubbles' },
  },
]

/** Late-game helpers: cleaning becomes a choice, not a chore (kids who love scrubbing still can). */
DECORATION_CATALOG.push(
  {
    id: 'robo-vac', name: 'Robo-Vac Sub', kind: 'submarine', rarity: 'epic', cost: 2200, unlockLevel: 20,
    description: 'A busy little sub that hoovers up mess from the gravel all by itself.',
    styleTags: ['scifi'], footprintRadius: 0.85, height: 0.95, color: '#7fd3ff', accentColor: '#ffe27a',
    bonus: { kind: 'tidy', amount: 1, label: 'Tidies up waste' },
  },
  {
    id: 'scrub-tower', name: 'Auto-Scrubber Tower', kind: 'filter', rarity: 'epic', cost: 2600, unlockLevel: 22,
    description: 'Sends out tiny scrubbing bubbles that slowly polish the glass clean.',
    styleTags: ['scifi', 'neutral'], footprintRadius: 0.35, height: 1.6, color: '#5fbf8f', accentColor: '#e9fff2',
    bonus: { kind: 'scrub', amount: 1, label: 'Scrubs the glass' },
  },
)

/** Seasonal pieces: sold only during their season, and back every year. */
DECORATION_CATALOG.push(
  {
    id: 'blossom-coral', name: 'Blossom Coral', kind: 'staghorn', rarity: 'rare', cost: 300, unlockLevel: 1, season: 'spring-bloom',
    description: 'Coral that bursts into pink spring blossom.',
    styleTags: ['nature', 'sparkle'], footprintRadius: 0.45, height: 0.85, color: '#ffa9cf', accentColor: '#fff4f8',
  },
  {
    id: 'sandcastle', name: 'Sandcastle', kind: 'castle', rarity: 'rare', cost: 350, unlockLevel: 1, season: 'summer-reef',
    description: 'A sunny-day sandcastle that the waves never knock down.',
    styleTags: ['classic'], footprintRadius: 0.65, height: 1.5, color: '#ecd29a', accentColor: '#39a7e0',
  },
  {
    id: 'jack-o-lantern', name: "Jack-o'-Lantern", kind: 'pumpkin', rarity: 'rare', cost: 300, unlockLevel: 1, season: 'spooky-seas',
    description: 'A grinning pumpkin with a warm glow. Extra spooky after dark!',
    styleTags: ['adventure'], footprintRadius: 0.32, height: 0.5, color: '#ff8a1e', accentColor: '#ffd24a',
  },
  {
    id: 'sea-snowman', name: 'Sea Snowman', kind: 'snowman', rarity: 'rare', cost: 300, unlockLevel: 1, season: 'winter-lights',
    description: 'Built from sea foam, with a carrot nose and a twinkly sea-glass hat.',
    styleTags: ['sparkle'], footprintRadius: 0.3, height: 0.95, color: '#f2f7ff', accentColor: '#ff7a2a',
  },
)

export const STARTER_DECORATION_IDS = ['rock-cluster', 'driftwood', 'green-plant', 'air-stone']

export function getDecorationDef(defId: string): DecorationCatalogEntry | undefined {
  return DECORATION_CATALOG.find((d) => d.id === defId)
}
