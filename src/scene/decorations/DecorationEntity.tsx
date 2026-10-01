import { useMemo, useRef } from 'react'
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
  const { groupRef, onPointerDown, onPointerUp } = useDecorationDrag(instance.id, def?.footprintRadius ?? 0.3)
  const isSelected = useUIStore((s) => s.selectedDecorationId === instance.id)
  const isDecorateMode = useUIStore((s) => s.mode === 'decorate')

  if (!def) return null
  const [x, , z] = instance.position

  return (
    <group
      ref={groupRef}
      position={[x, floorHeightAt(x, z) - 0.02, z]}
      rotation={[0, instance.rotationY, 0]}
      onPointerDown={isDecorateMode ? onPointerDown : undefined}
      onPointerUp={isDecorateMode ? onPointerUp : undefined}
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
      {isSelected && isDecorateMode && <SelectionRing radius={def.footprintRadius} />}
    </group>
  )
}
