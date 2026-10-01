import { useMemo } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useUIStore } from '../../state/useUIStore'
import { useGameStore } from '../../state/useGameStore'
import { dropFood } from '../../sim/food'
import { pointerAttract, simClock, startleAt, fishAgents } from '../../sim/world'
import { getFoodDef } from '../food/foodDefinitions'
import { sfx } from '../../audio/sfx'
import { emitSparks } from '../../sim/sparks'
import { addRipple } from '../../sim/ripples'
import { clampToInterior, TANK_BOTTOM_Y, TANK_DEPTH, TANK_HEIGHT, TANK_WIDTH, waterLevel } from '../TankBounds'

const catcherMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })

function hitsSomethingInteractive(e: ThreeEvent<PointerEvent | MouseEvent>): boolean {
  return e.intersections.some((i) => i.object.userData.coinBubbles || i.object.userData.fishHit || i.object.userData.interactive)
}

/**
 * Invisible box around the whole tank that turns taps into actions:
 * dropping food in Feed mode, tapping the glass in View mode, and telling
 * fish where the player's pointer is so they can come and look.
 */
export function TankInteraction() {
  const mode = useUIStore((s) => s.mode)
  const camera = useThree((s) => s.camera)
  const scratch = useMemo(() => ({ plane: new THREE.Plane(), point: new THREE.Vector3(), forward: new THREE.Vector3() }), [])

  if (mode !== 'view' && mode !== 'feed') return null

  const dropPoint = (ray: THREE.Ray): THREE.Vector3 | null => {
    // Above the water: aim straight at the surface. Otherwise use a vertical
    // plane through the tank centre facing the camera.
    if (camera.position.y > waterLevel.current + 0.5) {
      scratch.plane.set(new THREE.Vector3(0, 1, 0), -waterLevel.current)
    } else {
      camera.getWorldDirection(scratch.forward)
      scratch.forward.y = 0
      if (scratch.forward.lengthSq() < 0.0001) scratch.forward.set(0, 0, -1)
      scratch.forward.normalize()
      scratch.plane.setFromNormalAndCoplanarPoint(scratch.forward, new THREE.Vector3(0, 0, 0))
    }
    return ray.intersectPlane(scratch.plane, scratch.point)
  }

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (hitsSomethingInteractive(e)) return
    if (mode === 'feed') {
      e.stopPropagation()
      const p = dropPoint(e.ray)
      if (!p) return
      const [x, z] = clampToInterior(p.x, p.z, 0.15)
      const ui = useUIStore.getState()
      const foodId = ui.foodId
      if (!useGameStore.getState().useFood(foodId)) {
        ui.pushToast(`Out of ${getFoodDef(foodId).name}! Get more in the Shop.`, 'warn', '🛍️')
        ui.setFoodId('pellets')
        sfx.denied()
        return
      }
      dropFood(foodId, x, z)
      sfx.splash()
      const def = getFoodDef(foodId)
      if (!def.unlimited) {
        emitSparks(new THREE.Vector3(x, waterLevel.current - 0.05, z), 12, def.color, { speed: 0.8, size: 1.1, life: 0.8 })
      }
    }
  }

  // View mode: a quick tap on the glass (not an orbit drag) makes nearby fish dart away.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== 'view' || e.delta > 6) return
    if (hitsSomethingInteractive(e)) return
    const point = e.point.clone()
    startleAt(point)
    sfx.tap()
    let puffed = false
    for (const a of fishAgents.values()) if (a.puff > 0.9 && a.def.features?.includes('spikes')) puffed = true
    if (puffed) sfx.puff()
    if (point.y > waterLevel.current - 0.3) addRipple(point.x, point.z, 1)
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    pointerAttract.active = true
    pointerAttract.point.copy(e.point)
    pointerAttract.lastMove = simClock.t
  }

  return (
    <mesh
      position={[0, (TANK_HEIGHT + TANK_BOTTOM_Y) / 2, 0]}
      material={catcherMaterial}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        pointerAttract.active = false
      }}
    >
      <boxGeometry args={[TANK_WIDTH + 0.1, TANK_HEIGHT - TANK_BOTTOM_Y + 0.1, TANK_DEPTH + 0.1]} />
    </mesh>
  )
}
