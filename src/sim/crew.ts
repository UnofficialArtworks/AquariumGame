import * as THREE from 'three'
import type { FishDefinition } from '../state/types'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { spawnCoinBubble } from './coins'
import { spawnPopup } from './popups'

// The cleanup crew have real jobs: snails polish algae off the glass, and
// shrimp and the starry pleco tidy leftovers and mess off the gravel. Every
// job is counted, and every few jobs earns a small coin tip.

export type CrewJob = 'glass' | 'gravel'

export const JOBS: Record<CrewJob, { icon: string; name: string; text: string }> = {
  glass: { icon: '🧽', name: 'Glass polisher', text: 'Eats algae off the glass.' },
  gravel: { icon: '🧹', name: 'Gravel tidier', text: 'Tidies up leftovers and mess on the gravel.' },
}

/** Jobs between coin tips. */
export const TIP_EVERY = 6

export function crewJobFor(def: FishDefinition | undefined): CrewJob | null {
  if (!def) return null
  if (def.kind === 'snail') return 'glass'
  if (def.kind === 'shrimp' || def.id === 'starry-pleco') return 'gravel'
  return null
}

const done = new Map<string, number>()

/** Jobs this crew member has done since the game was opened. */
export function crewJobsDone(fishId: string): number {
  return done.get(fishId) ?? 0
}

/** A crew member finished a job at `at`: count it, and tip a coin every few jobs. */
export function crewDidWork(fishId: string, def: FishDefinition, at: THREE.Vector3) {
  const n = crewJobsDone(fishId) + 1
  done.set(fishId, n)
  const s = useGameStore.getState()
  s.noteStat('crewJobs')
  if (n % TIP_EVERY !== 0 || useUIStore.getState().visiting) return
  spawnCoinBubble(at.clone().setY(at.y + 0.08), Math.max(2, Math.round(def.coinValue / 3)))
  spawnPopup({ x: at.x, y: at.y + 0.25, z: at.z }, 'Job well done!', '#bff3ff')
}
