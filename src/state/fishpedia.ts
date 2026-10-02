import { FISH_CATALOG, getFishDef } from '../scene/fish/fishDefinitions'
import { getMorph, MORPHS } from './morphs'
import type { FishInstance, FishpediaEntry, MorphId, Rarity } from './types'

export type Fishpedia = Record<string, FishpediaEntry>

/** XP for the first fish of a species to join your tanks. */
export const DISCOVERY_XP: Record<Rarity, number> = { common: 10, uncommon: 20, rare: 35, epic: 60, legendary: 100 }
/** Coins the first time a species is raised from an egg. */
export const BRED_COINS: Record<Rarity, number> = { common: 30, uncommon: 60, rare: 100, epic: 160, legendary: 250 }
export const MORPH_COINS = 200
export const MORPH_XP = 50
/** Species-count milestones in the book; the last one is the whole catalog. */
export const FISHPEDIA_MILESTONES = [5, 10, 15, 20, 25, 30, FISH_CATALOG.length]

export function milestoneCoins(count: number): number {
  return count * 25
}

export interface Discoveries {
  book: Fishpedia
  /** Species seen for the first time. */
  species: string[]
  /** Species that just earned their "bred in the nursery" stamp. */
  bred: string[]
  morphs: Array<{ defId: string; morph: MorphId }>
}

/**
 * Note fish joining your tanks. Returns the updated book (the same object if
 * nothing was new) plus what was discovered, so the caller can celebrate.
 */
export function recordFish(book: Fishpedia, fish: FishInstance[], hatched: boolean): Discoveries {
  const found: Discoveries = { book, species: [], bred: [], morphs: [] }
  let next = book
  for (const f of fish) {
    if (!getFishDef(f.defId)) continue
    const prev = next[f.defId]
    let entry = prev ?? { discoveredAt: Number.isFinite(f.bornAt) ? Math.min(Date.now(), f.bornAt) : Date.now() }
    if (!prev) found.species.push(f.defId)
    if (hatched && !entry.bred) {
      entry = { ...entry, bred: true }
      found.bred.push(f.defId)
    }
    const morph = f.inheritance?.morph
    if (getMorph(morph) && !entry.morphs?.includes(morph!)) {
      entry = { ...entry, morphs: [...(entry.morphs ?? []), morph!] }
      found.morphs.push({ defId: f.defId, morph: morph! })
    }
    if (entry !== prev) {
      if (next === book) next = { ...book }
      next[f.defId] = entry
    }
  }
  found.book = next
  return found
}

export function speciesCount(book: Fishpedia): number {
  return FISH_CATALOG.reduce((n, def) => n + (book[def.id] ? 1 : 0), 0)
}

export function fishpediaTotals(book: Fishpedia) {
  let morphs = 0
  let bred = 0
  for (const def of FISH_CATALOG) {
    const entry = book[def.id]
    if (!entry) continue
    morphs += entry.morphs?.length ?? 0
    if (entry.bred) bred++
  }
  return {
    species: speciesCount(book),
    speciesTotal: FISH_CATALOG.length,
    morphs,
    morphsTotal: FISH_CATALOG.length * MORPHS.length,
    bred,
  }
}

export function milestonesCrossed(before: number, after: number): number[] {
  return FISHPEDIA_MILESTONES.filter((m) => before < m && after >= m)
}

/** Keep only well-formed entries for species that still exist. */
export function sanitizeFishpedia(raw: unknown): Fishpedia {
  const book: Fishpedia = {}
  if (!raw || typeof raw !== 'object') return book
  for (const [id, value] of Object.entries(raw as Record<string, Partial<FishpediaEntry>>)) {
    const def = getFishDef(id)
    if (!def || !value || !Number.isFinite(value.discoveredAt)) continue
    const morphs = Array.isArray(value.morphs) ? [...new Set(value.morphs.filter((m) => getMorph(m)))] : []
    book[def.id] = { discoveredAt: value.discoveredAt!, ...(value.bred ? { bred: true } : {}), ...(morphs.length ? { morphs } : {}) }
  }
  return book
}
