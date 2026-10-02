import * as THREE from 'three'
import { PERIMETER, TANK_BOTTOM_Y, TANK_HEIGHT, WATER_LINE_Y } from '../scene/TankBounds'
import { fbm3 } from '../utils/noise'

/**
 * Algae lives on a low-res grid wrapped around all four glass walls (see the
 * "unrolled perimeter" notes in TankBounds). The glass shader samples this
 * grid through a DataTexture and adds noise on top for organic edges, so the
 * grid itself can stay small enough to save in localStorage.
 */

export const ALGAE_RES = 6
export const ALGAE_COLS = Math.round(PERIMETER * ALGAE_RES)
export const ALGAE_HEIGHT = TANK_HEIGHT - TANK_BOTTOM_Y
export const ALGAE_ROWS = Math.ceil(ALGAE_HEIGHT * ALGAE_RES)

const CELLS = ALGAE_COLS * ALGAE_ROWS
const grid = new Float32Array(CELLS)
const weight = new Float32Array(CELLS)
const texData = new Uint8Array(CELLS)

export const algaeTexture = new THREE.DataTexture(texData, ALGAE_COLS, ALGAE_ROWS, THREE.RedFormat, THREE.UnsignedByteType)
algaeTexture.magFilter = THREE.LinearFilter
algaeTexture.minFilter = THREE.LinearFilter
algaeTexture.wrapS = THREE.RepeatWrapping
algaeTexture.wrapT = THREE.ClampToEdgeWrapping
algaeTexture.needsUpdate = true

let dirty = true
let coverageCache = 0

const MAX_ROW = Math.floor((WATER_LINE_Y + 0.05 - TANK_BOTTOM_Y) * ALGAE_RES)

// Some patches of glass grow algae much faster than others, more near the
// gravel and in a band along the waterline — like a real neglected tank.
for (let row = 0; row < ALGAE_ROWS; row++) {
  const y = TANK_BOTTOM_Y + (row + 0.5) / ALGAE_RES
  for (let col = 0; col < ALGAE_COLS; col++) {
    const s = (col + 0.5) / ALGAE_RES
    const angle = (s / PERIMETER) * Math.PI * 2
    // Sample noise on a cylinder so the pattern wraps seamlessly around the corners.
    const n = fbm3(Math.cos(angle) * 3.2, y * 0.55, Math.sin(angle) * 3.2, 4)
    const bottom = Math.max(0, 1 - (y - TANK_BOTTOM_Y) / 2.2) * 0.35
    const waterline = Math.exp(-Math.pow((y - (WATER_LINE_Y - 0.25)) * 3, 2)) * 0.3
    weight[row * ALGAE_COLS + col] = row > MAX_ROW ? 0 : Math.max(0.04, Math.min(1.3, 0.35 + n * 1.5 + bottom + waterline))
  }
}

function recomputeCoverage() {
  let sum = 0
  let count = 0
  for (let row = 0; row <= Math.min(MAX_ROW, ALGAE_ROWS - 1); row++) {
    for (let col = 0; col < ALGAE_COLS; col++) {
      sum += grid[row * ALGAE_COLS + col]
      count++
    }
  }
  coverageCache = count > 0 ? sum / count : 0
}

/** Average algae level below the waterline, 0..1. */
export function algaeCoverage(): number {
  return coverageCache
}

/**
 * Grow algae for `seconds` of game time; murkier water grows it faster.
 * `multiplier` comes from gadgets like moss balls (0.65 = 35% slower).
 */
export function growAlgae(seconds: number, murk: number, multiplier = 1) {
  const rate = (seconds / (14 * 60)) * (0.55 + murk * 1.5) * multiplier
  for (let i = 0; i < CELLS; i++) {
    const w = weight[i]
    if (w <= 0) continue
    grid[i] = Math.min(1, grid[i] + rate * w)
  }
  dirty = true
  recomputeCoverage()
}

/**
 * Wipe algae in an ellipse around (s, y): `radius` along the glass and
 * `radiusY` vertically (defaults to round). Returns how much was removed
 * (in cell units).
 */
export function scrubAlgae(s: number, y: number, radius: number, strength: number, radiusY = radius): number {
  const r = radius * ALGAE_RES
  const ry = radiusY * ALGAE_RES
  const cx = s * ALGAE_RES
  const cy = (y - TANK_BOTTOM_Y) * ALGAE_RES
  let removed = 0
  for (let row = Math.max(0, Math.floor(cy - ry)); row <= Math.min(ALGAE_ROWS - 1, Math.ceil(cy + ry)); row++) {
    for (let dc = Math.floor(-r); dc <= Math.ceil(r); dc++) {
      const colF = Math.floor(cx) + dc
      const col = ((colF % ALGAE_COLS) + ALGAE_COLS) % ALGAE_COLS
      const dx = (colF + 0.5 - cx) / r
      const dy = (row + 0.5 - cy) / ry
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > 1) continue
      const falloff = 1 - d
      const i = row * ALGAE_COLS + col
      const take = Math.min(grid[i], strength * (0.35 + falloff * 0.65))
      if (take > 0) {
        grid[i] -= take
        removed += take
      }
    }
  }
  if (removed > 0) {
    dirty = true
    recomputeCoverage()
  }
  return removed
}

/** Algae amount at a point (for snails deciding where to crawl). */
export function algaeAt(s: number, y: number): number {
  const col = ((Math.floor(s * ALGAE_RES) % ALGAE_COLS) + ALGAE_COLS) % ALGAE_COLS
  const row = Math.max(0, Math.min(ALGAE_ROWS - 1, Math.floor((y - TANK_BOTTOM_Y) * ALGAE_RES)))
  return grid[row * ALGAE_COLS + col]
}

/** Push grid changes to the GPU texture, at most once per frame. */
export function syncAlgaeTexture() {
  if (!dirty) return
  for (let i = 0; i < CELLS; i++) texData[i] = Math.round(grid[i] * 255)
  algaeTexture.needsUpdate = true
  dirty = false
}

// --- persistence -----------------------------------------------------------

const STORAGE_KEY = 'aquarium-algae'

interface AlgaeSave {
  v: 1
  t: number
  cols: number
  rows: number
  d: string
}

let frozen = false

/** Stop writing algae to storage (while visiting a friend's tank). */
export function freezeAlgaeSaves() {
  frozen = true
}

export function saveAlgae() {
  if (frozen) return
  try {
    const bytes = new Uint8Array(CELLS)
    for (let i = 0; i < CELLS; i++) bytes[i] = Math.round(grid[i] * 255)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const save: AlgaeSave = { v: 1, t: Date.now(), cols: ALGAE_COLS, rows: ALGAE_ROWS, d: btoa(binary) }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save))
  } catch {
    // Storage full or blocked (private mode) — algae just won't persist.
  }
}

/** Load saved algae and apply growth for the time the player was away. */
export function loadAlgae(murk: number, multiplier = 1) {
  let loaded = false
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const save = JSON.parse(raw) as AlgaeSave
      if (save.v === 1 && save.cols === ALGAE_COLS && save.rows === ALGAE_ROWS) {
        const binary = atob(save.d)
        for (let i = 0; i < CELLS && i < binary.length; i++) grid[i] = binary.charCodeAt(i) / 255
        const awaySeconds = Math.min(8 * 60 * 60, Math.max(0, (Date.now() - save.t) / 1000))
        growAlgae(awaySeconds, murk, multiplier)
        loaded = true
      }
    }
  } catch {
    loaded = false
  }
  // Brand-new tanks start with a little algae so there's something to scrub.
  if (!loaded) growAlgae(6 * 60, 0.2)
  recomputeCoverage()
  dirty = true
}
