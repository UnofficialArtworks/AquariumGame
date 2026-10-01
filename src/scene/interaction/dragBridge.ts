import type * as THREE from 'three'

/**
 * Bridges DragSurface's pointer-move handler to whichever decoration group is
 * currently being dragged, without putting a per-frame position into React
 * or zustand state (that would cause a render/localStorage-write storm).
 * DragSurface mutates `current.position` directly inside its pointer handler.
 */
export const dragBridge: { current: THREE.Object3D | null; footprintRadius: number } = {
  current: null,
  footprintRadius: 0,
}
