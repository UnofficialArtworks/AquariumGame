import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useUIStore } from '../state/useUIStore'
import { fishAgents } from '../sim/world'
import { TANK_HEIGHT, TANK_WIDTH } from './TankBounds'

const FOV = 42
const TARGET_Y = TANK_HEIGHT * 0.42
const HOME_TARGET = new THREE.Vector3(0, TARGET_Y, 0)
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
    const followed = ui.followFish && ui.selectedFishId ? fishAgents.get(ui.selectedFishId) : undefined
    if (followed) {
      followTarget.copy(followed.object.position)
      delta.copy(followTarget).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 3))
      controls.target.add(delta)
      camera.position.add(delta)
      // Ease in a little closer while following.
      const dist = camera.position.distanceTo(controls.target)
      const want = Math.max(MIN_DISTANCE, home * 0.62)
      if (dist > want + 0.05) camera.position.lerp(controls.target, (1 - Math.exp(-dt * 1.5)) * (1 - want / dist))
    } else if (controls.target.distanceToSquared(HOME_TARGET) > 0.0004) {
      delta.copy(HOME_TARGET).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 2.5))
      controls.target.add(delta)
      camera.position.add(delta)
    }

    const idle = (performance.now() - lastInput.current) / 1000 > IDLE_SECONDS
    if (idle && ui.mode === 'view' && !ui.activeModal) {
      const az = controls.getAzimuthalAngle()
      const goal = Math.sin(performance.now() / 1000 / 14) * 0.55
      controls.setAzimuthalAngle(az + (goal - az) * dt * 0.25)
    }
    controls.update()
  })

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
        minPolarAngle={Math.PI * 0.12}
        maxPolarAngle={Math.PI * 0.53}
        minAzimuthAngle={cleaning ? -Infinity : -Math.PI * 0.42}
        maxAzimuthAngle={cleaning ? Infinity : Math.PI * 0.42}
        mouseButtons={{ LEFT: toolInHand ? undefined : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        touches={{ ONE: toolInHand ? undefined : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
        target={HOME_TARGET.toArray()}
      />
    </>
  )
}
