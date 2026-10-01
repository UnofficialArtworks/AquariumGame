import * as THREE from 'three'

/**
 * Where the active cleaning tool is hovering, written by pointer handlers
 * and read by the 3D sponge/siphon models every frame.
 */
export const toolCursor = {
  visible: false,
  active: false,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(0, 0, -1),
  lastScrubAt: 0,
}
