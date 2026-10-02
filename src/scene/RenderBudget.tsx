import { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'

let pendingPhoto: ((dataUrl: string | null) => void) | null = null

/**
 * Ask for a PNG of the next finished frame. The canvas doesn't keep its
 * drawing buffer (preserveDrawingBuffer costs real performance, especially on
 * tablets), so the capture happens right after the frame is drawn.
 */
export function requestPhoto(): Promise<string | null> {
  return new Promise((resolve) => {
    pendingPhoto?.(null)
    pendingPhoto = resolve
  })
}

/** Runs after the post-processing pass (priority 1) has drawn the frame. */
export function PhotoCapture() {
  const gl = useThree((s) => s.gl)
  useFrame(() => {
    if (!pendingPhoto) return
    const resolve = pendingPhoto
    pendingPhoto = null
    try {
      resolve(gl.domElement.toDataURL('image/png'))
    } catch {
      resolve(null)
    }
  }, 10)
  return null
}

/** Shadows only need refreshing at 30 Hz; fish move too little per frame to notice. */
export function ShadowThrottle() {
  const gl = useThree((s) => s.gl)
  const frame = useRef(0)
  useFrame(() => {
    gl.shadowMap.autoUpdate = false
    // three.js clears needsUpdate after drawing the shadow map.
    if (frame.current++ % 2 === 0) gl.shadowMap.needsUpdate = true
  })
  return null
}

const DEVICE_DPR = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
export const MAX_DPR = Math.min(DEVICE_DPR, 1.75)
const START_DPR = Math.min(DEVICE_DPR, 1.5)

/**
 * Pixel ratio that adapts to the device: starts sharp, steps down when the
 * frame rate struggles (big iPad screens + bloom are fill-rate heavy) and back
 * up when there's headroom.
 */
export function useAdaptiveDpr() {
  const [dpr, setDpr] = useState(START_DPR)
  const monitor = (
    <PerformanceMonitor
      bounds={(refresh) => (refresh > 90 ? [50, 90] : [45, 58])}
      flipflops={4}
      onDecline={() => setDpr((d) => Math.max(1, +(d - 0.25).toFixed(2)))}
      onIncline={() => setDpr((d) => Math.min(MAX_DPR, +(d + 0.25).toFixed(2)))}
      onFallback={() => setDpr(1)}
    />
  )
  return { dpr, monitor }
}
