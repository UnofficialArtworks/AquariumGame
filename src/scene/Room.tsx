import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { aquaUniforms } from './materials/aquaShader'
import { atmosphere } from './Atmosphere'
import { TANK_BOTTOM_Y } from './TankBounds'

const FLOOR_Y = TANK_BOTTOM_Y - 0.06 - 2.3

const floorVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const floorFragment = /* glsl */ `
  uniform vec3 uWaterColor;
  uniform vec3 uBg;
  uniform float uNight;
  varying vec3 vWorld;
  void main() {
    vec2 p = vWorld.xz;
    float d = length(p * vec2(0.55, 0.9));
    vec3 base = vec3(0.028, 0.034, 0.045);
    // Light from the tank spilling onto the floor in front of the cabinet.
    float spill = exp(-length((p - vec2(0.0, 3.6)) * vec2(0.28, 0.6))) * (1.0 - uNight * 0.4);
    vec3 col = base + uWaterColor * spill * 0.55;
    col = mix(col, uBg, smoothstep(4.0, 14.0, d));
    gl_FragColor = vec4(col, 1.0);
  }
`

const BG_DAY = new THREE.Color('#07131f')
const BG_NIGHT = new THREE.Color('#02050b')

/** The dim room around the tank: a background color and a floor that catches spill light from the water. */
export function Room() {
  const background = useMemo(() => new THREE.Color('#07131f'), [])
  const floorMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: floorVertex,
        fragmentShader: floorFragment,
        uniforms: {
          uWaterColor: aquaUniforms.uWaterColor,
          uBg: { value: background },
          uNight: { value: 0 },
        },
      }),
    [background],
  )

  useFrame(() => {
    background.copy(BG_DAY).lerp(BG_NIGHT, atmosphere.night)
    floorMaterial.uniforms.uNight.value = atmosphere.night
  })

  return (
    <>
      <primitive attach="background" object={background} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]} material={floorMaterial}>
        <circleGeometry args={[30, 48]} />
      </mesh>
    </>
  )
}
