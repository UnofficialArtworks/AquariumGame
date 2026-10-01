import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { PCFShadowMap } from 'three'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { TankScene } from '../scene/TankScene'
import { ItemPreviewGenerator } from '../scene/preview/ItemPreviewGenerator'
import { HUD } from '../ui/HUD'
import { growAlgae, saveAlgae } from '../sim/algae'
import { bonusesFor } from '../state/bonuses'
import { setSoundEnabled, unlockAudio } from '../audio/sfx'

export function GameRoot() {
  const sound = useGameStore((s) => s.settings.sound)
  const scrubbing = useUIStore((s) => s.mode === 'clean' && s.cleanTool === 'sponge' && s.toolActive)

  useEffect(() => {
    let ticks = 0
    const interval = setInterval(() => {
      const s = useGameStore.getState()
      s.tick()
      growAlgae(1, s.murk, bonusesFor(s.placedDecorations).algaeRate)
      ticks++
      if (ticks % 10 === 0) saveAlgae()
    }, 1000)
    const persist = () => saveAlgae()
    window.addEventListener('beforeunload', persist)
    document.addEventListener('visibilitychange', persist)
    // Strict Mode runs effects twice in dev; cleanup keeps the tick from doubling.
    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', persist)
      document.removeEventListener('visibilitychange', persist)
    }
  }, [])

  // Browsers only allow audio after a user gesture.
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    return () => window.removeEventListener('pointerdown', unlockAudio)
  }, [])

  useEffect(() => setSoundEnabled(sound), [sound])

  return (
    <div className="game-root" data-scrubbing={scrubbing}>
      <Canvas
        className="tank-canvas"
        shadows={{ type: PCFShadowMap }}
        dpr={[1, 1.75]}
        gl={{ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
      >
        <TankScene />
      </Canvas>
      <ItemPreviewGenerator />
      <HUD />
      {scrubbing && <div className="scrub-hint">Release to show controls</div>}
    </div>
  )
}
