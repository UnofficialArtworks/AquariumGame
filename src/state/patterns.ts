// Patterns are passed down in the nursery: each baby takes its pattern from
// one of its parents. When both parents wear the same pattern there's a
// chance of a surprise, a pattern neither of them has. Every species can
// wear all nine, and the Fishpedia shows which ones you've found.
import type { FishDefinition, FishInstance, PatternType } from './types'
import type { Luck } from './charms'
import { getFishDef } from '../scene/fish/fishDefinitions'

export const PATTERNS: Array<{ id: PatternType; name: string }> = [
  { id: 'solid', name: 'Plain' },
  { id: 'gradient', name: 'Sunset' },
  { id: 'spots', name: 'Spotted' },
  { id: 'stripe', name: 'Striped' },
  { id: 'bands', name: 'Banded' },
  { id: 'tiger', name: 'Tiger' },
  { id: 'calico', name: 'Calico' },
  { id: 'scales', name: 'Shimmer' },
  { id: 'neon', name: 'Neon' },
]

/** Chance two parents with the same pattern have a surprise baby. */
export const SURPRISE_CHANCE = 0.2
export const PATTERN_COINS = 60
export const PATTERN_XP = 15

export function patternName(pattern: PatternType): string {
  return PATTERNS.find((p) => p.id === pattern)?.name ?? pattern
}

export function isPattern(value: unknown): value is PatternType {
  return PATTERNS.some((p) => p.id === value)
}

/** Only regular fish bodies show patterns (not seahorses, jellies, turtles and friends). */
export function hasPatterns(def: FishDefinition | undefined): boolean {
  return def?.kind === 'fish'
}

/** The pattern a fish wears: inherited from the nursery, or its species' own. */
export function patternOf(fish: Pick<FishInstance, 'defId' | 'inheritance'>): PatternType {
  return fish.inheritance?.pattern ?? getFishDef(fish.defId)?.pattern ?? 'solid'
}

/** A baby's pattern: one parent's or the other's, and sometimes a surprise when they match. */
export function rollPattern(a: PatternType, b: PatternType, rand: () => number = Math.random, luck: Luck = {}): PatternType {
  // A pattern shell raises the surprise chance, and allows one from parents that differ.
  const surprise = a === b ? luck.matchSurprise ?? SURPRISE_CHANCE : luck.mismatchSurprise ?? 0
  if (surprise > 0 && rand() < surprise) {
    const others = PATTERNS.filter((p) => p.id !== a && p.id !== b)
    if (others.length) return others[Math.floor(rand() * others.length)].id
  }
  return rand() < 0.5 ? a : b
}

/** Patterns found for a species: its own (once you have one) plus any bred ones. */
export function patternsFound(def: FishDefinition, entry: { patterns?: PatternType[] } | undefined): Set<PatternType> {
  if (!entry) return new Set()
  return new Set([def.pattern, ...(entry.patterns ?? [])])
}
