import * as THREE from 'three'

export interface Spark {
  position: THREE.Vector3
  velocity: THREE.Vector3
  color: THREE.Color
  size: number
  life: number
  maxLife: number
  /** Upward (+) or downward (-) acceleration; bubbles float, crumbs sink. */
  buoyancy: number
}

export const MAX_SPARKS = 500
export const sparks: Spark[] = []

export interface SparkOptions {
  speed?: number
  size?: number
  life?: number
  buoyancy?: number
  spread?: number
}

/** Burst of little glowing particles: crumbs when eating, sparkles on coins, foam when scrubbing. */
export function emitSparks(position: THREE.Vector3, count: number, color: THREE.ColorRepresentation, options: SparkOptions = {}) {
  const { speed = 0.6, size = 1, life = 0.8, buoyancy = 0, spread = 0.02 } = options
  const base = new THREE.Color(color)
  for (let i = 0; i < count; i++) {
    if (sparks.length >= MAX_SPARKS) sparks.shift()
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
    sparks.push({
      position: position.clone().addScaledVector(dir, spread),
      velocity: dir.multiplyScalar(speed * (0.4 + Math.random() * 0.8)),
      color: base.clone().offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.1),
      size: size * (0.6 + Math.random() * 0.8),
      life: life * (0.6 + Math.random() * 0.6),
      maxLife: life,
      buoyancy,
    })
  }
}

export function updateSparks(dt: number) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]
    s.life -= dt
    if (s.life <= 0) {
      sparks[i] = sparks[sparks.length - 1]
      sparks.pop()
      continue
    }
    s.velocity.multiplyScalar(Math.max(0, 1 - dt * 2.5))
    s.velocity.y += s.buoyancy * dt
    s.position.addScaledVector(s.velocity, dt)
  }
}
