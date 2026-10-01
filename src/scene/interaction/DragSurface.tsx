import { useEffect } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../state/useUIStore'
import { useGameStore } from '../../state/useGameStore'
import { clampToInterior, floorHeightAt, TANK_DEPTH, TANK_WIDTH } from '../TankBounds'
import { dragBridge } from './dragBridge'

export function DragSurface() {
  const draggingId = useUIStore((s) => s.draggingId)
  const setDraggingId = useUIStore((s) => s.setDraggingId)
  const updateDecorationTransform = useGameStore((s) => s.updateDecorationTransform)

  const release = () => {
    const group = dragBridge.current
    if (draggingId && group) {
      group.position.y = floorHeightAt(group.position.x, group.position.z) - 0.02
      updateDecorationTransform(draggingId, [group.position.x, 0, group.position.z])
    }
    dragBridge.current = null
    setDraggingId(null)
  }

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!draggingId || !dragBridge.current) return
    const [x, z] = clampToInterior(event.point.x, event.point.z, dragBridge.footprintRadius)
    // Lift slightly while carried, then it settles onto the sloped gravel on drop.
    dragBridge.current.position.set(x, floorHeightAt(x, z) + 0.08, z)
  }

  // Safety net: if the pointer is released outside the plane's finite bounds,
  // the plane's own onPointerUp never fires, so also listen globally.
  useEffect(() => {
    if (!draggingId) return
    window.addEventListener('pointerup', release)
    return () => window.removeEventListener('pointerup', release)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId])

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.001, 0]}
      onPointerMove={onPointerMove}
      onPointerUp={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        release()
      }}
    >
      <planeGeometry args={[TANK_WIDTH * 2, TANK_DEPTH * 2]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}
