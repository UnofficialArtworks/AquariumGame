import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { DecorationInstance } from '../../state/types'
import { useUIStore } from '../../state/useUIStore'
import { useDecorationDrag } from '../interaction/useDecorationDrag'
import { getDecorationDef } from './decorationDefinitions'
import { DecorationVisual } from './DecorationVisual'
import { floorHeightAt } from '../TankBounds'

const ringMaterial = new THREE.MeshBasicMaterial({
  color: new THREE.Color('#ffe066').multiplyScalar(2),
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  toneMapped: false,
})

/** Never drawn, but still hit by the pointer. */
const handleMaterial = new THREE.MeshBasicMaterial({ visible: false })

/**
 * An invisible column over the decoration's footprint while decorating, so
 * thin or lacy pieces (driftwood, fans, plants) are as easy to grab as a rock.
 */
function GrabHandle({ radius, height }: { radius: number; height: number }) {
  const h = Math.min(2.4, Math.max(0.35, height))
  const geometry = useMemo(() => new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, h, 16), [radius, h])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={handleMaterial} position={[0, h / 2, 0]} />
}

/** Glowing ring on the gravel marking the selected decoration. */
function SelectionRing({ radius }: { radius: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => new THREE.RingGeometry(radius * 0.95, radius * 1.05, 48).rotateX(-Math.PI / 2), [radius])
  useFrame(({ clock }) => {
    if (!ref.current) return
    const s = 1 + Math.sin(clock.elapsedTime * 5) * 0.04
    ref.current.scale.set(s, 1, s)
  })
  return <mesh ref={ref} geometry={geometry} material={ringMaterial} position={[0, 0.03, 0]} renderOrder={15} />
}

export function DecorationEntity({ instance }: { instance: DecorationInstance }) {
  const def = getDecorationDef(instance.defId)
  const { groupRef, onPointerDown } = useDecorationDrag(instance.id, def?.footprintRadius ?? 0.3)
  const isSelected = useUIStore((s) => s.selectedDecorationId === instance.id)
  const isCarried = useUIStore((s) => s.draggingId === instance.id)
  // Only the main aquarium's decorations can be moved (the nursery and pond are laid out for you).
  const isDecorateMode = useUIStore((s) => s.mode === 'decorate' && s.activeTank === 'main' && !s.visiting)

  if (!def) return null
  const [x, , z] = instance.position

  return (
    <group
      ref={groupRef}
      position={[x, floorHeightAt(x, z) - 0.02, z]}
      rotation={[0, instance.rotationY, 0]}
      onPointerDown={isDecorateMode ? onPointerDown : undefined}
      onPointerOver={
        isDecorateMode
          ? (e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              document.body.style.cursor = 'grab'
            }
          : undefined
      }
      onPointerOut={
        isDecorateMode
          ? () => {
              document.body.style.cursor = 'auto'
            }
          : undefined
      }
    >
      <DecorationVisual def={def} instanceId={instance.id} />
      {isDecorateMode && <GrabHandle radius={def.footprintRadius} height={def.height} />}
      {isSelected && isDecorateMode && !isCarried && <SelectionRing radius={def.footprintRadius} />}
    </group>
  )
}
