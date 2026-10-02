/**
 * Where each nursery egg sits, so a baby that hatches can swim out of its own
 * egg instead of appearing somewhere else. A hatched fish keeps its egg's id.
 */
export const eggSpots = new Map<string, [number, number, number]>()

/** Keep the map small: forget the oldest spots (it never needs more than a few clutches). */
export function rememberEggSpot(id: string, spot: [number, number, number]) {
  eggSpots.set(id, spot)
  if (eggSpots.size > 120) eggSpots.delete(eggSpots.keys().next().value!)
}

/** How long after hatching a baby still starts from its egg (in case the nursery wasn't on screen). */
const FRESH_MS = 15_000

/** The egg a just-hatched fish should start inside, if it has one. */
export function hatchStart(fish: { id: string; bornAt: number; habitat?: string }): [number, number, number] | null {
  const spot = eggSpots.get(fish.id)
  // Read-only on purpose: React may run a state initialiser twice in development.
  if (!spot || fish.habitat !== 'nursery' || Date.now() - fish.bornAt > FRESH_MS) return null
  return spot
}
