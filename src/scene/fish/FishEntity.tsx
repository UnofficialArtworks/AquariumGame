import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { FishDefinition, FishInstance } from '../../state/types'
import { inheritedDefinition } from '../../state/nursery'
import { FishBody } from './FishBody'
import { useFishBrain } from './useFishBrain'
import { randomRange } from '../../utils/math'
import { INTERIOR_HALF_DEPTH, INTERIOR_HALF_WIDTH, INTERIOR_MAX_Y, INTERIOR_MIN_Y } from '../TankBounds'
import { useGameStore } from '../../state/useGameStore'
import { useUIStore } from '../../state/useUIStore'
import { statusTexture, type StatusIcon } from './statusIcons'
import type { FishAgent } from '../../sim/world'
import { simClock } from '../../sim/world'
import { sfx } from '../../audio/sfx'
import { hatchStart } from '../../sim/hatching'
import { hasPersonality, tryPet } from '../../state/personality'
import { spawnPopup } from '../../sim/popups'
import { spawnCoinBubble } from '../../sim/coins'
import { coinValueFor } from '../../state/economy'
import { JellyfishEntity } from '../creatures/Jellyfish'
import { SeahorseEntity } from '../creatures/Seahorse'
import { AxolotlEntity } from '../creatures/Axolotl'
import { SnailEntity } from '../creatures/Snail'
import { ShrimpEntity } from '../creatures/Shrimp'
import { OctopusEntity } from '../creatures/Octopus'
import { MantaRayEntity } from '../creatures/MantaRay'
import { SeaTurtleEntity } from '../creatures/SeaTurtle'

function randomStartPosition(): [number, number, number] {
  return [
    randomRange(-INTERIOR_HALF_WIDTH + 0.5, INTERIOR_HALF_WIDTH - 0.5),
    randomRange(INTERIOR_MIN_Y + 0.5, INTERIOR_MAX_Y - 0.3),
    randomRange(-INTERIOR_HALF_DEPTH + 0.5, INTERIOR_HALF_DEPTH - 0.5),
  ]
}

const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
const hitGeometry = new THREE.SphereGeometry(1, 8, 6)
const ringTexture = (() => {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 34, 64, 64, 62)
  grad.addColorStop(0, 'rgba(255,230,120,0)')
  grad.addColorStop(0.55, 'rgba(255,230,120,0.95)')
  grad.addColorStop(1, 'rgba(255,230,120,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
})()

/** Click target, thought-bubble status icon and selection halo shared by all creatures. */
export function CreatureOverlay({
  fishId,
  def,
  agentRef,
  radius,
  iconHeight,
}: {
  fishId: string
  def: FishDefinition
  agentRef: React.RefObject<FishAgent | null>
  radius: number
  iconHeight: number
}) {
  const spriteRef = useRef<THREE.Sprite>(null)
  const haloRef = useRef<THREE.Sprite>(null)
  const current = useRef<StatusIcon | null>(null)
  const selected = useUIStore((s) => s.selectedFishId === fishId)
  const interactive = useUIStore((s) => s.mode === 'view' || s.mode === 'feed')
  const iconMaterial = useMemo(() => new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 }), [])
  const haloMaterial = useMemo(
    () => new THREE.SpriteMaterial({ map: ringTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    [],
  )

  useFrame(({ clock }, delta) => {
    const sprite = spriteRef.current
    if (!sprite) return
    const agent = agentRef.current
    const hunger = useGameStore.getState().fishVitals[fishId]?.hunger ?? 0
    const mode = useUIStore.getState().mode
    let icon: StatusIcon | null = null
    if (agent && agent.effects.hearts > simClock.t) icon = 'love'
    else if (def.appetite > 0 && hunger > 0.85) icon = 'starving'
    else if (def.appetite > 0 && hunger > 0.6) icon = 'hungry'
    else if (agent?.sleeping) icon = 'sleep'
    if (mode === 'decorate' || mode === 'clean') icon = null
    if (icon !== current.current) {
      current.current = icon
      if (icon) {
        iconMaterial.map = statusTexture(icon)
        iconMaterial.needsUpdate = true
      }
    }
    const targetOpacity = icon ? 1 : 0
    iconMaterial.opacity = THREE.MathUtils.damp(iconMaterial.opacity, targetOpacity, 6, delta)
    sprite.visible = iconMaterial.opacity > 0.02
    const bob = Math.sin(clock.elapsedTime * 2.5 + fishId.length) * 0.03
    sprite.position.set(0, iconHeight + bob, 0)
    const s = icon === 'sleep' ? 0.22 : 0.26
    sprite.scale.setScalar(s * (icon === 'starving' ? 1 + Math.sin(clock.elapsedTime * 6) * 0.08 : 1))
    if (haloRef.current) {
      haloRef.current.visible = selected
      const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.06
      haloRef.current.scale.setScalar(radius * 3 * pulse)
      haloMaterial.rotation = clock.elapsedTime * 0.8
    }
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return
    e.stopPropagation()
    const ui = useUIStore.getState()
    const selecting = ui.selectedFishId !== fishId
    ui.selectFish(selecting ? fishId : null)
    sfx.click()
    if (selecting) useGameStore.getState().noteStat('fishGreeted')
    // Say hi: a happy shimmy and a look at the player.
    const agent = agentRef.current
    if (selecting && agent && !agent.sleeping) agent.wiggle = 1.1
    // The first hello in an hour really makes its day: hearts and a little coin.
    if (selecting && agent && hasPersonality(def) && tryPet(fishId)) {
      agent.effects.hearts = simClock.t + 3
      const at = agent.object.position
      spawnPopup({ x: at.x, y: at.y + iconHeight + 0.1, z: at.z }, '♥', '#ff5d8f', true)
      if (!ui.visiting) {
        const growth = useGameStore.getState().fishVitals[fishId]?.growth ?? 0
        spawnCoinBubble(at.clone().setY(at.y + 0.1), coinValueFor(Math.max(1, def.coinValue), growth))
      }
    }
  }

  return (
    <>
      {interactive && (
        // Invisible to the renderer (no draw call) but still raycast for taps.
        <mesh geometry={hitGeometry} material={hitMaterial} scale={radius} onClick={onClick} userData={{ fishHit: fishId }} visible={false} />
      )}
      <sprite ref={spriteRef} material={iconMaterial} renderOrder={20} />
      <sprite ref={haloRef} material={haloMaterial} visible={false} renderOrder={19} />
    </>
  )
}

function SwimmingFish({ instance, def }: { instance: FishInstance; def: FishDefinition }) {
  const { groupRef, agentRef } = useFishBrain(instance.id, def, { sizeScale: instance.sizeScale })
  // A fresh hatchling starts inside its egg and darts up out of it.
  const [fromEgg] = useState(() => hatchStart(instance))
  const [startPosition] = useState(() => fromEgg ?? randomStartPosition())
  useEffect(() => {
    const agent = agentRef.current
    if (!fromEgg || !agent) return
    agent.startle = 0.9
    agent.startleFrom.set(fromEgg[0], fromEgg[1] - 0.4, fromEgg[2])
  }, [fromEgg, agentRef])
  const hungerRef = useRef(0)
  useFrame(() => {
    hungerRef.current = useGameStore.getState().fishVitals[instance.id]?.hunger ?? 0
  })
  return (
    <group ref={groupRef} position={startPosition}>
      <FishBody def={def} agentRef={agentRef} seedKey={instance.id} hungerRef={hungerRef} />
      <CreatureOverlay
        fishId={instance.id}
        def={def}
        agentRef={agentRef}
        radius={Math.max(0.16, def.bodyLength * 0.6)}
        iconHeight={def.bodyHeight * 0.9 + 0.2}
      />
    </group>
  )
}

export function FishEntity({ instance }: { instance: FishInstance }) {
  const def = useMemo(() => inheritedDefinition(instance), [instance.defId, instance.inheritance])
  if (!def) return null
  switch (def.kind) {
    case 'jellyfish':
      return <JellyfishEntity instance={instance} def={def} />
    case 'seahorse':
      return <SeahorseEntity instance={instance} def={def} />
    case 'axolotl':
      return <AxolotlEntity instance={instance} def={def} />
    case 'snail':
      return <SnailEntity instance={instance} def={def} />
    case 'shrimp':
      return <ShrimpEntity instance={instance} def={def} />
    case 'octopus':
      return <OctopusEntity instance={instance} def={def} />
    case 'ray':
      return <MantaRayEntity instance={instance} def={def} />
    case 'turtle':
      return <SeaTurtleEntity instance={instance} def={def} />
    default:
      return <SwimmingFish instance={instance} def={def} />
  }
}
