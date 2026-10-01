import { waterLevel } from '../scene/TankBounds'
import { addRipple } from './ripples'

export type BubbleKind = 0 | 1 | 2 // 0 air, 1 lava-lit, 2 sparkle/magic

export interface Bubble {
  x: number
  y: number
  z: number
  r: number
  phase: number
  wobble: number
  kind: BubbleKind
  age: number
}

export const MAX_BUBBLES = 600
export const bubbles: Bubble[] = []

export function emitBubble(x: number, y: number, z: number, r = 0.03, kind: BubbleKind = 0) {
  if (y >= waterLevel.current - 0.05) return
  if (bubbles.length >= MAX_BUBBLES) bubbles.shift()
  bubbles.push({ x, y, z, r, phase: Math.random() * Math.PI * 2, wobble: 0.04 + Math.random() * 0.08, kind, age: 0 })
}

export function updateBubbles(dt: number) {
  const surface = waterLevel.current
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]
    b.age += dt
    // Bigger bubbles rise faster; all of them wobble on the way up.
    const speed = 0.45 + b.r * 9
    b.y += speed * dt
    b.x += Math.sin(b.age * 6 + b.phase) * b.wobble * dt * 3
    b.z += Math.cos(b.age * 5 + b.phase) * b.wobble * dt * 3
    b.r = Math.min(b.r * (1 + dt * 0.08), 0.12)
    if (b.y >= surface - b.r * 0.5) {
      if (b.r > 0.045 && Math.random() < 0.35) addRipple(b.x, b.z, 0.35)
      bubbles[i] = bubbles[bubbles.length - 1]
      bubbles.pop()
    }
  }
}
