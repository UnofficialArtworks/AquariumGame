import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FishDefinition } from '../../state/types'
import { useGameStore } from '../../state/useGameStore'
import {
  COIN_INTERVAL_MAX,
  COIN_INTERVAL_MIN,
  coinValueFor,
  HUNGER_COIN_CUTOFF,
  HUNGER_FULL_THRESHOLD,
  sizeForGrowth,
} from '../../state/economy'
import {
  clampToInterior,
  currentMaxSwimY,
  floorHeightAt,
  INTERIOR_HALF_DEPTH,
  INTERIOR_HALF_WIDTH,
  INTERIOR_MIN_Y,
  waterLevel,
} from '../TankBounds'
import { anemoneSpots, fishAgents, obstacles, pointerAttract, simClock, type FishAgent } from '../../sim/world'
import { foodItems, removeFood, dropPoop, type FoodItem } from '../../sim/food'
import { spawnCoinBubble } from '../../sim/coins'
import { emitSparks } from '../../sim/sparks'
import { emitBubble } from '../../sim/bubbles'
import { spawnPopup } from '../../sim/popups'
import { sfx } from '../../audio/sfx'
import { atmosphere } from '../Atmosphere'
import { algaeCoverage } from '../../sim/algae'
import { randomRange } from '../../utils/math'
import { useUIStore } from '../../state/useUIStore'
import { bonusesFor } from '../../state/bonuses'

/** Vertical band a fish prefers, as [min, max] world Y. */
function zoneBand(def: FishDefinition): [number, number] {
  const top = currentMaxSwimY()
  const bottomMin = 0.42
  switch (def.zone) {
    case 'top':
      return [top - 1.3, top]
    case 'bottom':
      return [bottomMin, 1.2]
    case 'middle':
      return [INTERIOR_MIN_Y + 0.4, top - 0.5]
    default:
      return [INTERIOR_MIN_Y, top]
  }
}

function minYFor(def: FishDefinition, x: number, z: number): number {
  // Bottom dwellers may skim the gravel to reach sunken food.
  const floor = floorHeightAt(x, z)
  return def.zone === 'bottom' ? floor + def.bodyHeight * 0.55 + 0.04 : Math.max(INTERIOR_MIN_Y, floor + 0.35)
}

function pickWanderTarget(def: FishDefinition, out: THREE.Vector3) {
  const [lo, hi] = zoneBand(def)
  out.set(
    randomRange(-INTERIOR_HALF_WIDTH + 0.3, INTERIOR_HALF_WIDTH - 0.3),
    randomRange(lo, Math.max(lo + 0.1, hi)),
    randomRange(-INTERIOR_HALF_DEPTH + 0.3, INTERIOR_HALF_DEPTH - 0.3),
  )
  // Clownfish drift back toward an anemone when there is one.
  if (def.id === 'clownfish' && anemoneSpots.length > 0 && Math.random() < 0.7) {
    const spot = anemoneSpots[Math.floor(Math.random() * anemoneSpots.length)]
    out.set(spot.x + randomRange(-0.35, 0.35), spot.y + randomRange(0.25, 0.6), spot.z + randomRange(-0.35, 0.35))
  }
  return out
}

/** Per-species shared wander target so schools travel together. */
const schoolTargets = new Map<string, { target: THREE.Vector3; timer: number }>()

function schoolTarget(def: FishDefinition, dt: number): THREE.Vector3 {
  let entry = schoolTargets.get(def.id)
  if (!entry) {
    entry = { target: pickWanderTarget(def, new THREE.Vector3()), timer: randomRange(3, 6) }
    schoolTargets.set(def.id, entry)
  }
  entry.timer -= dt / Math.max(1, countSpecies(def.id))
  if (entry.timer <= 0) {
    pickWanderTarget(def, entry.target)
    entry.timer = randomRange(4, 8)
  }
  return entry.target
}

function countSpecies(defId: string): number {
  let n = 0
  for (const a of fishAgents.values()) if (a.def.id === defId) n++
  return n
}

function canReach(def: FishDefinition, food: FoodItem): boolean {
  if (food.habitat !== useUIStore.getState().activeTank) return false
  if (food.inedible || food.removed) return false
  if (food.state === 'resting') return def.zone === 'bottom'
  return true
}

const EFFECT_COLORS: Record<string, string> = {
  rainbow: '#ff7ae0',
  glow: '#5dfff0',
  golden: '#ffd24a',
  zoomies: '#ff9a3c',
  growth: '#8cff5a',
  hearts: '#ff5d8f',
}

function eat(agent: FishAgent, food: FoodItem, growth: number) {
  removeFood(food)
  const store = useGameStore.getState()
  store.fishAte(agent.id, food.def.id)
  agent.eatPulse = 0.3
  const t = simClock.t
  const mouth = agent.object.position
  emitSparks(mouth, 5, food.def.color, { speed: 0.35, size: 0.8, life: 0.5, buoyancy: -0.2 })
  sfx.chomp()
  const effect = food.def.effect
  if (effect === 'none') return
  const until = t + food.def.effectSeconds
  const label = mouth.clone().setY(mouth.y + 0.25)
  switch (effect) {
    case 'hearts':
      agent.effects.hearts = t + 3
      spawnPopup(label, '♥', '#ff5d8f', true)
      break
    case 'rainbow':
      agent.effects.rainbow = until
      spawnPopup(label, 'Rainbow!', EFFECT_COLORS.rainbow, true)
      sfx.magic()
      break
    case 'glow':
      agent.effects.glow = until
      spawnPopup(label, 'Glowing!', EFFECT_COLORS.glow, true)
      sfx.magic()
      break
    case 'zoomies':
      agent.effects.zoom = until
      spawnPopup(label, 'ZOOMIES!', EFFECT_COLORS.zoomies, true)
      sfx.magic()
      break
    case 'golden': {
      agent.effects.golden = until
      spawnPopup(label, 'Golden!', EFFECT_COLORS.golden, true)
      sfx.coin(true)
      const value = Math.max(3, coinValueFor(agent.def.coinValue || 2, growth) * 2)
      for (let i = 0; i < 6; i++) {
        const p = mouth.clone().add(new THREE.Vector3(randomRange(-0.3, 0.3), randomRange(-0.1, 0.25), randomRange(-0.3, 0.3)))
        spawnCoinBubble(p, value)
      }
      break
    }
    case 'growth':
      spawnPopup(label, 'Growing!', EFFECT_COLORS.growth, true)
      emitSparks(mouth, 20, EFFECT_COLORS.growth, { speed: 1, size: 1.2, life: 0.9 })
      sfx.magic()
      break
  }
  emitSparks(mouth, 16, EFFECT_COLORS[effect] ?? '#ffffff', { speed: 0.9, size: 1.2, life: 0.9 })
}

const scratchA = new THREE.Vector3()
const scratchB = new THREE.Vector3()
const scratchOffset = new THREE.Vector3()
const scratchCohesion = new THREE.Vector3()
const scratchAlignment = new THREE.Vector3()
const scratchMatrix = new THREE.Matrix4()
const scratchQuat = new THREE.Quaternion()
const rollQuat = new THREE.Quaternion()
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)
const UP = new THREE.Vector3(0, 1, 0)

/**
 * The "brain" of a swimming fish: wander/school, chase and eat food, flee
 * taps, avoid decorations and walls, sleep at night, drop coins and poop.
 * Everything lives in refs / the shared agent object and is mutated inside
 * useFrame — no React state updates per frame.
 */
export function useFishBrain(
  fishId: string,
  def: FishDefinition,
  { orientation = 'full', sizeScale = 1 }: { orientation?: 'full' | 'yaw' | 'none'; sizeScale?: number } = {},
) {
  const groupRef = useRef<THREE.Group>(null)
  const agentRef = useRef<FishAgent | null>(null)
  const wanderTarget = useRef(new THREE.Vector3())
  const wanderTimer = useRef(0)
  const coinTimer = useRef(randomRange(COIN_INTERVAL_MIN * 0.3, COIN_INTERVAL_MAX))
  const digest = useRef(0)
  const lookAhead = useRef(new THREE.Vector3())
  const prevYaw = useRef(0)
  const zoomBubbleTimer = useRef(0)

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    const agent: FishAgent = {
      id: fishId,
      def,
      object: group,
      velocity: new THREE.Vector3(randomRange(-0.2, 0.2), 0, randomRange(-0.2, 0.2)),
      effects: { rainbow: 0, glow: 0, golden: 0, zoom: 0, hearts: 0 },
      eatPulse: 0,
      puff: 0,
      startle: 0,
      startleFrom: new THREE.Vector3(),
      swimPhase: Math.random() * 10,
      effort: 0.3,
      bank: 0,
      sleeping: false,
      size: sizeForGrowth(useGameStore.getState().fishVitals[fishId]?.growth ?? 0, sizeScale),
    }
    agentRef.current = agent
    group.scale.setScalar(agent.size)
    fishAgents.set(fishId, agent)
    pickWanderTarget(def, wanderTarget.current)
    group.userData.fishId = fishId
    return () => {
      fishAgents.delete(fishId)
    }
  }, [fishId, def, sizeScale])

  useFrame((_, rawDelta) => {
    const group = groupRef.current
    const agent = agentRef.current
    if (!group || !agent) return
    const dt = Math.min(rawDelta, 0.05)
    const t = simClock.t
    const pos = group.position
    const vel = agent.velocity
    const store = useGameStore.getState()
    const vitals = store.fishVitals[fishId]
    const hunger = vitals?.hunger ?? 0
    const growth = vitals?.growth ?? 0

    agent.size = THREE.MathUtils.damp(agent.size, sizeForGrowth(growth, sizeScale), 2, dt)
    agent.eatPulse = Math.max(0, agent.eatPulse - dt)
    agent.puff = Math.max(0, agent.puff - dt * 0.18)

    const zooming = agent.effects.zoom > t
    agent.sleeping = atmosphere.night > 0.7 && !def.glow && agent.effects.glow < t && agent.startle <= 0
    let speed = def.maxSpeed * (zooming ? 2.2 : 1) * (agent.sleeping ? 0.3 : 1) * (hunger > 0.85 ? 0.8 : 1)
    const desired = scratchA.set(0, 0, 0)

    // --- choose a goal ----------------------------------------------------
    let chasing: FoodItem | null = null
    if (agent.startle > 0) {
      agent.startle -= dt
      desired.copy(pos).sub(agent.startleFrom).setY((pos.y - agent.startleFrom.y) * 0.3)
      if (desired.lengthSq() < 0.0001) desired.set(Math.random() - 0.5, 0, Math.random() - 0.5)
      desired.normalize().multiplyScalar(def.maxSpeed * 2.6)
      speed = def.maxSpeed * 2.6
    } else {
      if (hunger > HUNGER_FULL_THRESHOLD && !agent.sleeping) {
        let best = Infinity
        const senseSq = hunger > 0.45 ? 400 : 12
        for (const food of foodItems) {
          if (!canReach(def, food)) continue
          const d = food.position.distanceToSquared(pos)
          if (d < best && d < senseSq) {
            best = d
            chasing = food
          }
        }
      }
      if (chasing) {
        const eatRadius = def.bodyLength * 0.45 * agent.size + 0.07
        const dist = chasing.position.distanceTo(pos)
        if (dist < eatRadius) {
          eat(agent, chasing, growth)
          digest.current += chasing.def.nutrition
          chasing = null
        } else {
          speed = def.maxSpeed * (1.35 + hunger * 0.6) * (zooming ? 1.6 : 1)
          desired.copy(chasing.position).sub(pos).normalize().multiplyScalar(speed)
        }
      }
      if (!chasing) {
        const mode = useUIStore.getState().mode
        const curious =
          pointerAttract.active &&
          mode === 'view' &&
          !agent.sleeping &&
          t - pointerAttract.lastMove < 4 &&
          pointerAttract.point.distanceTo(pos) < 3.2
        let target: THREE.Vector3
        if (curious) {
          // Come up to the glass where the player is pointing, just inside it.
          target = scratchB.copy(pointerAttract.point)
          target.x *= 0.9
          target.z *= 0.8
          speed *= 0.7
        } else if (def.schooling && countSpecies(def.id) > 1) {
          target = schoolTarget(def, dt)
        } else {
          wanderTimer.current -= dt
          if (wanderTimer.current <= 0 || pos.distanceTo(wanderTarget.current) < 0.35) {
            pickWanderTarget(def, wanderTarget.current)
            wanderTimer.current = randomRange(3, 7)
          }
          target = wanderTarget.current
        }
        if (agent.sleeping) {
          // Drowsy fish drift slowly and sink toward a resting depth.
          target = scratchB.copy(wanderTarget.current)
          target.y = Math.min(target.y, 1.3)
        }
        desired.copy(target).sub(pos)
        const d = desired.length()
        if (d > 0.0001) desired.multiplyScalar(Math.min(1, d / 0.6) * speed / d)
      }
    }

    // --- schooling forces ---------------------------------------------------
    const separation = scratchB.set(0, 0, 0)
    let cohesionCount = 0
    const cohesion = scratchCohesion.set(0, 0, 0)
    const alignment = scratchAlignment.set(0, 0, 0)
    for (const other of fishAgents.values()) {
      if (other === agent) continue
      const offset = scratchOffset.copy(pos).sub(other.object.position)
      const d = offset.length()
      const personal = (def.bodyLength + other.def.bodyLength) * 0.55
      if (d < personal && d > 0.0001) separation.addScaledVector(offset.normalize(), (personal - d) / personal)
      if (def.schooling && other.def.id === def.id && d < 1.4) {
        cohesion.add(other.object.position)
        alignment.add(other.velocity)
        cohesionCount++
      }
    }
    desired.addScaledVector(separation, def.maxSpeed * 1.8)
    if (cohesionCount > 0 && agent.startle <= 0 && !chasing) {
      cohesion.divideScalar(cohesionCount).sub(pos)
      desired.addScaledVector(cohesion, 0.6)
      desired.addScaledVector(alignment.divideScalar(cohesionCount), 0.35)
    }

    // --- avoid decorations and walls ----------------------------------------
    for (const o of obstacles) {
      const dx = pos.x - o.x
      const dz = pos.z - o.z
      const d = Math.hypot(dx, dz)
      const reach = o.r + 0.2
      if (d < reach && pos.y < o.top + 0.15 && d > 0.0001) {
        const push = ((reach - d) / reach) * def.maxSpeed * 3
        desired.x += (dx / d) * push
        desired.z += (dz / d) * push
        if (o.top < 1.4) desired.y += push * 0.5
      }
    }
    const wallMargin = 0.45
    const [cx, cz] = clampToInterior(pos.x, pos.z, wallMargin)
    desired.x += (cx - pos.x) * 3
    desired.z += (cz - pos.z) * 3

    // --- integrate ----------------------------------------------------------
    const steer = desired.sub(vel)
    const maxForce = def.maxSpeed * (1.5 + def.turnSpeed * 0.6) * (zooming ? 2 : 1)
    steer.clampLength(0, maxForce)
    vel.addScaledVector(steer, dt)
    vel.clampLength(0, Math.max(speed, def.maxSpeed * 0.2) * 1.05)
    vel.y *= 0.96
    pos.addScaledVector(vel, dt)

    const [bx, bz] = clampToInterior(pos.x, pos.z, 0.12)
    pos.x = bx
    pos.z = bz
    // Fish chasing food may rise right up to the surface to snap up floating
    // flakes; afterwards they ease back down into their normal band.
    pos.y = Math.min(pos.y, waterLevel.current - 0.1)
    if (!chasing && pos.y > currentMaxSwimY()) vel.y -= dt * 1.2
    pos.y = Math.max(minYFor(def, pos.x, pos.z), pos.y)

    // --- orientation: face travel direction, limit pitch, bank into turns ---
    const spd = vel.length()
    agent.effort = THREE.MathUtils.damp(agent.effort, Math.min(1.6, spd / Math.max(0.05, def.maxSpeed)), 4, dt)
    agent.swimPhase += dt * (5 + agent.effort * 10) * (agent.sleeping ? 0.4 : 1)
    if (spd > 0.02 && orientation !== 'none') {
      lookAhead.current.copy(vel).normalize()
      lookAhead.current.y = orientation === 'yaw' ? 0 : THREE.MathUtils.clamp(lookAhead.current.y, -0.45, 0.45)
      if (lookAhead.current.lengthSq() < 0.0001) lookAhead.current.set(0, 0, 1)
      lookAhead.current.normalize()
      const yaw = Math.atan2(lookAhead.current.x, lookAhead.current.z)
      let yawRate = yaw - prevYaw.current
      if (yawRate > Math.PI) yawRate -= Math.PI * 2
      if (yawRate < -Math.PI) yawRate += Math.PI * 2
      prevYaw.current = yaw
      const bankTarget = orientation === 'yaw' ? 0 : THREE.MathUtils.clamp((yawRate / Math.max(dt, 0.001)) * 0.12, -0.6, 0.6)
      agent.bank = THREE.MathUtils.damp(agent.bank, bankTarget, 5, dt)
      scratchMatrix.lookAt(pos, scratchA.copy(pos).add(lookAhead.current), UP)
      scratchQuat.setFromRotationMatrix(scratchMatrix)
      rollQuat.setFromAxisAngle(FORWARD_AXIS, agent.bank)
      scratchQuat.multiply(rollQuat)
      group.quaternion.slerp(scratchQuat, Math.min(1, def.turnSpeed * 1.6 * dt))
    }
    group.scale.setScalar(agent.size)

    // --- side effects: coins, poop, bubbles ---------------------------------
    if (def.coinValue > 0 && hunger < HUNGER_COIN_CUTOFF && !agent.sleeping) {
      const dirtiness = store.murk * 1.2 + algaeCoverage() * 0.8 + Math.min(1, store.waste.length / 25) * 0.6
      const lucky = useUIStore.getState().activeTank === 'main' ? bonusesFor(store.placedDecorations).coinRate : 1
      coinTimer.current -= (dt * lucky) / (1 + dirtiness)
      if (coinTimer.current <= 0) {
        coinTimer.current = randomRange(COIN_INTERVAL_MIN, COIN_INTERVAL_MAX)
        spawnCoinBubble(pos.clone().setY(pos.y + 0.05), coinValueFor(def.coinValue, growth))
      }
    }
    if (digest.current > 0.55 && Math.random() < dt * 0.08) {
      digest.current = 0
      const tail = scratchA.set(0, 0, def.bodyLength * 0.55 * agent.size).applyQuaternion(group.quaternion).add(pos)
      dropPoop(tail)
    }
    if (Math.random() < dt * 0.05) emitBubble(pos.x, pos.y + 0.05, pos.z, 0.012 + Math.random() * 0.01)
    if (zooming) {
      zoomBubbleTimer.current -= dt
      if (zoomBubbleTimer.current <= 0) {
        zoomBubbleTimer.current = 0.05
        const tail = scratchA.set(0, 0, def.bodyLength * 0.6).applyQuaternion(group.quaternion).add(pos)
        emitBubble(tail.x, tail.y, tail.z, 0.015 + Math.random() * 0.015, 2)
      }
    }
  })

  return { groupRef, agentRef }
}
