import type { DecorationInstance } from '../state/types'

/** Fixed, open layout leaves room for little fish to find their snacks. */
export const NURSERY_DECORATIONS: DecorationInstance[] = [
  { id: 'nursery-fern-left', defId: 'green-plant', position: [-2.7, 0, -0.7], rotationY: 0.3 },
  { id: 'nursery-fern-right', defId: 'green-plant', position: [2.7, 0, -0.7], rotationY: -0.3 },
  { id: 'nursery-shells', defId: 'seashell-cluster', position: [-1.6, 0, 0.1], rotationY: 0.4 },
  { id: 'nursery-bubbles', defId: 'air-stone', position: [2, 0, 0.2], rotationY: 0 },
]

/** The Koi Pond: lily pads reaching the surface, soft grass, rocks and driftwood. */
export const POND_DECORATIONS: DecorationInstance[] = [
  { id: 'pond-lily-1', defId: 'flower-plant', position: [-2.2, 0, -0.8], rotationY: 0.2 },
  { id: 'pond-lily-2', defId: 'flower-plant', position: [1.4, 0, -0.95], rotationY: 1.1 },
  { id: 'pond-lily-3', defId: 'flower-plant', position: [2.9, 0, 0.55], rotationY: 2.3 },
  { id: 'pond-grass-1', defId: 'hair-grass', position: [-0.6, 0, -0.6], rotationY: 0 },
  { id: 'pond-grass-2', defId: 'hair-grass', position: [0.7, 0, 0.9], rotationY: 0.8 },
  { id: 'pond-rocks-1', defId: 'rock-cluster', position: [-2.8, 0, 0.7], rotationY: 0.5 },
  { id: 'pond-rocks-2', defId: 'rock-cluster', position: [2.4, 0, -0.45], rotationY: 2 },
  { id: 'pond-wood', defId: 'driftwood', position: [-1.2, 0, 0.35], rotationY: 1.3 },
  { id: 'pond-fern', defId: 'green-plant', position: [3.1, 0, -1.05], rotationY: -0.4 },
]
