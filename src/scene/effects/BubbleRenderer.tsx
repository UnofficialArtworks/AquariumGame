import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { bubbles, MAX_BUBBLES } from '../../sim/bubbles'
import { sparks, MAX_SPARKS } from '../../sim/sparks'
import { atmosphere } from '../Atmosphere'

const bubbleVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vTint;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #else
      vTint = vec3(1.0);
    #endif
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const bubbleFragment = /* glsl */ `
  uniform float uNight;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vTint;
  void main() {
    // Clamp before pow(): rounding can push the dot product past 1, and
    // pow(negative) is NaN, which bloom smears into a full black frame.
    float f = clamp(1.0 - abs(dot(normalize(vN), normalize(vView))), 0.0, 1.0);
    float rim = pow(f, 2.0);
    vec3 L = normalize(vec3(0.3, 1.0, 0.5));
    float spec = pow(max(dot(reflect(-L, vN), vView), 0.0), 30.0);
    vec3 col = vTint * (0.35 + rim * 1.5) * (1.0 - uNight * 0.45) + spec * mix(1.9, 0.8, uNight);
    float a = clamp(rim * 1.05 + spec + 0.1, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }
`

const TINTS = [new THREE.Color('#e6f7ff'), new THREE.Color('#ffb070'), new THREE.Color('#ff9df0')]

/** All rising bubbles in one instanced draw. */
export function BubbleRenderer() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: bubbleVertex,
        fragmentShader: bubbleFragment,
        transparent: true,
        depthWrite: false,
        uniforms: { uNight: { value: 0 } },
      }),
    [],
  )
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 2), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    material.uniforms.uNight.value = atmosphere.night
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i]
      dummy.position.set(b.x, b.y, b.z)
      const squish = 1 + Math.sin(b.age * 14 + b.phase) * 0.08
      // Drawn a little larger than they are, with a floor, so even small streams read against the water.
      const r = Math.max(b.r * 1.25, 0.02)
      dummy.scale.set(r * squish, r / squish, r * squish)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, TINTS[b.kind])
    }
    mesh.count = bubbles.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={(m) => {
        ref.current = m
        if (m && !m.instanceColor) {
          m.setColorAt(0, TINTS[0])
          m.count = 0
        }
      }}
      args={[geometry, material, MAX_BUBBLES]}
      frustumCulled={false}
      renderOrder={6}
    />
  )
}

const sparkVertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (40.0 / -mv.z);
    vAlpha = aAlpha;
    vColor = aColor;
  }
`

const sparkFragment = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    gl_FragColor = vec4(vColor * a * 1.6, a);
  }
`

/** Glowy particle bursts (crumbs, coin sparkles, scrub foam). */
export function SparkRenderer() {
  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS), 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS), 1).setUsage(THREE.DynamicDrawUsage))
    const mat = new THREE.ShaderMaterial({
      vertexShader: sparkVertex,
      fragmentShader: sparkFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPixelRatio: { value: 1 } },
    })
    return { geometry: geo, material: mat }
  }, [])

  useFrame(({ gl }) => {
    material.uniforms.uPixelRatio.value = gl.getPixelRatio()
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute
    const col = geometry.getAttribute('aColor') as THREE.BufferAttribute
    const size = geometry.getAttribute('aSize') as THREE.BufferAttribute
    const alpha = geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i]
      pos.setXYZ(i, s.position.x, s.position.y, s.position.z)
      col.setXYZ(i, s.color.r, s.color.g, s.color.b)
      size.setX(i, s.size)
      alpha.setX(i, Math.min(1, (s.life / s.maxLife) * 1.5))
    }
    geometry.setDrawRange(0, sparks.length)
    pos.needsUpdate = true
    col.needsUpdate = true
    size.needsUpdate = true
    alpha.needsUpdate = true
  })

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={12} />
}
