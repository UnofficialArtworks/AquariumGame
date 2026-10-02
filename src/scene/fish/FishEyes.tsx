import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { makeAqua } from '../materials/aquaShader'

export const eyeWhite = makeAqua(new THREE.MeshStandardMaterial({ color: '#f7f7f2', roughness: 0.25 }), {}, 'aqua-eye-white')
export const eyePupil = makeAqua(new THREE.MeshStandardMaterial({ color: '#0b0b10', roughness: 0.08, metalness: 0.2 }), {}, 'aqua-eye-pupil')
export const eyeShine = new THREE.MeshBasicMaterial({ color: '#ffffff' })
export const EYE_GEOMETRY = new THREE.SphereGeometry(1, 14, 10)

/** One fish's two eyes, in the fish body's local space. Pupil/shine offsets are relative to each eye centre. */
export interface EyeRig {
  root: THREE.Object3D
  eyes: Array<{ center: THREE.Vector3; size: number; pupil: THREE.Vector3; shine: THREE.Vector3 }>
}

/** Live fish register here; FishEyesRenderer draws every eye in the tank in three instanced draw calls. */
export const eyeRigs = new Set<EyeRig>()

const CAPACITY = 96
const local = new THREE.Matrix4()
const world = new THREE.Matrix4()
const position = new THREE.Vector3()
const scale = new THREE.Vector3()
const NO_ROTATION = new THREE.Quaternion()

/**
 * Eyes were six small meshes per fish (white, pupil and highlight per side),
 * which is a lot of draw calls for a full tank. Here they're batched. Runs
 * after the fish have moved this frame, so the eyes never lag their bodies.
 */
export function FishEyesRenderer() {
  const whiteRef = useRef<THREE.InstancedMesh>(null)
  const pupilRef = useRef<THREE.InstancedMesh>(null)
  const shineRef = useRef<THREE.InstancedMesh>(null)

  useFrame(() => {
    const white = whiteRef.current
    const pupil = pupilRef.current
    const shine = shineRef.current
    if (!white || !pupil || !shine) return
    let i = 0
    for (const rig of eyeRigs) {
      rig.root.updateWorldMatrix(true, false)
      for (const eye of rig.eyes) {
        if (i >= CAPACITY) break
        const write = (mesh: THREE.InstancedMesh, offset: THREE.Vector3 | null, size: number) => {
          position.copy(eye.center)
          if (offset) position.add(offset)
          local.compose(position, NO_ROTATION, scale.setScalar(size))
          mesh.setMatrixAt(i, world.multiplyMatrices(rig.root.matrixWorld, local))
        }
        write(white, null, eye.size)
        write(pupil, eye.pupil, eye.size * 0.62)
        write(shine, eye.shine, eye.size * 0.2)
        i++
      }
    }
    for (const mesh of [white, pupil, shine]) {
      mesh.count = i
      mesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <instancedMesh ref={whiteRef} args={[EYE_GEOMETRY, eyeWhite, CAPACITY]} frustumCulled={false} />
      <instancedMesh ref={pupilRef} args={[EYE_GEOMETRY, eyePupil, CAPACITY]} frustumCulled={false} />
      <instancedMesh ref={shineRef} args={[EYE_GEOMETRY, eyeShine, CAPACITY]} frustumCulled={false} />
    </>
  )
}
