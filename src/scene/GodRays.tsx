import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { atmosphere } from './Atmosphere'
import { floorHeightAt, INTERIOR_HALF_DEPTH, INTERIOR_HALF_WIDTH, waterLevel } from './TankBounds'
import { mulberry32 } from '../utils/rng'

const RAY_COUNT = 9

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uIntensity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float edge = max(sin(vUv.x * 3.14159), 0.0);
    edge = pow(edge, 2.2);
    float fadeDown = smoothstep(0.0, 0.85, vUv.y);
    float flicker = 0.55 + 0.45 * sin(uTime * 0.6 + uPhase) * sin(uTime * 0.37 + uPhase * 2.1);
    float streaks = 0.75 + 0.25 * sin(vUv.x * 18.0 + uPhase * 3.0 + uTime * 0.3);
    float a = edge * fadeDown * flicker * streaks * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`

interface Ray {
  x: number
  z: number
  width: number
  tilt: number
  phase: number
}

/**
 * Soft shafts of light slanting down from the surface. Each is a plane
 * that turns around its vertical axis to face the camera, drawn additively
 * so overlapping shafts brighten naturally.
 */
export function GodRays() {
  const groupRef = useRef<THREE.Group>(null)
  const rays = useMemo<Ray[]>(() => {
    const rand = mulberry32(4242)
    return Array.from({ length: RAY_COUNT }, () => ({
      x: (rand() * 2 - 1) * INTERIOR_HALF_WIDTH * 0.9,
      z: (rand() * 2 - 1) * INTERIOR_HALF_DEPTH * 0.7,
      width: 0.35 + rand() * 0.7,
      tilt: 0.18 + rand() * 0.12,
      phase: rand() * 10,
    }))
  }, [])

  const materials = useMemo(
    () =>
      rays.map(
        (ray) =>
          new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            uniforms: {
              uTime: { value: 0 },
              uPhase: { value: ray.phase },
              uIntensity: { value: 0.12 },
              uColor: { value: new THREE.Color('#bff1ff') },
            },
          }),
      ),
    [rays],
  )

  const dayColor = useMemo(() => new THREE.Color('#bff1ff'), [])
  const nightColor = useMemo(() => new THREE.Color('#5d78ff'), [])

  useFrame(({ clock, camera }) => {
    const group = groupRef.current
    if (!group) return
    const intensity = (0.11 - atmosphere.night * 0.06) * (1 - atmosphere.murk * 0.5)
    group.children.forEach((child, i) => {
      const ray = rays[i]
      const top = waterLevel.current
      const bottom = floorHeightAt(ray.x, ray.z)
      const height = top - bottom
      child.position.set(ray.x, bottom + height / 2, ray.z)
      child.scale.set(ray.width, height, 1)
      // Cylindrical billboard: yaw toward the camera, keep the shaft upright-ish.
      const yaw = Math.atan2(camera.position.x - ray.x, camera.position.z - ray.z)
      child.rotation.set(0, yaw, ray.tilt, 'YXZ')
      const material = materials[i]
      material.uniforms.uTime.value = clock.elapsedTime
      material.uniforms.uIntensity.value = intensity
      material.uniforms.uColor.value.copy(dayColor).lerp(nightColor, atmosphere.night)
    })
  })

  return (
    <group ref={groupRef}>
      {materials.map((material, i) => (
        <mesh key={i} material={material} renderOrder={4}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  )
}
