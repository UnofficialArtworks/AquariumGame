import { getFishDef } from '../scene/fish/fishDefinitions'
import type { FishInstance, NurseryEgg } from './types'

/** Body/species from one parent, actual colors from the other, including later generations. */
export function inheritedDefinition(fish: Pick<FishInstance, 'defId' | 'inheritance'>) {
  const def = getFishDef(fish.defId)
  if (!def || !fish.inheritance) return def
  const { color, color2, color3 } = fish.inheritance
  return { ...def, color, color2, color3 }
}

export function createNurseryEgg(first: FishInstance, second: FishInstance, createdAt = Date.now()): NurseryEgg {
  const [body, colors] = Math.random() < 0.5 ? [first, second] : [second, first]
  const palette = inheritedDefinition(colors)!
  const hatchSeconds = sampleEggHatchSeconds(body.defId)
  return {
    id: crypto.randomUUID(), defId: body.defId, createdAt, hatchSeconds, remainingSeconds: hatchSeconds,
    inheritance: {
      bodyParentName: body.name, colorParentName: colors.name,
      bodyParentId: body.id, colorParentId: colors.id,
      color: palette.color, color2: palette.color2, color3: palette.color3,
    },
  }
}

export function getEggCountRange(defId: string): [number, number] {
  return getFishDef(defId)?.eggCountRange ?? [1, 1]
}

export function sampleEggCount(defId: string): number {
  const [min, max] = getEggCountRange(defId)
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** Each species has a stable hatch window; individual eggs pick a time inside it once. */
export function getEggHatchRange(defId: string): [number, number] {
  const rarity = getFishDef(defId)?.rarity ?? 'common'
  const base: Record<typeof rarity, [number, number]> = {
    common: [60, 120],
    uncommon: [110, 220],
    rare: [180, 360],
    epic: [300, 480],
    legendary: [420, 600],
  }
  let hash = 0
  for (const char of defId) hash = (hash * 31 + char.charCodeAt(0)) | 0
  const [min, max] = base[rarity]
  const shift = (Math.abs(hash) % 21) - 10
  return [Math.max(30, min + shift), max + shift]
}

export function sampleEggHatchSeconds(defId: string): number {
  const [min, max] = getEggHatchRange(defId)
  return min + Math.floor(Math.random() * (max - min + 1))
}
