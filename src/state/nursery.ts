import { getFishDef, sampleFishSize } from '../scene/fish/fishDefinitions'
import { morphedDefinition, rollMorph } from './morphs'
import { NURSERY_CAPACITY } from './economy'
import { pickFishName } from './names'
import { freshVitals } from './migrations'
import type { FishInstance, GameState, NurseryEgg } from './types'

/** Body/species from one parent, actual colors from the other, including later generations. */
export function inheritedDefinition(fish: Pick<FishInstance, 'defId' | 'inheritance'>) {
  const def = getFishDef(fish.defId)
  if (!def || !fish.inheritance) return def
  const { color, color2, color3, morph } = fish.inheritance
  return morphedDefinition({ ...def, color, color2, color3 }, morph)
}

/** A fish's own colours underneath any morph it wears. */
function basePalette(fish: FishInstance) {
  if (fish.inheritance) return fish.inheritance
  const def = getFishDef(fish.defId)!
  return { color: def.color, color2: def.color2, color3: def.color3 }
}

export function createNurseryEgg(first: FishInstance, second: FishInstance, createdAt = Date.now()): NurseryEgg {
  const [body, colors] = Math.random() < 0.5 ? [first, second] : [second, first]
  // A morph is rolled fresh for every egg (more likely from a morph parent);
  // otherwise the colour parent passes on its underlying palette.
  const palette = basePalette(colors)
  const morph = rollMorph([first.inheritance?.morph, second.inheritance?.morph])
  const hatchSeconds = sampleEggHatchSeconds(body.defId)
  return {
    id: crypto.randomUUID(), defId: body.defId, createdAt, hatchSeconds, remainingSeconds: hatchSeconds,
    inheritance: {
      bodyParentName: body.name, colorParentName: colors.name,
      bodyParentId: body.id, colorParentId: colors.id,
      color: palette.color, color2: palette.color2, color3: palette.color3,
      ...(morph ? { morph } : {}),
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

export type NurseryProgress = Pick<GameState, 'nurserySession' | 'nurseryEggs' | 'ownedFish' | 'fishVitals'> & {
  eggCreated: boolean
  hatched: FishInstance[]
}

/**
 * Run the nursery forward by `seconds`: a friendship ends (or lays its
 * clutch), eggs count down, and any that are due hatch into little fish.
 * Pure: takes a state and returns the parts that changed.
 */
export function progressNursery(s: GameState, seconds: number): NurseryProgress {
  const session = s.nurserySession
  const occupied = s.ownedFish.filter((f) => f.habitat === 'nursery').length + s.nurseryEggs.length
  let nextSession = session
  let eggCreated = false
  const eggs: NurseryEgg[] = s.nurseryEggs.map((egg) => ({ ...egg, remainingSeconds: egg.remainingSeconds - seconds }))
  if (session) {
    const parents = session.parentIds.map((id) => s.ownedFish.find((f) => f.id === id))
    if (parents.some((f) => !f || f.habitat !== 'nursery' || (s.fishVitals[f.id]?.growth ?? 0) < 1)
      || occupied + session.eggCount > NURSERY_CAPACITY) {
      nextSession = null
    } else if (session.remainingSeconds > seconds) {
      nextSession = { ...session, remainingSeconds: session.remainingSeconds - seconds }
    } else {
      const leftover = Math.max(0, seconds - session.remainingSeconds)
      for (let i = 0; i < session.eggCount; i++) {
        const egg = createNurseryEgg(parents[0]!, parents[1]!, Date.now() - leftover * 1000)
        eggs.push({ ...egg, remainingSeconds: egg.hatchSeconds - leftover })
      }
      nextSession = null
      eggCreated = true
    }
  }
  const hatchedEggs = eggs.filter((egg) => egg.remainingSeconds <= 0)
  // Keep array identity when nothing hatched: the 3D scene re-renders on
  // ownedFish changes, and rebuilding it every tick caused black-frame flicker.
  if (hatchedEggs.length === 0) {
    return {
      nurserySession: nextSession,
      nurseryEggs: eggs.length === 0 && s.nurseryEggs.length === 0 ? s.nurseryEggs : eggs,
      ownedFish: s.ownedFish,
      fishVitals: s.fishVitals,
      eggCreated,
      hatched: [],
    }
  }
  const ownedFish = [...s.ownedFish]
  const fishVitals = { ...s.fishVitals }
  const hatched: FishInstance[] = []
  for (const egg of hatchedEggs) {
    const id = crypto.randomUUID()
    const name = pickFishName(ownedFish.map((f) => f.name))
    const fish: FishInstance = { id, defId: egg.defId, name, bornAt: Date.now() + egg.remainingSeconds * 1000,
      habitat: 'nursery', sizeScale: sampleFishSize(egg.defId), inheritance: egg.inheritance }
    ownedFish.push(fish)
    hatched.push(fish)
    fishVitals[id] = freshVitals(0.35)
  }
  return {
    nurserySession: nextSession,
    nurseryEggs: eggs.filter((egg) => egg.remainingSeconds > 0),
    ownedFish,
    fishVitals,
    eggCreated,
    hatched,
  }
}
