import { useRef } from 'react'
import type { Group } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../state/useUIStore'
import { startDrag } from './dragBridge'
import { touches } from './touches'

/**
 * Attach the returned handler to a decoration's root group. Pressing it picks
 * it up; DragSurface carries it while the pointer moves, and a press that
 * barely moves just selects it.
 */
export function useDecorationDrag(instanceId: string, footprintRadius: number) {
  const groupRef = useRef<Group>(null)

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    // Only a left click or a single finger picks a decoration up. The right
    // button and a second finger turn the camera, even over a decoration.
    if (event.button !== 0 || touches.count > 1 || useUIStore.getState().draggingId) return
    event.stopPropagation()
    if (groupRef.current) startDrag(instanceId, groupRef.current, footprintRadius, event)
  }

  return { groupRef, onPointerDown }
}
