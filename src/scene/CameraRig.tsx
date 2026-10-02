import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useUIStore } from '../state/useUIStore'
import { fishAgents } from '../sim/world'
import { isCleanupCrew } from './fish/fishDefinitions'
import { TANK_HEIGHT, TANK_WIDTH, WATER_LINE_Y } from './TankBounds'
import { screenInsets } from '../ui/screenInsets'

const FOV = 42
const TARGET_Y = TANK_HEIGHT * 0.42
const HOME_TARGET = new THREE.Vector3(0, TARGET_Y, 0)
/** The Koi Pond is looked down into from above, like standing at the edge of a garden pond. */
const POND_TARGET = new THREE.Vector3(0, WATER_LINE_Y - 1.2, 0.15)
const POND_POLAR = Math.PI * 0.15
/** The pond is framed a little closer than the tank. */
const POND_DISTANCE = 0.9
const MIN_DISTANCE = 5.4
/** Gentle "screensaver" sway kicks in after this long without input. */
const IDLE_SECONDS = 40

/** Distance that fits the whole tank on screen for the current aspect ratio. */
function fitDistance(aspect: number): number {
  const v = THREE.MathUtils.degToRad(FOV) / 2
  const h = Math.atan(Math.tan(v) * aspect)
  // Portrait phones can crop the tank's ends a little; landscape fits it all.
  const fitWidth = aspect < 1 ? TANK_WIDTH * 0.82 : TANK_WIDTH + 1.2
  const byWidth = fitWidth / 2 / Math.tan(h)
  const byHeight = (TANK_HEIGHT + 1.6) / 2 / Math.tan(v)
  return Math.max(byWidth, byHeight) + 2
}

export const cameraBridge: { controls: OrbitControlsImpl | null } = { controls: null }

export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const controlsEnabled = useUIStore((s) => s.controlsEnabled)
  const cleaning = useUIStore((s) => s.mode === 'clean')
  // With a cleaning tool in hand, a left-drag/one-finger drag scrubs or
  // vacuums; the camera only orbits with right-drag (or Move camera mode).
  const toolInHand = useUIStore((s) => s.mode === 'clean' && !s.cleanCameraMode)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera)
  const home = useMemo(() => fitDistance(size.width / Math.max(1, size.height)), [size.width, size.height])
  const intro = useRef(0)
  const lastInput = useRef(performance.now())
  const frame = useRef({ shift: 0, zoom: 1 })
  const pondView = useUIStore((s) => s.activeTank === 'pond')
  // Swinging between the tank view and the pond's overhead view.
  const swing = useRef({ t: 1, fromPos: new THREE.Vector3(), fromTarget: new THREE.Vector3(), pond: false })
  // Relax mode alternates drifting wide with gliding after one fish for a while.
  const tour = useRef<{ fishId: string | null; until: number }>({ fishId: null, until: 0 })
  const followTarget = useMemo(() => new THREE.Vector3(), [])
  const delta = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    cameraBridge.controls = controlsRef.current
    const bump = () => {
      lastInput.current = performance.now()
    }
    window.addEventListener('pointerdown', bump)
    window.addEventListener('wheel', bump)
    return () => {
      window.removeEventListener('pointerdown', bump)
      window.removeEventListener('wheel', bump)
      cameraBridge.controls = null
    }
  }, [])

  // Re-fit when the window changes shape (rotate phone, resize browser).
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const dir = camera.position.clone().sub(controls.target).normalize()
    if (intro.current >= 1) camera.position.copy(controls.target).addScaledVector(dir, home)
    controls.update()
  }, [home, camera])

  useFrame((_, rawDelta) => {
    const controls = controlsRef.current
    if (!controls) return
    const dt = Math.min(rawDelta, 0.05)
    keepTankInView(dt)

    // Checked every frame (not in an effect) so a switch made during the fly-in is never missed.
    const sw = swing.current
    const wantPond = useUIStore.getState().activeTank === 'pond'
    if (intro.current >= 1 && wantPond !== sw.pond) {
      sw.t = 0
      sw.fromPos.copy(camera.position)
      sw.fromTarget.copy(controls.target)
      sw.pond = wantPond
    }
    const homeTarget = sw.pond ? POND_TARGET : HOME_TARGET
    if (intro.current >= 1 && sw.t < 1) {
      sw.t = Math.min(1, sw.t + dt / 1.4)
      const k = 1 - Math.pow(1 - sw.t, 3)
      const end = sw.pond
        ? new THREE.Vector3(0, Math.cos(POND_POLAR), Math.sin(POND_POLAR)).multiplyScalar(home * POND_DISTANCE).add(POND_TARGET)
        : new THREE.Vector3(0, TARGET_Y + home * 0.12, home)
      camera.position.lerpVectors(sw.fromPos, end, k)
      controls.target.lerpVectors(sw.fromTarget, homeTarget, k)
      controls.update()
      return
    }

    // Fly-in on load: sweep from high and far to the home view.
    if (intro.current < 1) {
      intro.current = Math.min(1, intro.current + dt / 2.6)
      const t = 1 - Math.pow(1 - intro.current, 3)
      const start = new THREE.Vector3(-home * 0.55, TARGET_Y + home * 0.9, home * 1.5)
      const end = new THREE.Vector3(0, TARGET_Y + home * 0.12, home)
      camera.position.lerpVectors(start, end, t)
      controls.target.copy(HOME_TARGET)
      controls.update()
      return
    }

    const ui = useUIStore.getState()
    const now = performance.now() / 1000
    const touring = ui.relax ? tourFish(now) : undefined
    if (!ui.relax) tour.current.until = 0
    const followed = ui.followFish && ui.selectedFishId ? fishAgents.get(ui.selectedFishId) : touring
    if (followed) {
      followTarget.copy(followed.object.position)
      delta.copy(followTarget).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 3))
      controls.target.add(delta)
      camera.position.add(delta)
      // Ease in a little closer while following.
      const dist = camera.position.distanceTo(controls.target)
      const want = Math.max(MIN_DISTANCE, home * 0.62)
      if (dist > want + 0.05) camera.position.lerp(controls.target, (1 - Math.exp(-dt * 1.5)) * (1 - want / dist))
    } else if (controls.target.distanceToSquared(homeTarget) > 0.0004) {
      delta.copy(homeTarget).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 2.5))
      controls.target.add(delta)
      camera.position.add(delta)
    }

    if (ui.relax && !followed) {
      // A slow drift: swing side to side, bob up and down, and breathe in and out.
      const az = controls.getAzimuthalAngle()
      controls.setAzimuthalAngle(az + (Math.sin(now / 21) * 0.62 - az) * dt * 0.3)
      const polar = controls.getPolarAngle()
      const restPolar = swing.current.pond ? POND_POLAR + 0.08 : 1.3
      controls.setPolarAngle(polar + (restPolar + Math.sin(now / 27) * 0.1 - polar) * dt * 0.3)
      const dist = camera.position.distanceTo(controls.target)
      const want = home * (0.92 + Math.sin(now / 33) * 0.07)
      camera.position.lerp(controls.target, (1 - Math.exp(-dt * 0.4)) * (1 - want / dist))
    }

    const idle = (performance.now() - lastInput.current) / 1000 > IDLE_SECONDS
    if (!ui.relax && idle && ui.mode === 'view' && !ui.activeModal) {
      const az = controls.getAzimuthalAngle()
      const goal = Math.sin(performance.now() / 1000 / 14) * 0.55
      controls.setAzimuthalAngle(az + (goal - az) * dt * 0.25)
    }
    controls.update()
  })

  /** Relax mode's next stop: a random fish (not the cleanup crew) for 10–15 s, then 14–20 s of drifting. */
  function tourFish(now: number) {
    const t = tour.current
    if (t.until === 0) {
      // Settle in with a drift before the first fish.
      t.fishId = null
      t.until = now + 8
    } else if (now > t.until || (t.fishId && !fishAgents.has(t.fishId))) {
      const swimmers = [...fishAgents.values()].filter((a) => !isCleanupCrew(a.def))
      if (t.fishId || swimmers.length === 0) {
        t.fishId = null
        t.until = now + 14 + Math.random() * 6
      } else {
        t.fishId = swimmers[Math.floor(Math.random() * swimmers.length)].id
        t.until = now + 10 + Math.random() * 5
      }
    }
    return t.fishId ? fishAgents.get(t.fishId) : undefined
  }

  /**
   * When a dock drawer slides up over the bottom of the screen, nudge the
   * picture up (and shrink it a little if needed) so the tank stays centred
   * in the space that's still visible.
   */
  function keepTankInView(dt: number) {
    const cam = camera as THREE.PerspectiveCamera
    const W = size.width
    const H = size.height
    const covered = Math.max(0, screenInsets.bottom - screenInsets.bar)
    const usual = Math.max(1, H - screenInsets.top - screenInsets.bar)
    const f = frame.current
    const k = 1 - Math.exp(-dt * 6)
    f.shift += (covered / 2 - f.shift) * k
    f.zoom += (THREE.MathUtils.clamp((usual - covered) / usual, 0.72, 1) - f.zoom) * k
    const view = cam.view
    if (Math.abs(f.shift) < 0.5 && Math.abs(1 - f.zoom) < 0.002) {
      if (view?.enabled) {
        cam.clearViewOffset()
        cam.zoom = 1
        cam.updateProjectionMatrix()
      }
      return
    }
    if (!view || !view.enabled || Math.abs(view.offsetY - f.shift) > 0.25 || view.fullWidth !== W || view.fullHeight !== H || Math.abs(cam.zoom - f.zoom) > 0.0005) {
      cam.zoom = f.zoom
      cam.setViewOffset(W, H, 0, f.shift, W, H)
    }
  }

  return (
    <>
      <PerspectiveCamera makeDefault fov={FOV} near={0.1} far={120} position={[0, TARGET_Y + home * 0.12, home]} />
      <OrbitControls
        ref={controlsRef}
        enabled={controlsEnabled}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={MIN_DISTANCE}
        maxDistance={home * 1.45}
        minPolarAngle={pondView ? Math.PI * 0.06 : Math.PI * 0.12}
        maxPolarAngle={pondView ? Math.PI * 0.4 : Math.PI * 0.53}
        minAzimuthAngle={cleaning ? -Infinity : -Math.PI * 0.42}
        maxAzimuthAngle={cleaning ? Infinity : Math.PI * 0.42}
        mouseButtons={{ LEFT: toolInHand ? undefined : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        touches={{ ONE: toolInHand ? undefined : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
        target={HOME_TARGET.toArray()}
      />
    </>
  )
}
