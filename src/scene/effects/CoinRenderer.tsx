import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { coinBubbles, collectCoinBubble, MAX_COINS } from '../../sim/coins'
import { useUIStore } from '../../state/useUIStore'
import coinUrl from '../../assets/coin.svg'

const coinGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.016, 24).rotateX(Math.PI / 2)
const edgeMaterial = new THREE.MeshStandardMaterial({
  color: '#ffc93d',
  metalness: 1,
  roughness: 0.22,
  emissive: '#ff9d00',
  emissiveIntensity: 0.35,
})
// Both faces wear the same coin art as the UI. The art's coin fills 30/32 of the image, so zoom in to its
// edge, and turn it so the fish swims level (cylinder caps map the image a quarter-turn round).
const coinFace = new THREE.TextureLoader().load(coinUrl)
coinFace.colorSpace = THREE.SRGBColorSpace
coinFace.center.set(0.5, 0.5)
coinFace.repeat.setScalar(30 / 32)
coinFace.rotation = Math.PI / 2
const faceMaterial = new THREE.MeshStandardMaterial({
  map: coinFace,
  metalness: 0.5,
  roughness: 0.3,
  emissive: '#ffffff',
  emissiveMap: coinFace,
  emissiveIntensity: 0.3,
})
// Cylinder groups: side, top cap, bottom cap.
const coinMaterial = [edgeMaterial, faceMaterial, faceMaterial]
const shellGeometry = new THREE.SphereGeometry(1, 20, 14)

const bubbleVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const bubbleFragment = /* glsl */ `
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    // Clamp before pow(): pow(negative) is NaN and bloom spreads NaN frame-wide.
    float f = clamp(1.0 - abs(dot(normalize(vN), normalize(vView))), 0.0, 1.0);
    float rim = pow(f, 2.2);
    vec3 L = normalize(vec3(0.3, 1.0, 0.5));
    float spec = pow(max(dot(reflect(-L, vN), vView), 0.0), 50.0);
    // Soap-film shimmer around the rim.
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (f * 1.5 + uTime * 0.2 + vec3(0.0, 0.33, 0.67)));
    vec3 col = mix(vec3(0.85, 0.95, 1.0), film, 0.45) * (0.35 + rim * 1.4) + spec * 2.0;
    float a = clamp(rim * 0.9 + spec + 0.05, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }
`

/** Gold coins wrapped in shimmering bubbles. Tap one for double coins. */
export function CoinRenderer() {
  const coinRef = useRef<THREE.InstancedMesh>(null)
  const shellRef = useRef<THREE.InstancedMesh>(null)
  const uids = useRef<number[]>([])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const shellMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: bubbleVertex,
        fragmentShader: bubbleFragment,
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 } },
      }),
    [],
  )

  useFrame(({ clock }) => {
    const coins = coinRef.current
    const shells = shellRef.current
    if (!coins || !shells) return
    const t = clock.elapsedTime
    shellMaterial.uniforms.uTime.value = t
    uids.current.length = 0
    coinBubbles.filter((c) => c.habitat === useUIStore.getState().activeTank).forEach((c, i) => {
      const appear = Math.min(1, c.age * 3)
      dummy.position.copy(c.position)
      dummy.rotation.set(0, t * 2.5 + c.phase, 0)
      dummy.scale.setScalar(appear * (0.9 + Math.min(c.value, 20) * 0.02))
      dummy.updateMatrix()
      coins.setMatrixAt(i, dummy.matrix)
      dummy.rotation.set(0, 0, 0)
      const wobble = 1 + Math.sin(t * 5 + c.phase) * 0.05
      dummy.scale.set(appear * 0.13 * wobble, appear * 0.13 / wobble, appear * 0.13)
      dummy.updateMatrix()
      shells.setMatrixAt(i, dummy.matrix)
      uids.current.push(c.uid)
    })
    coins.count = uids.current.length
    shells.count = uids.current.length
    coins.instanceMatrix.needsUpdate = true
    shells.instanceMatrix.needsUpdate = true
    // Raycasting culls against this sphere, so keep it current as coins move.
    shells.computeBoundingSphere()
  })

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    const mode = useUIStore.getState().mode
    if (mode === 'decorate' || mode === 'clean') return
    if (e.instanceId === undefined) return
    const uid = uids.current[e.instanceId]
    if (uid !== undefined && collectCoinBubble(uid)) e.stopPropagation()
  }

  return (
    <group>
      <instancedMesh ref={coinRef} args={[coinGeometry, coinMaterial, MAX_COINS]} frustumCulled={false} />
      <instancedMesh
        ref={shellRef}
        args={[shellGeometry, shellMaterial, MAX_COINS]}
        frustumCulled={false}
        renderOrder={7}
        onPointerDown={onPointerDown}
        userData={{ coinBubbles: true }}
      />
    </group>
  )
}
