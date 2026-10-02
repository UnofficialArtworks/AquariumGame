import * as THREE from 'three'
import { waterLevel } from '../scene/TankBounds'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { emitSparks } from './sparks'
import { spawnPopup } from './popups'
import { sfx } from '../audio/sfx'
import { addRipple } from './ripples'

export interface CoinBubble {
  habitat: 'main' | 'nursery'
  uid: number
  position: THREE.Vector3
  value: number
  age: number
  phase: number
}

export const MAX_COINS = 40
export const coinBubbles: CoinBubble[] = []
let seq = 1

/** A happy fish releases a coin wrapped in a bubble; it drifts up to the surface. */
export function spawnCoinBubble(position: THREE.Vector3, value: number) {
  if (coinBubbles.length >= MAX_COINS) {
    const oldest = coinBubbles.shift()
    if (oldest) autoCollect(oldest)
  }
  coinBubbles.push({ habitat: useUIStore.getState().activeTank, uid: seq++, position: position.clone(), value, age: 0, phase: Math.random() * 6.28 })
}

function removeAt(index: number) {
  coinBubbles.splice(index, 1)
}

function autoCollect(coin: CoinBubble) {
  useGameStore.getState().collectCoins(coin.value, false)
  if (coin.habitat !== useUIStore.getState().activeTank) return
  emitSparks(coin.position, 8, '#ffd84a', { speed: 0.7, size: 1, life: 0.6 })
  spawnPopup({ x: coin.position.x, y: coin.position.y + 0.1, z: coin.position.z }, `+${coin.value}`, '#ffe38a')
  sfx.pop(1.3)
}

/** Player tapped a coin bubble: double value + XP. */
export function collectCoinBubble(uid: number): boolean {
  const index = coinBubbles.findIndex((c) => c.uid === uid)
  if (index < 0) return false
  const coin = coinBubbles[index]
  removeAt(index)
  const value = coin.value * 2
  useGameStore.getState().collectCoins(value, true)
  emitSparks(coin.position, 14, '#ffd84a', { speed: 1.2, size: 1.3, life: 0.7 })
  spawnPopup({ x: coin.position.x, y: coin.position.y + 0.15, z: coin.position.z }, `+${value}`, '#ffd84a', true)
  sfx.pop(1)
  sfx.coin()
  return true
}

export function updateCoins(dt: number) {
  const surface = waterLevel.current
  for (let i = coinBubbles.length - 1; i >= 0; i--) {
    const coin = coinBubbles[i]
    coin.age += dt
    coin.position.y += dt * 0.24
    coin.position.x += Math.sin(coin.age * 1.8 + coin.phase) * dt * 0.08
    coin.position.z += Math.cos(coin.age * 1.5 + coin.phase) * dt * 0.06
    if (coin.position.y >= surface - 0.12) {
      removeAt(i)
      addRipple(coin.position.x, coin.position.z, 0.6)
      autoCollect(coin)
    }
  }
}
