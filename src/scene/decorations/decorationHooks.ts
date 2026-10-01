import { createContext, useContext, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { emitBubble, type BubbleKind } from '../../sim/bubbles'

/** True inside the offscreen shop-preview renderer, where decorations must not touch the live sim. */
export const PreviewContext = createContext(false)

export function useIsPreview(): boolean {
  return useContext(PreviewContext)
}

const tmp = new THREE.Vector3()

interface EmitterOptions {
  /** Bubbles per second. */
  rate: number
  radius?: number
  /** Random horizontal scatter around the emitter. */
  spread?: number
  kind?: BubbleKind
  enabled?: () => boolean
}

/** Emit a steady stream of bubbles from wherever `ref` currently is in the world. */
export function useBubbleEmitter(ref: RefObject<THREE.Object3D | null>, { rate, radius = 0.025, spread = 0.03, kind = 0, enabled }: EmitterOptions) {
  const preview = useIsPreview()
  const acc = useRef(Math.random())
  useFrame((_, rawDelta) => {
    if (preview || !ref.current) return
    if (enabled && !enabled()) return
    acc.current += Math.min(rawDelta, 0.1) * rate
    if (acc.current < 1) return
    ref.current.getWorldPosition(tmp)
    while (acc.current >= 1) {
      acc.current -= 1
      emitBubble(
        tmp.x + (Math.random() - 0.5) * spread * 2,
        tmp.y,
        tmp.z + (Math.random() - 0.5) * spread * 2,
        radius * (0.6 + Math.random() * 0.8),
        kind,
      )
    }
  })
}

/** Burst of bubbles right now from an object's world position. */
export function burstBubbles(object: THREE.Object3D, count: number, radius = 0.03, spread = 0.12, kind: BubbleKind = 0) {
  object.getWorldPosition(tmp)
  for (let i = 0; i < count; i++) {
    emitBubble(tmp.x + (Math.random() - 0.5) * spread * 2, tmp.y + Math.random() * 0.1, tmp.z + (Math.random() - 0.5) * spread * 2, radius * (0.5 + Math.random()), kind)
  }
}
