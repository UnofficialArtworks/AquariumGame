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
import { runHelpers } from '../sim/helpers'
import { applyTankSize } from '../state/tankSizes'

/** A gap between ticks longer than this means the page was paused, not just busy. */
const CATCH_UP_SECONDS = 5
/** Same limit as the algae catch-up when the game is reopened. */
const MAX_ALGAE_CATCH_UP_SECONDS = 8 * 60 * 60

export function GameRoot() {
  const sound = useGameStore((s) => s.settings.sound)
  const music = useGameStore((s) => s.settings.music)
  const scrubbing = useUIStore((s) => s.mode === 'clean' && s.cleanTool === 'sponge' && s.toolActive)
  const relax = useUIStore((s) => s.relax)
  const { dpr, monitor } = useAdaptiveDpr()
  // The tank's size is shared module state that the scene reads, so it's set
  // before the scene renders (it's a no-op unless it changed). The scene is
  // keyed on it, so a bigger tank rebuilds everything at the new size.
  const tankSizeId = useGameStore((s) => s.tankSizeId)
  applyTankSize(tankSizeId)

  useEffect(() => {
    let ticks = 0
    const interval = setInterval(() => {
      const s = useGameStore.getState()
      const ui = useUIStore.getState()
      ui.syncClock()
      // A friend's tank just sits there looking lovely: no hunger, goals or visitors.
      if (ui.visiting) return
      // A hidden page counts as time away, caught up in one go when the player comes back.
      if (document.hidden) return
      const away = (Date.now() - s.lastTickTimestamp) / 1000
      if (away > CATCH_UP_SECONDS) {
        // The browser paused the page (a phone in the background, a sleeping laptop):
        // catch up the same way as reopening the game.
        s.applyOfflineProgress()
        growAlgae(Math.min(MAX_ALGAE_CATCH_UP_SECONDS, away), s.murk, bonusesFor(s.placedDecorations).algaeRate)
      } else {
        s.tick()
      }
      s.refreshGoals()
      updateVisitors()
      runHelpers()
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

  // No long-press or right-click menus over the game (text boxes keep theirs).
  useEffect(() => {
    const noMenu = (e: MouseEvent) => {
      if (!(e.target instanceof Element && e.target.closest('input, textarea'))) e.preventDefault()
    }
    window.addEventListener('contextmenu', noMenu)
    return () => window.removeEventListener('contextmenu', noMenu)
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
        onPointerMissed={(e) => {
          // A tap on empty water or gravel lets go of the selected decoration.
          const ui = useUIStore.getState()
          if (e.type === 'click' && ui.mode === 'decorate' && !ui.draggingId) ui.setSelectedDecorationId(null)
        }}
      >
        {monitor}
        <TankScene key={tankSizeId} />
        <PhotoCapture />
      </Canvas>
      <ItemPreviewGenerator />
      <HUD />
      {scrubbing && <div className="scrub-hint">Release to show controls</div>}
      {relax && <RelaxOverlay />}
    </div>
  )
}
