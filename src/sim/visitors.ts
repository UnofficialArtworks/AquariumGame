import * as THREE from 'three'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { eligibleVisitors, getVisitor, pickVisitor, visitSpot, type VisitorDef } from '../state/visitors'
import { getDecorationDef } from '../scene/decorations/decorationDefinitions'
import { clampToInterior, currentMaxSwimY, floorHeightAt, INTERIOR_HALF_DEPTH } from '../scene/TankBounds'
import { obstacles } from './world'
import { randomRange } from '../utils/math'

/** How long a visitor stays, in seconds. */
const STAY: [number, number] = [70, 110]
/** Quiet time between one visitor leaving and the next arriving, in seconds. */
const GAP: [number, number] = [150, 300]
/** The first visitor of a session turns up fairly soon. */
const FIRST: [number, number] = [45, 75]
/** How long the fade-out lasts before the gift appears, in ms. */
export const LEAVE_MS = 1100

/** Where the current visitor is (the scene keeps this up to date), so its gift lands there. */
export const visitorSpot = new THREE.Vector3()

let nextAt = 0
let uid = 1
let last: string | undefined

/** Crawlers live on the gravel; everyone else swims. */
export function walksOnGravel(v: VisitorDef): boolean {
  return v.rig === 'crab' || v.rig === 'hermit' || v.rig === 'shrimp'
}

function homeFor(v: VisitorDef): [number, number, number] {
  const placed = useGameStore.getState().placedDecorations
  const [x, z] = visitSpot(v, placed)
  if (walksOnGravel(v)) return [x, floorHeightAt(x, z), z]
  // Swimmers hover around the top of what they came for.
  const ids = [...(v.needs.any ?? []), ...(v.needs.all ?? [])]
  const near = placed.filter((d) => ids.includes(d.defId)).map((d) => getDecorationDef(d.defId)?.height ?? 0)
  const height = near.length ? Math.max(...near) : 1.2
  const y = Math.min(currentMaxSwimY() - 0.4, floorHeightAt(x, z) + Math.min(height, 2.2) * 0.7 + 0.45)
  // ...and a little toward the front glass, so they don't hide behind it.
  return [x, y, z * 0.5 + INTERIOR_HALF_DEPTH * 0.3]
}

/** Nudge a spot out from under any decoration, so a gift never ends up inside one. */
export function clearOfDecorations(x: number, z: number): [number, number] {
  for (let pass = 0; pass < 3; pass++) {
    for (const o of obstacles) {
      const dx = x - o.x
      const dz = z - o.z
      const d = Math.hypot(dx, dz)
      const need = o.r + 0.15
      if (d >= need) continue
      const nx = d > 0.001 ? dx / d : 1
      const nz = d > 0.001 ? dz / d : 0
      x = o.x + nx * need
      z = o.z + nz * need
    }
    ;[x, z] = clampToInterior(x, z, 0.2)
  }
  return [x, z]
}

/** Send a particular visitor right now (QA, and the first visit of a session). */
export function startVisit(visitorId: string, now = Date.now()): boolean {
  const v = getVisitor(visitorId)
  if (!v || useUIStore.getState().visit) return false
  const home = homeFor(v)
  visitorSpot.set(...home)
  useUIStore.getState().setVisit({
    uid: uid++,
    visitorId,
    home,
    arrivedAt: now,
    leaveAt: now + randomRange(STAY[0], STAY[1]) * 1000,
    leavingAt: null,
  })
  last = visitorId
  useGameStore.getState().visitorArrived(visitorId)
  return true
}

/**
 * Called once a second. Brings a visitor when it's time and the tank has
 * something one likes, sends it home when its stay is up, and drops its gift
 * where it was. Visitors only come while the main tank is on screen.
 */
export function updateVisitors(now = Date.now()) {
  const ui = useUIStore.getState()
  const visit = ui.visit
  if (!nextAt) nextAt = now + randomRange(FIRST[0], FIRST[1]) * 1000
  if (visit) {
    const v = getVisitor(visit.visitorId)
    if (visit.leavingAt === null) {
      // Leave early if what it came for was taken away.
      const placed = useGameStore.getState().placedDecorations
      const welcome = v && eligibleVisitors(placed, 'any').includes(v)
      if (now >= visit.leaveAt || !welcome) ui.setVisit({ ...visit, leavingAt: now })
      return
    }
    if (now - visit.leavingAt < LEAVE_MS) return
    if (v) useGameStore.getState().leaveGift(v.id, ...clearOfDecorations(visitorSpot.x, visitorSpot.z))
    ui.setVisit(null)
    nextAt = now + randomRange(GAP[0], GAP[1]) * 1000
    return
  }
  if (now < nextAt || document.hidden || ui.activeTank !== 'main') return
  const s = useGameStore.getState()
  const eligible = eligibleVisitors(s.placedDecorations, ui.nightLevel >= 0.5 ? 'night' : 'day')
  const v = pickVisitor(eligible, s.visitors, Math.random, last)
  if (!v) {
    nextAt = now + 20_000
    return
  }
  startVisit(v.id, now)
}

/** Forget timing (tests, and a fresh save). */
export function resetVisitors() {
  nextAt = 0
  last = undefined
  useUIStore.getState().setVisit(null)
}
