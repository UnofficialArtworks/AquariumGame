import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AQUA_GLSL_COMMON, aquaUniforms } from '../materials/aquaShader'
import { atmosphere } from '../Atmosphere'
import { GLASS_THICKNESS, HALF_DEPTH, HALF_WIDTH, PERIMETER, TANK_BOTTOM_Y, WALLS, type WallMapping } from '../TankBounds'
import { ALGAE_HEIGHT, algaeTexture, syncAlgaeTexture } from '../../sim/algae'

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const fragmentShader = /* glsl */ `
  ${AQUA_GLSL_COMMON}
  uniform sampler2D uAlgae;
  uniform float uAxis;
  uniform float uA;
  uniform float uB;
  uniform float uPerimeter;
  uniform float uBottom;
  uniform float uHeight;
  uniform float uLight;
  varying vec3 vWorld;

  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { s += vnoise(p) * a; p *= 2.07; a *= 0.5; }
    return s;
  }

  void main() {
    float coord = uAxis < 0.5 ? vWorld.x : vWorld.z;
    float s = uA * coord + uB;
    vec2 guv = vec2(s / uPerimeter, (vWorld.y - uBottom) / uHeight);
    float a = texture2D(uAlgae, guv).r;
    vec2 np = vec2(s, vWorld.y);
    float n = fbm(np * 3.2);
    float n2 = fbm(np * 12.0 + 4.0);
    float cover = smoothstep(0.34, 0.56, a + (n - 0.5) * 0.6);
    float speckle = smoothstep(0.64, 0.72, n2) * smoothstep(0.08, 0.3, a);
    float film = a * 0.1;
    float alpha = max(cover * (0.5 + n2 * 0.4), speckle * 0.75) + film;
    if (alpha < 0.01) discard;
    vec3 dark = vec3(0.045, 0.16, 0.03);
    vec3 light = vec3(0.24, 0.42, 0.06);
    vec3 col = mix(dark, light, n2);
    col = mix(col, vec3(0.22, 0.16, 0.05), smoothstep(0.55, 0.85, n) * 0.5);
    col *= uLight;
    col = aquaApplyWater(col, vWorld);
    gl_FragColor = vec4(col, min(alpha, 0.94));
  }
`

const INSET = GLASS_THICKNESS / 2 + 0.006

function wallTransform(wall: WallMapping): { position: [number, number, number]; rotationY: number } {
  const y = TANK_BOTTOM_Y + ALGAE_HEIGHT / 2
  switch (wall.id) {
    case 'front':
      return { position: [0, y, HALF_DEPTH - INSET], rotationY: 0 }
    case 'back':
      return { position: [0, y, -HALF_DEPTH + INSET], rotationY: Math.PI }
    case 'right':
      return { position: [HALF_WIDTH - INSET, y, 0], rotationY: Math.PI / 2 }
    case 'left':
      return { position: [-HALF_WIDTH + INSET, y, 0], rotationY: -Math.PI / 2 }
  }
}

function AlgaeWall({ wall }: { wall: WallMapping }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          ...aquaUniforms,
          uAlgae: { value: algaeTexture },
          uAxis: { value: wall.axis === 'x' ? 0 : 1 },
          uA: { value: wall.a },
          uB: { value: wall.b },
          uPerimeter: { value: PERIMETER },
          uBottom: { value: TANK_BOTTOM_Y },
          uHeight: { value: ALGAE_HEIGHT },
          uLight: { value: 1 },
        },
      }),
    [wall],
  )

  useFrame(() => {
    material.uniforms.uLight.value = 1 - atmosphere.night * 0.75
  })

  const { position, rotationY } = wallTransform(wall)

  return (
    <mesh position={position} rotation={[0, rotationY, 0]} material={material} renderOrder={8}>
      <planeGeometry args={[wall.length - 0.02, ALGAE_HEIGHT]} />
    </mesh>
  )
}

/**
 * Algae film on the inside of all four glass walls. Scrubbing is handled by
 * the glass tool controller in CleaningTools, which raycasts the walls itself
 * so the tool stays pinned inside the glass even when the pointer wanders off.
 */
export function AlgaeGlass() {
  useFrame(() => syncAlgaeTexture())

  return (
    <group>
      {WALLS.map((wall) => (
        <AlgaeWall key={wall.id} wall={wall} />
      ))}
    </group>
  )
}
