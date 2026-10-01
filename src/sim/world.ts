import * as THREE from 'three'
import type { FishDefinition } from '../state/types'

/**
 * Shared, mutable simulation state that fish, food, coins, bubbles and
 * cleaning tools read/write every frame. Deliberately NOT React or zustand
 * state: this changes at 60fps and nothing here needs to trigger a render.
 */

export const simClock = { t: 0 }

export interface FishEffects {
  rainbow: number
  glow: number
  golden: number
  zoom: number
  hearts: number
}

export interface FishAgent {
  id: string
  def: FishDefinition
  object: THREE.Object3D
  velocity: THREE.Vector3
  /** Sim time until which each effect lasts. */
  effects: FishEffects
  /** Seconds left of the "gulp" squash after eating. */
  eatPulse: number
  /** 0..1 pufferfish inflation. */
  puff: number
  /** Seconds left of fleeing. */
  startle: number
  startleFrom: THREE.Vector3
  swimPhase: number
  /** Smoothed speed 0..1 of max, drives tail beat. */
  effort: number
  bank: number
  sleeping: boolean
  size: number
}

export const fishAgents = new Map<string, FishAgent>()

export interface Obstacle {
  id: string
  x: number
  z: number
  r: number
  top: number
}

/** Decoration footprints fish steer around. Rebuilt when the layout changes. */
export const obstacles: Obstacle[] = []

/** Where the player's pointer is resting on the tank (fish get curious). */
export const pointerAttract = {
  active: false,
  point: new THREE.Vector3(),
  lastMove: 0,
}

/** Positions of sea anemones, which clownfish like to hang around. */
export const anemoneSpots: THREE.Vector3[] = []

/** Tap on the glass: nearby fish dart away, pufferfish puff up. */
export function startleAt(point: THREE.Vector3, radius = 2.2) {
  for (const agent of fishAgents.values()) {
    const d = agent.object.position.distanceTo(point)
    if (d > radius) continue
    agent.startle = 0.9 + Math.random() * 0.5
    agent.startleFrom.copy(point)
    if (agent.def.features?.includes('spikes')) agent.puff = 1
  }
}

/** Walk up from a hit object to find the fish/coin/decoration it belongs to. */
export function findTagged(object: THREE.Object3D | null, key: string): unknown {
  let o: THREE.Object3D | null = object
  while (o) {
    if (o.userData[key] !== undefined) return o.userData[key]
    o = o.parent
  }
  return undefined
}
