import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { aquaUniforms } from './materials/aquaShader'
import { atmosphere } from './Atmosphere'
import { GLASS_THICKNESS, HALF_DEPTH, HALF_WIDTH, TANK_DEPTH, TANK_WIDTH, waterLevel } from './TankBounds'
import { MAX_RIPPLES, rippleData } from '../sim/ripples'

const vertexShader = /* glsl */ `
  uniform float uAquaTime;
  varying vec3 vWorld;
  float waveH(vec2 p, float t) {
    return sin(p.x * 2.1 + t * 1.3) * 0.012 + sin(p.y * 2.7 - t * 1.1) * 0.01
      + sin((p.x + p.y) * 4.3 + t * 2.1) * 0.006;
  }
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    wp.y += waveH(wp.xz, uAquaTime);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uAquaTime;
  uniform vec3 uWaterColor;
  uniform float uNight;
  uniform float uMurk;
  uniform vec4 uRipples[${MAX_RIPPLES}];
  varying vec3 vWorld;

  float waveH(vec2 p, float t) {
    return sin(p.x * 2.1 + t * 1.3) * 0.012 + sin(p.y * 2.7 - t * 1.1) * 0.01
      + sin((p.x + p.y) * 4.3 + t * 2.1) * 0.006
      + sin((p.x * 0.7 - p.y) * 9.1 - t * 2.7) * 0.003
      + sin((p.x * 1.3 + p.y * 0.4) * 13.0 + t * 3.3) * 0.0018;
  }

  float rippleH(vec2 p) {
    float h = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 r = uRipples[i];
      float age = uAquaTime - r.z;
      if (age < 0.0 || age > 3.0) continue;
      float d = distance(p, r.xy);
      float front = age * 1.1;
      h += sin((d - front) * 28.0) * exp(-age * 1.4) * exp(-abs(d - front) * 7.0) * 0.012 * r.w;
    }
    return h;
  }

  float surfaceH(vec2 p) { return waveH(p, uAquaTime) + rippleH(p); }

  void main() {
    vec2 p = vWorld.xz;
    float e = 0.02;
    float hx = surfaceH(p + vec2(e, 0.0)) - surfaceH(p - vec2(e, 0.0));
    float hz = surfaceH(p + vec2(0.0, e)) - surfaceH(p - vec2(0.0, e));
    vec3 n = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
    vec3 viewDir = normalize(cameraPosition - vWorld);
    vec3 sunDir = normalize(vec3(0.25, 1.0, 0.35));

    vec3 col;
    float alpha;
    if (gl_FrontFacing) {
      // Seen from above: tinted, fresnel sky reflection, glints.
      float fres = pow(clamp(1.0 - dot(n, viewDir), 0.0, 1.0), 3.0);
      vec3 sky = mix(vec3(0.75, 0.92, 1.0), vec3(0.15, 0.2, 0.45), uNight);
      col = mix(uWaterColor * 0.9, sky, 0.35 + fres * 0.5);
      float spec = pow(max(dot(reflect(-sunDir, n), viewDir), 0.0), 180.0);
      col += spec * mix(vec3(3.0), vec3(0.8, 0.9, 2.0), uNight);
      alpha = 0.28 + fres * 0.45;
    } else {
      // Seen from below: the bright, rippling mirror of total internal reflection.
      vec3 nb = -n;
      float facing = max(dot(nb, viewDir), 0.0);
      float shimmer = pow(abs(sin(hx * 140.0 + hz * 110.0)), 6.0);
      vec3 silver = mix(vec3(0.62, 0.9, 1.0), vec3(0.2, 0.3, 0.7), uNight);
      col = mix(uWaterColor * 1.3, silver, 0.55 + (1.0 - facing) * 0.4);
      col += shimmer * silver * 0.9;
      alpha = 0.55 + (1.0 - facing) * 0.35;
    }
    col = mix(col, uWaterColor, uMurk * 0.5);
    gl_FragColor = vec4(col, alpha);
  }
`

/** Wavy water surface plus thin bright meniscus lines where water meets glass. */
export function WaterSurface() {
  const meshRef = useRef<THREE.Mesh>(null)
  const meniscusRef = useRef<THREE.Group>(null)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uAquaTime: aquaUniforms.uAquaTime,
          uWaterColor: aquaUniforms.uWaterColor,
          uNight: { value: 0 },
          uMurk: { value: 0 },
          uRipples: { value: rippleData },
        },
      }),
    [],
  )

  const meniscusMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#dff8ff', transparent: true, opacity: 0.45, depthWrite: false }),
    [],
  )

  useFrame(() => {
    material.uniforms.uNight.value = atmosphere.night
    material.uniforms.uMurk.value = atmosphere.murk
    if (meshRef.current) meshRef.current.position.y = waterLevel.current
    if (meniscusRef.current) meniscusRef.current.position.y = waterLevel.current
    meniscusMaterial.opacity = 0.45 - atmosphere.night * 0.3
  })

  const inset = GLASS_THICKNESS / 2 + 0.005
  return (
    <group>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={5}>
        <planeGeometry args={[TANK_WIDTH - GLASS_THICKNESS, TANK_DEPTH - GLASS_THICKNESS, 96, 48]} />
      </mesh>
      <group ref={meniscusRef}>
        <mesh position={[0, 0, HALF_DEPTH - inset]} material={meniscusMaterial} renderOrder={6}>
          <boxGeometry args={[TANK_WIDTH - 0.1, 0.035, 0.005]} />
        </mesh>
        <mesh position={[0, 0, -HALF_DEPTH + inset]} material={meniscusMaterial} renderOrder={6}>
          <boxGeometry args={[TANK_WIDTH - 0.1, 0.035, 0.005]} />
        </mesh>
        <mesh position={[HALF_WIDTH - inset, 0, 0]} material={meniscusMaterial} renderOrder={6}>
          <boxGeometry args={[0.005, 0.035, TANK_DEPTH - 0.1]} />
        </mesh>
        <mesh position={[-HALF_WIDTH + inset, 0, 0]} material={meniscusMaterial} renderOrder={6}>
          <boxGeometry args={[0.005, 0.035, TANK_DEPTH - 0.1]} />
        </mesh>
      </group>
    </group>
  )
}
