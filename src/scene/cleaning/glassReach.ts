import { GLASS_THICKNESS, TANK_BOTTOM_Y, TANK_HEIGHT, type WallMapping } from '../TankBounds'
import type { GlassToolDef } from './toolDefinitions'

/** Keep the head on the glass, allowing its pad to reach the corner seams. */
export function clampGlassHead(tool: GlassToolDef, wall: WallMapping, along: number, y: number) {
  const halfLen = wall.length / 2 - GLASS_THICKNESS / 2 - tool.halfWidth * 0.5 - 0.02
  const a = Math.max(-halfLen, Math.min(halfLen, along))
  // Algae wraps to the bottom of the glass, including the gravel's edge.
  // A floor-height clamp leaves that strip permanently beyond the pad.
  const minY = TANK_BOTTOM_Y + 0.02 + tool.halfHeight
  const maxY = TANK_HEIGHT - 0.05 - tool.halfHeight
  return { along: a, y: Math.max(minY, Math.min(maxY, y)) }
}
