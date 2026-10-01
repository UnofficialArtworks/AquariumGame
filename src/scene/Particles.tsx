import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { atmosphere } from './Atmosphere'
import { aquaUniforms } from './materials/aquaShader'
import { INTERIOR_HALF_DEPTH, INTERIOR_HALF_WIDTH, WATER_LINE_Y } from './TankBounds'
import { mulberry32 } from '../utils/rng'

const COUNT = 700

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uTop;
  attribute vec4 aSeed;
  varying float vSeed;
  varying float vTwinkle;
  void main() {
    vec3 p = position;
    float fall = mod(p.y - uTime * (0.02 + aSeed.x * 0.05), uTop);
    p.y = fall + 0.05;
    p.x += sin(uTime * (0.2 + aSeed.y * 0.3) + aSeed.z * 6.28) * 0.15;
    p.z += cos(uTime * (0.15 + aSeed.x * 0.25) + aSeed.w * 6.28) * 0.12;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.2 + aSeed.w * 2.2) * uPixelRatio * (9.0 / -mv.z);
    vSeed = aSeed.z;
    vTwinkle = 0.5 + 0.5 * sin(uTime * (1.5 + aSeed.y * 3.0) + aSeed.x * 40.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uVisible;
  uniform float uNight;
  uniform vec3 uTint;
  varying float vSeed;
  varying float vTwinkle;
  void main() {
    if (vSeed > uVisible) discard;
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    // A few specks become glowing plankton at night.
    float glowing = step(0.82, fract(vSeed * 13.7)) * uNight;
    vec3 col = mix(uTint, vec3(0.35, 0.9, 1.6) * (0.6 + vTwinkle * 1.6), glowing);
    float alpha = a * mix(0.35, 0.9 * vTwinkle, glowing);
    gl_FragColor = vec4(col * alpha, alpha);
  }
`

/** Drifting "marine snow" specks. More appear as the water gets dirtier; some glow at night. */
export function Particles() {
  const { geometry, material } = useMemo(() => {
    const rand = mulberry32(777)
    const positions = new Float32Array(COUNT * 3)
    const seeds = new Float32Array(COUNT * 4)
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (rand() * 2 - 1) * INTERIOR_HALF_WIDTH
      positions[i * 3 + 1] = rand() * WATER_LINE_Y
      positions[i * 3 + 2] = (rand() * 2 - 1) * INTERIOR_HALF_DEPTH
      seeds[i * 4] = rand()
      seeds[i * 4 + 1] = rand()
      seeds[i * 4 + 2] = rand()
      seeds[i * 4 + 3] = rand()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: aquaUniforms.uAquaTime,
        uPixelRatio: { value: 1 },
        uTop: { value: WATER_LINE_Y - 0.1 },
        uVisible: { value: 0.3 },
        uNight: { value: 0 },
        uTint: { value: new THREE.Color('#d9f2ff') },
      },
    })
    return { geometry: geo, material: mat }
  }, [])

  const clearTint = useMemo(() => new THREE.Color('#d9f2ff'), [])
  const murkTint = useMemo(() => new THREE.Color('#b7c98a'), [])

  useFrame(({ gl }) => {
    material.uniforms.uPixelRatio.value = gl.getPixelRatio()
    material.uniforms.uVisible.value = 0.28 + atmosphere.murk * 0.72
    material.uniforms.uNight.value = atmosphere.night
    material.uniforms.uTint.value.copy(clearTint).lerp(murkTint, atmosphere.murk).multiplyScalar(1 - atmosphere.night * 0.6)
  })

  return <points geometry={geometry} material={material} renderOrder={3} frustumCulled={false} />
}
