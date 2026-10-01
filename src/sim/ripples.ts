import * as THREE from 'three'
import { simClock } from './world'

export const MAX_RIPPLES = 8

/** (x, z, startTime, strength) per ring; fed straight into the water surface shader. */
export const rippleData = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0))
let cursor = 0

/** Spawn an expanding ring on the water surface (food landing, bubbles popping). */
export function addRipple(x: number, z: number, strength = 1) {
  rippleData[cursor].set(x, z, simClock.t, strength)
  cursor = (cursor + 1) % MAX_RIPPLES
}
