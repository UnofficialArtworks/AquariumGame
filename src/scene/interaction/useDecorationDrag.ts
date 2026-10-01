import { useRef } from 'react'
import type { Group } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../state/useUIStore'
import { dragBridge } from './dragBridge'

/**
 * Attach the returned handlers to a decoration's root group. Picking it up
 * hands its Object3D off to DragSurface (see dragBridge.ts), which does the
 * actual per-frame position updates while the pointer moves.
 */
export function useDecorationDrag(instanceId: string, footprintRadius: number) {
  const groupRef = useRef<Group>(null)
  const setDraggingId = useUIStore((s) => s.setDraggingId)
  const setSelectedDecorationId = useUIStore((s) => s.setSelectedDecorationId)

  const pointerDownAt = useRef<{ x: number; y: number } | null>(null)

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    pointerDownAt.current = { x: event.clientX, y: event.clientY }
    if (!groupRef.current) return
    dragBridge.current = groupRef.current
    dragBridge.footprintRadius = footprintRadius
    setDraggingId(instanceId)
  }

  const onPointerUp = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    const start = pointerDownAt.current
    const moved = start
      ? Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4
      : false
    if (!moved) setSelectedDecorationId(instanceId)
  }

  return { groupRef, onPointerDown, onPointerUp }
}
