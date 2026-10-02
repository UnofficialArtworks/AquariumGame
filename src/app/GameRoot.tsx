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
import { setMusicEnabled, setMusicMood } from '../audio/music'
import { PhotoCapture, useAdaptiveDpr } from '../scene/RenderBudget'
import { RelaxOverlay } from '../ui/RelaxOverlay'
import { updateVisitors } from '../sim/visitors'

export function GameRoot() {
  const sound = useGameStore((s) => s.settings.sound)
  const music = useGameStore((s) => s.settings.music)
  const scrubbing = useUIStore((s) => s.mode === 'clean' && s.cleanTool === 'sponge' && s.toolActive)
  const relax = useUIStore((s) => s.relax)
  const { dpr, monitor } = useAdaptiveDpr()

  useEffect(() => {
    let ticks = 0
    const interval = setInterval(() => {
      const s = useGameStore.getState()
      const ui = useUIStore.getState()
      ui.syncClock()
      // A friend's tank just sits there looking lovely: no hunger, goals or visitors.
      if (ui.visiting) return
      s.tick()
      s.refreshGoals()
      updateVisitors()
      if (ui.relax && !document.hidden) s.noteStat('relaxSeconds')
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
  useEffect(() => setMusicEnabled(music), [music])
  useEffect(() => {
    setMusicMood(() => {
      const ui = useUIStore.getState()
      return ui.activeTank === 'nursery' ? 'nursery' : ui.night ? 'night' : 'day'
    })
  }, [])

  return (
    <div className="game-root" data-scrubbing={scrubbing} data-relax={relax}>
      <Canvas
        className="tank-canvas"
        shadows={{ type: PCFShadowMap }}
        dpr={dpr}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
      >
        {monitor}
        <TankScene />
        <PhotoCapture />
      </Canvas>
      <ItemPreviewGenerator />
      <HUD />
      {scrubbing && <div className="scrub-hint">Release to show controls</div>}
      {relax && <RelaxOverlay />}
    </div>
  )
}
