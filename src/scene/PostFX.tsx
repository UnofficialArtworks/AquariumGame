import { memo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode, type BloomEffect } from 'postprocessing'
import * as THREE from 'three'
import { atmosphere } from './Atmosphere'

/**
 * Bloom makes glowing things glow (crystals, lava, neon fish), plus a soft vignette.
 *
 * Memoized on purpose: EffectComposer tears down and rebuilds its passes
 * whenever its `children` change identity, and a rebuilt pass can present a
 * black frame. Re-rendering this from the parent scene caused visible flicker.
 */
export const PostFX = memo(function PostFX() {
  const bloomRef = useRef<BloomEffect>(null)
  useFrame(() => {
    if (bloomRef.current) bloomRef.current.intensity = THREE.MathUtils.lerp(0.55, 1.25, atmosphere.night)
  })
  return (
    // Multisampled HDR targets render black on some WebGL/ANGLE drivers.
    // Keep bloom's HDR buffer single-sampled and smooth edges with SMAA instead.
    <EffectComposer multisampling={0}>
      <Bloom ref={bloomRef} mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.3} intensity={0.55} radius={0.75} />
      <Vignette offset={0.25} darkness={0.55} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <SMAA />
    </EffectComposer>
  )
})
