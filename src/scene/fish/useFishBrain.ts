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
import { foodItems, removeFood, dropPoop, predictFood, type FoodItem } from '../../sim/food'
import { feederCall } from '../../sim/gadgets'
import { spawnCoinBubble } from '../../sim/coins'
import { emitSparks } from '../../sim/sparks'
import { emitBubble } from '../../sim/bubbles'
import { spawnPopup } from '../../sim/popups'
import { sfx } from '../../audio/sfx'
import { atmosphere } from '../Atmosphere'
import { algaeCoverage } from '../../sim/algae'
import { randomRange } from '../../utils/math'
import { hashString, mulberry32 } from '../../utils/rng'
import { useUIStore } from '../../state/useUIStore'
import { bonusesFor } from '../../state/bonuses'
import { moodBonus, personalityOf, type Personality as Character } from '../../state/personality'
import { getDecorationDef } from '../decorations/decorationDefinitions'

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

/** Visitors stay close to whatever they came to see. */
function pickHomeTarget(def: FishDefinition, home: THREE.Vector3, out: THREE.Vector3) {
  const [lo, hi] = zoneBand(def)
  const [x, z] = clampToInterior(home.x + randomRange(-1.1, 1.1), home.z + randomRange(-0.7, 0.7), 0.4)
  return out.set(x, THREE.MathUtils.clamp(home.y + randomRange(-0.25, 0.6), lo, Math.max(lo + 0.1, hi)), z)
}

/** Decorations that send up a bubble stream, for playful fish to play in. */
const BUBBLY_KINDS = new Set(['airstone', 'volcano', 'diver', 'clam', 'filter', 'fountain'])

/**
 * Where a fish with a personality wanders next: now and then to its
 * favourite decoration, and otherwise somewhere that suits its trait.
 * Returns true when it's heading for its favourite.
 */
function pickCharacterTarget(def: FishDefinition, c: Character, main: boolean, out: THREE.Vector3): boolean {
  const [lo, hi] = zoneBand(def)
  const placed = main ? useGameStore.getState().placedDecorations : []
  const roll = Math.random()
  const favorites = placed.filter((d) => d.defId === c.favoriteDecor)
  if (favorites.length > 0 && roll < 0.3) {
    const d = favorites[Math.floor(Math.random() * favorites.length)]
    const fav = getDecorationDef(d.defId)
    const reach = (fav?.footprintRadius ?? 0.4) + 0.3
    const [x, z] = clampToInterior(d.position[0] + randomRange(-reach, reach), d.position[2] + randomRange(-reach, reach), 0.4)
    const y = floorHeightAt(x, z) + Math.min(fav?.height ?? 1, 2) * randomRange(0.5, 1) + 0.25
    out.set(x, THREE.MathUtils.clamp(y, lo, Math.max(lo + 0.1, hi)), z)
    return true
  }
  pickWanderTarget(def, out)
  if (c.trait === 'shy' && roll < 0.65 && obstacles.length > 0) {
    // Tuck in beside something tall to hide behind.
    const o = obstacles[Math.floor(Math.random() * obstacles.length)]
    const angle = Math.random() * Math.PI * 2
    const [x, z] = clampToInterior(o.x + Math.cos(angle) * (o.r + 0.25), o.z + Math.sin(angle) * (o.r + 0.25), 0.4)
    out.set(x, THREE.MathUtils.clamp(Math.min(out.y, o.top + 0.2), lo, Math.max(lo + 0.1, hi)), z)
  } else if (c.trait === 'playful' && roll < 0.5) {
    const streams = placed.filter((d) => BUBBLY_KINDS.has(getDecorationDef(d.defId)?.kind ?? ''))
    if (streams.length > 0) {
      const d = streams[Math.floor(Math.random() * streams.length)]
      out.x = d.position[0] + randomRange(-0.15, 0.15)
      out.z = d.position[2] + randomRange(-0.15, 0.15)
    }
  } else if (c.trait === 'showoff' && roll < 0.75) {
    out.z = randomRange(INTERIOR_HALF_DEPTH * 0.15, INTERIOR_HALF_DEPTH - 0.4)
  }
  return false
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

type Locomotion = 'swim' | 'jelly'

function canReach(food: FoodItem, activeTank: string, jelly: boolean, linger = 0): boolean {
  if (food.habitat !== activeTank || food.inedible || food.removed || food.age < linger) return false
  // Every swimmer will nose down to pick a pellet off the gravel; jellies only
  // catch what drifts through their tentacles.
  return !jelly || food.state !== 'resting'
}

/** A fish at least this full (hunger at or below this) is in no hurry to eat. */
const MOSTLY_FULL = 0.25

/**
 * Seconds a fish lets fresh food linger before going for it. Hungry fish
 * swarm it straight away; a mostly-full one hangs back a second or so,
 * which gives the hungry (and the slow) a fair shot at it.
 */
function lingerFor(hunger: number): number {
  return hunger > MOSTLY_FULL ? 0 : 1 + (MOSTLY_FULL - hunger) * 4
}

/** Seconds spent swallowing a bite before the next, so no fish hoovers up a whole pinch. */
function swallowTime(nutrition: number): number {
  return 0.45 + nutrition * 1.5
}

/**
 * Where a creature bites from, as fractions of its body length: how far
 * ahead of (and below) its centre, and how far from there it can grab.
 */
function biteFor(def: FishDefinition): { ahead: number; below: number; reach: number } {
  switch (def.kind) {
    case 'turtle':
      // The beak, out in front of the shell.
      return { ahead: 0.46, below: 0, reach: 0.16 }
    case 'ray':
      // The mouth on the leading edge of the disc, between the horn fins.
      return { ahead: 0.17, below: 0, reach: 0.2 }
    case 'octopus':
      // Any of the eight arms can snatch it, low and all around.
      return { ahead: 0, below: 0.15, reach: 0.55 }
    default:
      return { ahead: 0, below: 0, reach: 0.5 }
  }
}

/** Hand a fish's food claim over to a new piece (or none). */
function claim(agent: FishAgent, food: FoodItem | null) {
  if (agent.food === food) return
  if (agent.food) agent.food.claims = Math.max(0, agent.food.claims - 1)
  agent.food = food
  if (food) food.claims++
}

/** Pellets that settle inside a castle or rock can't be reached; leave them. */
function underDecoration(p: THREE.Vector3): boolean {
  for (const o of obstacles) if (p.y < o.top && Math.hypot(p.x - o.x, p.z - o.z) < o.r) return true
  return false
}

/** Seconds of "cost" each rival heading for the same piece adds. */
const CROWD_PENALTY = 1.1
const scratchLead = new THREE.Vector3()

/**
 * Pick the piece of food this fish can reach soonest, leading falling food
 * and steering away from pieces other fish already have dibs on, so a cloud
 * of pellets gets shared out instead of every fish chasing the same one.
 */
function pickFood(agent: FishAgent, pos: THREE.Vector3, chaseSpeed: number, activeTank: string, jelly: boolean, range: number, hunger: number): FoodItem | null {
  let best: FoodItem | null = null
  let bestCost = Infinity
  const linger = lingerFor(hunger)
  // Hungry fish barge into a crowd; well-fed ones look for a piece nobody wants.
  const crowding = CROWD_PENALTY * (0.4 + (1 - hunger) * 1.4)
  for (const food of foodItems) {
    if (!canReach(food, activeTank, jelly, linger)) continue
    const d0 = food.position.distanceTo(pos)
    if (d0 > range) continue
    if (food.state === 'resting' && underDecoration(food.position)) continue
    const lead = predictFood(food, Math.min(3, d0 / chaseSpeed), scratchLead)
    let cost = lead.distanceTo(pos) / chaseSpeed
    cost += (food.claims - (agent.food === food ? 1 : 0)) * crowding
    if (food.state === 'resting') cost += agent.def.zone === 'bottom' ? -0.3 : 0.8
    if (agent.food === food) cost -= 0.35
    if (cost < bestCost) {
      bestCost = cost
      best = food
    }
  }
  return best
}

/** Stable per-fish quirks so two fish of the same species never move in lockstep. */
interface Personality {
  speed: number
  glide: number
  angle: number
  lift: number
  spin: number
}

function personalityFor(fishId: string, def: FishDefinition): Personality {
  const rand = mulberry32(hashString(fishId))
  return {
    speed: 0.88 + rand() * 0.24,
    // Big fish cruise in long glides; tiny schooling fish dart in short bursts.
    glide: (0.7 + def.bodyLength * 1.2) * (0.85 + rand() * 0.3),
    angle: rand() * Math.PI * 2,
    lift: rand(),
    spin: (rand() - 0.5) * 0.3,
  }
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
  emitSparks(food.position, 5, food.def.color, { speed: 0.35, size: 0.8, life: 0.5, buoyancy: -0.2 })
  sfx.chomp()
  if (!food.def.unlimited && personalityOf(agent.id).favoriteTreat === food.def.id) {
    // Its favourite! Extra delight on top of the treat's own effect.
    agent.effects.hearts = simClock.t + 3
    spawnPopup(agent.object.position.clone().setY(agent.object.position.y + 0.45), 'Favourite! ♥', '#ff8fc7', true)
  }
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
const scratchC = new THREE.Vector3()
const scratchOffset = new THREE.Vector3()
const scratchMouth = new THREE.Vector3()
const scratchCohesion = new THREE.Vector3()
const scratchAlignment = new THREE.Vector3()
const scratchSeparation = new THREE.Vector3()
const scratchMatrix = new THREE.Matrix4()
const scratchQuat = new THREE.Quaternion()
const rollQuat = new THREE.Quaternion()
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)
const UP = new THREE.Vector3(0, 1, 0)

/** Fraction of a jellyfish pulse spent squeezing (the rest is a slow relax). */
const JELLY_SQUEEZE = 0.32

/**
 * The "brain" of a swimming fish: wander/school, chase and eat food, flee
 * taps, avoid decorations and walls, sleep at night, drop coins and poop.
 * Everything lives in refs / the shared agent object and is mutated inside
 * useFrame — no React state updates per frame.
 *
 * `locomotion: 'jelly'` swaps the swimming for pulse-and-glide propulsion:
 * the bell squeezes to shoot forward along its axis, relaxes and drifts,
 * and steers by slowly tilting toward where it wants to go.
 */
export function useFishBrain(
  fishId: string,
  def: FishDefinition,
  {
    orientation = 'full',
    sizeScale = 1,
    locomotion = 'swim',
    home,
  }: {
    orientation?: 'full' | 'yaw' | 'none'
    sizeScale?: number
    locomotion?: Locomotion
    /** Visitors: wander near here, stay awake, and are always full-grown. */
    home?: THREE.Vector3
  } = {},
) {
  const groupRef = useRef<THREE.Group>(null)
  const agentRef = useRef<FishAgent | null>(null)
  const wanderTarget = useRef(new THREE.Vector3())
  const wanderTimer = useRef(0)
  const hoverTimer = useRef(0)
  const foodTimer = useRef(0)
  const beat = useRef({ gliding: false, timer: 0 })
  const coinTimer = useRef(randomRange(COIN_INTERVAL_MIN * 0.3, COIN_INTERVAL_MAX))
  const digest = useRef(0)
  const swallow = useRef(0)
  const lookAhead = useRef(new THREE.Vector3())
  const prevYaw = useRef(0)
  const zoomBubbleTimer = useRef(0)
  const jelly = useRef({
    phase: Math.random(),
    spin: Math.random() * 6,
    strength: 0.55,
    axis: new THREE.Vector3(0, 1, 0),
    // World-space hang of the tentacles, sprung so it swings after the bell.
    hang: new THREE.Vector3(0, -1, 0),
    hangVel: new THREE.Vector3(),
    // Where the tentacle tips have got to in the bell's slow spin.
    roll: 0,
    rollVel: 0,
  })
  const quirk = useRef<Personality>(personalityFor(fishId, def))
  // Visitors are guests passing through; residents have a character of their own.
  const character = home ? null : personalityOf(fishId)
  const toFavorite = useRef(false)

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    quirk.current = personalityFor(fishId, def)
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
      size: sizeForGrowth(home ? 1 : (useGameStore.getState().fishVitals[fishId]?.growth ?? 0), sizeScale),
      food: null,
      bend: 0,
      hover: 0,
      wiggle: 0,
      gaze: new THREE.Vector3(),
      gazing: 0,
      pulse: 0,
      trail: new THREE.Vector3(0, -1, 0),
      twist: 0,
      steer: new THREE.Vector3(),
    }
    agentRef.current = agent
    group.scale.setScalar(agent.size)
    fishAgents.set(fishId, agent)
    if (home) pickHomeTarget(def, home, wanderTarget.current)
    else pickWanderTarget(def, wanderTarget.current)
    group.userData.fishId = fishId
    return () => {
      claim(agent, null)
      fishAgents.delete(fishId)
    }
  }, [fishId, def, sizeScale, home])

  useFrame((state, rawDelta) => {
    const group = groupRef.current
    const agent = agentRef.current
    if (!group || !agent) return
    const dt = Math.min(rawDelta, 0.05)
    const t = simClock.t
    const pos = group.position
    const vel = agent.velocity
    const store = useGameStore.getState()
    const ui = useUIStore.getState()
    const vitals = store.fishVitals[fishId]
    const hunger = vitals?.hunger ?? 0
    const growth = home ? 1 : (vitals?.growth ?? 0)
    const q = quirk.current

    agent.size = THREE.MathUtils.damp(agent.size, sizeForGrowth(growth, sizeScale), 2, dt)
    agent.eatPulse = Math.max(0, agent.eatPulse - dt)
    agent.puff = Math.max(0, agent.puff - dt * 0.18)
    agent.wiggle = Math.max(0, agent.wiggle - dt)
    swallow.current = Math.max(0, swallow.current - dt)

    const zooming = agent.effects.zoom > t
    agent.sleeping = !home && atmosphere.night > 0.7 && !def.glow && agent.effects.glow < t && agent.startle <= 0
    const wantsFood = def.appetite > 0 && hunger > HUNGER_FULL_THRESHOLD && !agent.sleeping && agent.startle <= 0
    const feederCalling = wantsFood && ui.activeTank === 'main' && t >= feederCall.from && t < feederCall.until
    const linger = lingerFor(hunger)
    let gazeWant = 0

    if (locomotion === 'jelly') {
      // --- jellyfish: squeeze, glide, sink; steer by tilting the bell ---------
      const j = jelly.current
      const R = def.bodyLength * 0.5 * agent.size
      const want = scratchB
      let rate = (0.55 + q.lift * 0.2) * q.speed
      if (agent.startle > 0) {
        agent.startle -= dt
        want.copy(pos).sub(agent.startleFrom)
        want.y = Math.abs(want.y) + 0.4
        rate = 1.6
        claim(agent, null)
      } else {
        if (wantsFood) {
          foodTimer.current -= dt
          const current = agent.food && canReach(agent.food, ui.activeTank, true, linger) ? agent.food : null
          if (!current || foodTimer.current <= 0) {
            foodTimer.current = 0.4 + Math.random() * 0.2
            claim(agent, pickFood(agent, pos, 0.3, ui.activeTank, true, 2.4, hunger))
          }
        } else {
          claim(agent, null)
        }
        if (agent.food) {
          // Hover just above the food so the tentacles sweep through it.
          want.copy(agent.food.position).sub(pos)
          want.y += R * 1.3
          rate *= 1.3
        } else if (feederCalling) {
          want.set(Math.cos(q.angle) * 0.7, 0.7, Math.sin(q.angle) * 0.7).add(feederCall.position).sub(pos)
        } else {
          wanderTimer.current -= dt
          if (wanderTimer.current <= 0 || pos.distanceTo(wanderTarget.current) < 0.3) {
            if (home) pickHomeTarget(def, home, wanderTarget.current)
            else pickWanderTarget(def, wanderTarget.current)
            wanderTarget.current.y = Math.max(wanderTarget.current.y, floorHeightAt(wanderTarget.current.x, wanderTarget.current.z) + R * 4 + 0.2)
            wanderTimer.current = randomRange(6, 12)
          }
          want.copy(wanderTarget.current).sub(pos)
        }
      }

      // Catch anything drifting through the tentacle curtain; nearby food is
      // drawn in by the current each pulse makes.
      if (wantsFood) {
        const reach = R * 1.6
        for (const food of foodItems) {
          if (!canReach(food, ui.activeTank, true, linger)) continue
          const dx = food.position.x - pos.x
          const dz = food.position.z - pos.z
          const dy = food.position.y - pos.y
          const flat = dx * dx + dz * dz
          if (flat < reach * reach && dy < R * 0.5 && dy > -R * 3.4 && swallow.current <= 0) {
            eat(agent, food, growth)
            swallow.current = swallowTime(food.def.nutrition)
            digest.current += food.def.nutrition
            claim(agent, null)
            break
          }
          if (flat + dy * dy < 0.8) {
            const pull = 1 - Math.exp(-dt * (0.5 + agent.pulse * 1.5))
            food.position.x += -dx * pull
            food.position.z += -dz * pull
            food.position.y += (pos.y - R * 1.4 - food.position.y) * pull * 0.5
          }
        }
      }

      const dist = want.length()
      const wantDir = scratchC.copy(want).divideScalar(Math.max(dist, 0.0001))
      // Depth is controlled by how hard each squeeze is, not how often: a
      // jelly keeps its lively rhythm and sinks between soft pulses.
      const lift = agent.startle > 0 ? 2 : want.y > 0.2 ? 1 : want.y < -0.2 ? 0.25 : 0.55
      j.strength = THREE.MathUtils.damp(j.strength, lift, 1.5, dt)
      if (agent.sleeping) rate *= 0.6
      j.phase += dt * rate
      const cyc = j.phase - Math.floor(j.phase)
      const shape =
        cyc < JELLY_SQUEEZE
          ? Math.sin((cyc / JELLY_SQUEEZE) * Math.PI * 0.5)
          : Math.pow(Math.cos(((cyc - JELLY_SQUEEZE) / (1 - JELLY_SQUEEZE)) * Math.PI * 0.5), 2)
      agent.pulse = shape * (0.55 + 0.45 * Math.min(1, j.strength))
      agent.swimPhase = j.phase * Math.PI * 2
      agent.effort = rate

      // Tilt toward the goal (never upside down: it can't swim downward), with
      // a gentle rocking so a resting bell is never perfectly still.
      const tilt = scratchA.set(wantDir.x, Math.max(0, wantDir.y), wantDir.z)
      if (dist < 0.2) tilt.set(0, 0, 0)
      tilt.multiplyScalar(0.9).addScaledVector(UP, 0.6)
      tilt.x += Math.sin(t * 0.61 + q.angle * 3) * 0.07
      tilt.z += Math.sin(t * 0.47 + q.angle * 5 + 1.3) * 0.07
      tilt.normalize()
      // A jelly turns by squeezing lopsided, so the bell swings round mostly
      // during each squeeze and barely between them.
      const squeezing = cyc < JELLY_SQUEEZE ? shape : 0
      const turnRate = agent.startle > 0 ? 3 : 0.25 + 1.7 * squeezing
      const turn = scratchC.copy(tilt).sub(j.axis)
      j.axis.lerp(tilt, 1 - Math.exp(-dt * turnRate)).normalize()
      if (j.axis.y < 0.35) {
        j.axis.y = 0.35
        j.axis.normalize()
      }
      // Each squeeze delivers one kick along the bell's axis.
      const kick = def.maxSpeed * 1.6 * q.speed * j.strength
      if (cyc < JELLY_SQUEEZE) vel.addScaledVector(j.axis, ((kick * rate) / JELLY_SQUEEZE) * dt)
      vel.multiplyScalar(Math.exp(-dt * 1.4))
      vel.y -= 0.09 * dt

      // Gentle nudges from neighbours, decorations and the glass.
      const nudge = scratchSeparation.set(0, 0, 0)
      for (const other of fishAgents.values()) {
        if (other === agent) continue
        const offset = scratchOffset.copy(pos).sub(other.object.position)
        const d = offset.length()
        const personal = (def.bodyLength + other.def.bodyLength) * 0.6
        if (d < personal && d > 0.0001) nudge.addScaledVector(offset.normalize(), (personal - d) / personal)
      }
      for (const o of obstacles) {
        const dx = pos.x - o.x
        const dz = pos.z - o.z
        const d = Math.hypot(dx, dz)
        const reach = o.r + R
        if (d < reach && pos.y - R * 3 < o.top && d > 0.0001) {
          nudge.x += (dx / d) * ((reach - d) / reach)
          nudge.z += (dz / d) * ((reach - d) / reach)
          nudge.y += 0.3
        }
      }
      const [wx, wz] = clampToInterior(pos.x, pos.z, R * 1.2)
      nudge.x += (wx - pos.x) * 4
      nudge.z += (wz - pos.z) * 4
      vel.addScaledVector(nudge, 0.35 * dt)
      pos.addScaledVector(vel, dt)

      const [bx, bz] = clampToInterior(pos.x, pos.z, R * 0.8)
      pos.x = bx
      pos.z = bz
      const top = Math.min(currentMaxSwimY() + 0.1, waterLevel.current - R * 1.2)
      if (pos.y > top) {
        pos.y = THREE.MathUtils.damp(pos.y, top, 4, dt)
        vel.y = Math.min(vel.y, 0)
      }
      const low = floorHeightAt(pos.x, pos.z) + R * 3.2
      if (pos.y < low) {
        pos.y = THREE.MathUtils.damp(pos.y, low, 3, dt)
        vel.y = Math.max(vel.y, 0)
      }

      // A slow, wandering spin about the bell's own axis.
      j.spin += dt * q.spin * (0.6 + 0.6 * Math.sin(t * 0.11 + q.angle * 7))
      scratchQuat.setFromUnitVectors(UP, j.axis)
      rollQuat.setFromAxisAngle(UP, j.spin)
      group.quaternion.copy(scratchQuat).multiply(rollQuat)
      const toLocal = scratchQuat.copy(group.quaternion).invert()

      // The tentacles are soft: they hang under gravity and stream back
      // through the water, and swing after the bell on a spring instead of
      // turning rigidly with it. The shader bends each strand toward this.
      const hangTarget = scratchA.set(Math.sin(t * 0.37 + q.angle * 11) * 0.08, -1, Math.cos(t * 0.29 + q.angle * 13) * 0.08)
      hangTarget.addScaledVector(vel, -2.6).normalize()
      j.hangVel.addScaledVector(hangTarget.sub(j.hang), 9 * dt).multiplyScalar(Math.exp(-dt * 3.8))
      j.hang.addScaledVector(j.hangVel, dt).normalize()
      agent.trail.copy(j.hang).applyQuaternion(toLocal)
      // The tips lag the spin the same way.
      j.rollVel += (j.spin - j.roll) * 6 * dt
      j.rollVel *= Math.exp(-dt * 3.5)
      j.roll += j.rollVel * dt
      agent.twist = THREE.MathUtils.clamp(j.roll - j.spin, -0.8, 0.8)
      // Which side of the rim squeezes harder to swing the bell round.
      const steer = turn.applyQuaternion(toLocal).setY(0)
      agent.steer.lerp(steer.clampLength(0, 1), 1 - Math.exp(-dt * 4))
    } else {
      // --- regular swimmers -------------------------------------------------
      let speed = def.maxSpeed * q.speed * (zooming ? 2.2 : 1) * (agent.sleeping ? 0.3 : 1) * (hunger > 0.85 ? 0.8 : 1)
      const desired = scratchA.set(0, 0, 0)
      let chasing: FoodItem | null = null
      let hovering = false
      let cruising = false

      if (agent.startle > 0) {
        agent.startle -= dt
        desired.copy(pos).sub(agent.startleFrom).setY((pos.y - agent.startleFrom.y) * 0.3)
        if (desired.lengthSq() < 0.0001) desired.set(Math.random() - 0.5, 0, Math.random() - 0.5)
        desired.normalize().multiplyScalar(def.maxSpeed * 2.6)
        speed = def.maxSpeed * 2.6
        claim(agent, null)
      } else {
        // The hungrier the fish, the harder it goes for food.
        const chaseSpeed = def.maxSpeed * q.speed * (1.45 + hunger * 1.2) * (zooming ? 1.6 : 1) * (character?.trait === 'greedy' ? 1.25 : 1)
        const bite = biteFor(def)
        const length = def.bodyLength * agent.size
        const mouth = scratchMouth.set(0, -bite.below * length, -bite.ahead * length).applyQuaternion(group.quaternion).add(pos)
        if (wantsFood) {
          foodTimer.current -= dt
          const current = agent.food && canReach(agent.food, ui.activeTank, false, linger) ? agent.food : null
          if (!current || foodTimer.current <= 0) {
            foodTimer.current = 0.25 + Math.random() * 0.2
            claim(agent, pickFood(agent, pos, chaseSpeed, ui.activeTank, false, Infinity, hunger))
          }
          // Snap up whatever is right at the mouth, claimed or not, once the
          // last bite is down. A mostly-full fish leaves a piece to whoever
          // else is heading for it.
          const eatRadius = bite.reach * length + 0.08
          if (swallow.current <= 0) {
            for (const food of foodItems) {
              if (!canReach(food, ui.activeTank, false, linger)) continue
              if (hunger <= MOSTLY_FULL && food.claims > (agent.food === food ? 1 : 0)) continue
              if (food.position.distanceToSquared(mouth) < eatRadius * eatRadius) {
                eat(agent, food, growth)
                swallow.current = swallowTime(food.def.nutrition)
                digest.current += food.def.nutrition
                break
              }
            }
          }
          if (agent.food?.removed) claim(agent, null)
          chasing = agent.food
        } else {
          claim(agent, null)
        }

        if (chasing) {
          // Lead falling food: aim where it will be when we get there.
          const lead = predictFood(chasing, Math.min(2.5, chasing.position.distanceTo(pos) / chaseSpeed), scratchB)
          speed = chaseSpeed
          // Steer the mouth (the turtle's beak, the manta's lips) onto it.
          desired.copy(lead).sub(mouth)
          const d = desired.length()
          desired.multiplyScalar((speed * Math.min(1, 0.5 + d / 0.5)) / Math.max(d, 0.0001))
          agent.gaze.copy(chasing.position)
          gazeWant = 1
        } else {
          const mode = ui.mode
          const nosy = character?.trait === 'curious'
          const fresh = pointerAttract.active && !agent.sleeping && t - pointerAttract.lastMove < (nosy ? 8 : 4)
          const curious = fresh && mode === 'view' && pointerAttract.point.distanceTo(pos) < (nosy ? 6 : 3.2)
          const begging =
            pointerAttract.active &&
            !agent.sleeping &&
            mode === 'feed' &&
            def.appetite > 0 &&
            def.zone !== 'bottom' &&
            hunger > 0.2 &&
            t - pointerAttract.lastMove < 8
          let target: THREE.Vector3
          if (agent.wiggle > 0) {
            // Tapped: turn to look at the player.
            target = scratchB.copy(state.camera.position).sub(pos).setLength(0.6).add(pos)
            speed *= 0.35
            agent.gaze.copy(state.camera.position)
            gazeWant = 1
          } else if (feederCalling) {
            // Dinner bell: wait in a loose ring around the lantern.
            target = scratchB
              .set(Math.cos(q.angle) * 0.6, 0.35 + q.lift * 0.5, Math.sin(q.angle) * 0.6)
              .add(feederCall.position)
            speed = Math.max(speed, def.maxSpeed * 1.3)
            agent.gaze.copy(feederCall.position)
            gazeWant = 0.8
          } else if (begging) {
            // Hungry fish crowd up under the player's hand, waiting for food.
            const p = pointerAttract.point
            target = scratchB.set(p.x + Math.cos(q.angle) * 0.45, currentMaxSwimY() - 0.05 - q.lift * 0.35, p.z + Math.sin(q.angle) * 0.3)
            speed *= 1.1
            agent.gaze.copy(state.camera.position)
            gazeWant = 0.7
          } else if (curious) {
            // Come up to the glass where the player is pointing, just inside it.
            target = scratchB.copy(pointerAttract.point)
            target.x *= 0.9
            target.z *= 0.8
            speed *= 0.7
            agent.gaze.copy(state.camera.position)
            gazeWant = 0.8
          } else if (def.schooling && countSpecies(def.id) > 1) {
            target = schoolTarget(def, dt)
            cruising = true
          } else {
            wanderTimer.current -= dt
            if (hoverTimer.current > 0) {
              hoverTimer.current -= dt
              hovering = true
            } else if (wanderTimer.current <= 0 || pos.distanceTo(wanderTarget.current) < 0.35) {
              // Made it to its favourite decoration: a happy little heart.
              if (toFavorite.current && pos.distanceTo(wanderTarget.current) < 0.35) {
                spawnPopup(scratchB.copy(pos).setY(pos.y + 0.22), '♥', '#ff8fc7')
                toFavorite.current = false
              }
              // Sometimes pause for a look around before moving on.
              if (Math.random() < 0.45) hoverTimer.current = randomRange(1, 3.5)
              if (home) pickHomeTarget(def, home, wanderTarget.current)
              else if (character) toFavorite.current = pickCharacterTarget(def, character, ui.activeTank === 'main', wanderTarget.current)
              else pickWanderTarget(def, wanderTarget.current)
              wanderTimer.current = randomRange(3, 7)
            }
            target = wanderTarget.current
            cruising = true
          }
          if (agent.sleeping) {
            // Drowsy fish drift slowly and sink toward a resting depth.
            target = scratchB.copy(wanderTarget.current)
            target.y = Math.min(target.y, 1.3)
          }
          if (hovering) {
            // Hold position with a slight bob while the fins fan.
            desired.set(0, Math.sin(t * 1.3 + q.angle) * 0.04, 0)
          } else {
            desired.copy(target).sub(pos)
            const d = desired.length()
            if (d > 0.0001) desired.multiplyScalar((Math.min(1, d / 0.6) * speed) / d)
          }
        }
      }

      // Burst-and-glide: a few strong tail beats, then coast.
      let thrust = 1
      let effortCap = Infinity
      const b = beat.current
      if (cruising && !hovering && !agent.sleeping && !zooming) {
        b.timer -= dt
        if (b.timer <= 0) {
          b.gliding = !b.gliding
          b.timer = b.gliding ? randomRange(0.4, 1.3) * q.glide : randomRange(0.5, 1.2)
        }
        if (b.gliding) {
          desired.multiplyScalar(0.6)
          thrust = 0.3
          effortCap = 0.18
        } else {
          desired.multiplyScalar(1.12)
        }
      } else {
        b.gliding = false
      }

      // --- schooling forces -------------------------------------------------
      const separation = scratchSeparation.set(0, 0, 0)
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
      // A feeding frenzy tolerates bumping: rivals mustn't shove each other off the food.
      desired.addScaledVector(separation, def.maxSpeed * (chasing ? 0.7 : 1.8))
      if (cohesionCount > 0 && agent.startle <= 0 && !chasing) {
        cohesion.divideScalar(cohesionCount).sub(pos)
        desired.addScaledVector(cohesion, 0.6)
        desired.addScaledVector(alignment.divideScalar(cohesionCount), 0.35)
      }

      // --- avoid decorations and walls --------------------------------------
      for (const o of obstacles) {
        const dx = pos.x - o.x
        const dz = pos.z - o.z
        const d = Math.hypot(dx, dz)
        const reach = o.r + 0.2
        if (d < reach && pos.y < o.top + 0.15 && d > 0.0001) {
          const push = ((reach - d) / reach) * def.maxSpeed * 3
          desired.x += (dx / d) * push
          desired.z += (dz / d) * push
          if (o.top < 1.4 && !chasing) desired.y += push * 0.5
        }
      }
      const wallMargin = 0.45
      const [cx, cz] = clampToInterior(pos.x, pos.z, wallMargin)
      desired.x += (cx - pos.x) * 3
      desired.z += (cz - pos.z) * 3

      // --- integrate --------------------------------------------------------
      const steer = desired.sub(vel)
      let maxForce = def.maxSpeed * (1.5 + def.turnSpeed * 0.6) * (zooming ? 2 : 1) * thrust
      if (chasing) maxForce *= 1.8
      steer.clampLength(0, maxForce)
      vel.addScaledVector(steer, dt)
      vel.clampLength(0, Math.max(speed, def.maxSpeed * 0.2) * 1.05)
      vel.y *= Math.exp(-dt * (chasing ? 0.4 : 2.4))
      pos.addScaledVector(vel, dt)

      const [bx, bz] = clampToInterior(pos.x, pos.z, 0.12)
      pos.x = bx
      pos.z = bz
      // Fish chasing food may rise right up to the surface to snap up floating
      // flakes, or dive to pick pellets off the gravel; afterwards they ease
      // back into their normal band.
      pos.y = Math.min(pos.y, waterLevel.current - 0.1)
      if (!chasing && pos.y > currentMaxSwimY()) vel.y -= dt * 1.2
      const floor = floorHeightAt(pos.x, pos.z)
      const normalMin = minYFor(def, pos.x, pos.z)
      const diving = chasing !== null && chasing.position.y < normalMin + 0.15
      if (!diving && pos.y < normalMin) vel.y += (normalMin - pos.y) * 6 * dt
      pos.y = Math.max(floor + def.bodyHeight * 0.5 * agent.size + 0.02, pos.y)

      // --- orientation: face travel direction, limit pitch, bank and bend into turns
      const spd = vel.length()
      let effortTarget = Math.min(1.6, spd / Math.max(0.05, def.maxSpeed))
      if (hovering) effortTarget = 0.12
      effortTarget = Math.min(effortTarget, effortCap)
      if (agent.wiggle > 0) effortTarget = 1.5
      agent.effort = THREE.MathUtils.damp(agent.effort, effortTarget, 4, dt)
      agent.swimPhase += dt * (2 + agent.effort * 13) * (agent.sleeping ? 0.4 : 1)
      agent.hover = THREE.MathUtils.damp(agent.hover, hovering || spd < def.maxSpeed * 0.3 ? 1 : 0, 3, dt)
      let bendTarget = 0
      let bankTarget = 0
      if (spd > 0.02 && orientation !== 'none') {
        lookAhead.current.copy(vel).normalize()
        const pitch = chasing ? 0.8 : 0.45
        lookAhead.current.y = orientation === 'yaw' ? 0 : THREE.MathUtils.clamp(lookAhead.current.y, -pitch, pitch)
        if (lookAhead.current.lengthSq() < 0.0001) lookAhead.current.set(0, 0, 1)
        lookAhead.current.normalize()
        const yaw = Math.atan2(lookAhead.current.x, lookAhead.current.z)
        let yawRate = yaw - prevYaw.current
        if (yawRate > Math.PI) yawRate -= Math.PI * 2
        if (yawRate < -Math.PI) yawRate += Math.PI * 2
        prevYaw.current = yaw
        const yawVel = yawRate / Math.max(dt, 0.001)
        bankTarget = orientation === 'yaw' ? 0 : THREE.MathUtils.clamp(yawVel * 0.12, -0.6, 0.6)
        // The body curls into a turn: tail swings toward the inside.
        bendTarget = THREE.MathUtils.clamp(-yawVel * 0.22, -0.8, 0.8)
        scratchMatrix.lookAt(pos, scratchC.copy(pos).add(lookAhead.current), UP)
        scratchQuat.setFromRotationMatrix(scratchMatrix)
        rollQuat.setFromAxisAngle(FORWARD_AXIS, agent.bank)
        scratchQuat.multiply(rollQuat)
        group.quaternion.slerp(scratchQuat, Math.min(1, def.turnSpeed * 1.6 * (chasing ? 1.8 : 1) * dt))
      }
      if (agent.wiggle > 0) {
        // Happy wiggle: a quick shimmy from nose to tail.
        const env = Math.min(1, agent.wiggle * 2)
        bendTarget = Math.sin(t * 15) * 0.7 * env
        if (orientation === 'full') bankTarget = Math.sin(t * 9) * 0.35 * env
      }
      agent.bank = THREE.MathUtils.damp(agent.bank, bankTarget, 5, dt)
      agent.bend = THREE.MathUtils.damp(agent.bend, bendTarget, agent.wiggle > 0 ? 14 : 5, dt)
    }

    group.scale.setScalar(agent.size)
    agent.gazing = THREE.MathUtils.damp(agent.gazing, gazeWant, 5, dt)

    // --- side effects: coins, poop, bubbles ---------------------------------
    if (def.coinValue > 0 && hunger < HUNGER_COIN_CUTOFF && !agent.sleeping && !ui.visiting) {
      const dirtiness = store.murk * 1.2 + algaeCoverage() * 0.8 + Math.min(1, store.waste.length / 25) * 0.6
      const lucky = ui.activeTank === 'main' ? bonusesFor(store.placedDecorations).coinRate * moodBonus(fishId, store.ownedFish, store.placedDecorations) : 1
      coinTimer.current -= (dt * lucky) / (1 + dirtiness)
      if (coinTimer.current <= 0) {
        coinTimer.current = randomRange(COIN_INTERVAL_MIN, COIN_INTERVAL_MAX)
        spawnCoinBubble(pos.clone().setY(pos.y + 0.05), coinValueFor(def.coinValue, growth))
      }
    }
    if (digest.current > 0.55 && Math.random() < dt * 0.08) {
      digest.current = 0
      const tail =
        locomotion === 'jelly'
          ? scratchA.set(0, -def.bodyLength * 0.5 * agent.size, 0).applyQuaternion(group.quaternion).add(pos)
          : scratchA.set(0, 0, def.bodyLength * 0.55 * agent.size).applyQuaternion(group.quaternion).add(pos)
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
