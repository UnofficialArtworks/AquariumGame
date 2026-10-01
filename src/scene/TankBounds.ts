// Single source of truth for tank dimensions. Everything that needs to know
// how big the tank is (walls, gravel, camera framing, drag clamping, fish
// wander bounds, algae grid, water absorption) reads from here so there is
// never a second copy to drift.

import { noise2 } from '../utils/noise'

export const TANK_WIDTH = 8
export const TANK_HEIGHT = 4.5
export const TANK_DEPTH = 4

export const GLASS_THICKNESS = 0.08
export const FLOOR_Y = 0
/** Bottom of the gravel bed / glass box. The gravel surface itself sits above FLOOR_Y. */
export const TANK_BOTTOM_Y = -0.32
export const WATER_LINE_Y = TANK_HEIGHT * 0.92

export const HALF_WIDTH = TANK_WIDTH / 2
export const HALF_DEPTH = TANK_DEPTH / 2

// How far from the glass walls placed items/fish are kept, so nothing visually
// clips through the walls.
export const INTERIOR_MARGIN = 0.35

export const INTERIOR_HALF_WIDTH = HALF_WIDTH - INTERIOR_MARGIN
export const INTERIOR_HALF_DEPTH = HALF_DEPTH - INTERIOR_MARGIN

// Vertical swimming band for fish, kept well clear of the gravel and the
// water line so nothing pokes out of the water or burrows into the floor.
export const INTERIOR_MIN_Y = FLOOR_Y + 0.5
export const INTERIOR_MAX_Y = WATER_LINE_Y - 0.4

/**
 * Live, non-React water level. Normally WATER_LINE_Y, but a water change
 * drains and refills it, and fish/food/bubbles read it every frame.
 */
export const waterLevel = { current: WATER_LINE_Y }

export function currentMaxSwimY(): number {
  return Math.min(INTERIOR_MAX_Y, waterLevel.current - 0.4)
}

/**
 * Height of the gravel surface. It slopes up toward the back of the tank
 * (the classic aquascape look) with a little noise so it doesn't read as a
 * flat board. Decorations, food and waste all sit on this.
 */
export function floorHeightAt(x: number, z: number): number {
  const backness = Math.min(1, Math.max(0, (HALF_DEPTH - z) / TANK_DEPTH))
  const slope = 0.07 + 0.24 * Math.pow(backness, 1.4)
  const bumps = noise2(x * 0.55 + 11.3, z * 0.55 - 4.1) * 0.05
  return FLOOR_Y + slope + bumps
}

export function clampToInterior(x: number, z: number, footprintRadius = 0): [number, number] {
  const maxX = INTERIOR_HALF_WIDTH - footprintRadius
  const maxZ = INTERIOR_HALF_DEPTH - footprintRadius
  return [Math.max(-maxX, Math.min(maxX, x)), Math.max(-maxZ, Math.min(maxZ, z))]
}

export function clampToSwimBounds(x: number, y: number, z: number, margin = 0): [number, number, number] {
  const [cx, cz] = clampToInterior(x, z, margin)
  const cy = Math.max(INTERIOR_MIN_Y, Math.min(currentMaxSwimY(), y))
  return [cx, cy, cz]
}

// --- Glass perimeter -------------------------------------------------------
// The four glass walls are treated as one long "unrolled" strip so algae,
// scrubbing and crawling snails can all work in a single 2D (s, y) space:
//   front  z=+D/2, x: -W/2 -> +W/2   s in [0, W)
//   right  x=+W/2, z: +D/2 -> -D/2   s in [W, W+D)
//   back   z=-D/2, x: +W/2 -> -W/2   s in [W+D, 2W+D)
//   left   x=-W/2, z: -D/2 -> +D/2   s in [2W+D, 2W+2D)

export const PERIMETER = 2 * TANK_WIDTH + 2 * TANK_DEPTH

export type WallId = 'front' | 'right' | 'back' | 'left'

export interface WallMapping {
  id: WallId
  /** Which world axis runs along the wall. */
  axis: 'x' | 'z'
  /** s = a * worldAxisCoord + b */
  a: number
  b: number
  /** Inward-facing unit normal. */
  normal: [number, number, number]
  /** Fixed coordinate of the (inner) glass plane on the other horizontal axis. */
  planeCoord: number
  length: number
}

const INNER = GLASS_THICKNESS / 2

export const WALLS: WallMapping[] = [
  { id: 'front', axis: 'x', a: 1, b: HALF_WIDTH, normal: [0, 0, -1], planeCoord: HALF_DEPTH - INNER, length: TANK_WIDTH },
  { id: 'right', axis: 'z', a: -1, b: TANK_WIDTH + HALF_DEPTH, normal: [-1, 0, 0], planeCoord: HALF_WIDTH - INNER, length: TANK_DEPTH },
  { id: 'back', axis: 'x', a: -1, b: TANK_WIDTH + TANK_DEPTH + HALF_WIDTH, normal: [0, 0, 1], planeCoord: -HALF_DEPTH + INNER, length: TANK_WIDTH },
  { id: 'left', axis: 'z', a: 1, b: 2 * TANK_WIDTH + TANK_DEPTH + HALF_DEPTH, normal: [1, 0, 0], planeCoord: -HALF_WIDTH + INNER, length: TANK_DEPTH },
]

/** Perimeter coordinate s for a world point known to lie on the given wall. */
export function perimeterS(wall: WallMapping, x: number, z: number): number {
  return wall.a * (wall.axis === 'x' ? x : z) + wall.b
}

function wrapS(s: number): number {
  return ((s % PERIMETER) + PERIMETER) % PERIMETER
}

/** Which wall a perimeter coordinate falls on. */
export function wallForS(s: number): WallMapping {
  const w = wrapS(s)
  if (w < TANK_WIDTH) return WALLS[0]
  if (w < TANK_WIDTH + TANK_DEPTH) return WALLS[1]
  if (w < 2 * TANK_WIDTH + TANK_DEPTH) return WALLS[2]
  return WALLS[3]
}

/** Inverse of perimeterS: world position on the inner glass surface. */
export function perimeterToWorld(s: number, y: number, inset = 0): [number, number, number] {
  const wrapped = wrapS(s)
  const wall = wallForS(wrapped)
  const along = (wrapped - wall.b) / wall.a
  const plane = wall.planeCoord + (wall.axis === 'x' ? wall.normal[2] : wall.normal[0]) * inset
  return wall.axis === 'x' ? [along, y, plane] : [plane, y, along]
}
