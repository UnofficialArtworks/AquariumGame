import type { DecorationInstance } from '../state/types'

/** Fixed, open layout leaves room for little fish to find their snacks. */
export const NURSERY_DECORATIONS: DecorationInstance[] = [
  { id: 'nursery-fern-left', defId: 'green-plant', position: [-2.7, 0, -0.7], rotationY: 0.3 },
  { id: 'nursery-fern-right', defId: 'green-plant', position: [2.7, 0, -0.7], rotationY: -0.3 },
  { id: 'nursery-shells', defId: 'seashell-cluster', position: [-1.6, 0, 0.1], rotationY: 0.4 },
  { id: 'nursery-bubbles', defId: 'air-stone', position: [2, 0, 0.2], rotationY: 0 },
]
