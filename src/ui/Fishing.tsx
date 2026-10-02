import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { dayKey } from '../state/goals'
import { castsLeft, CASTS_PER_DAY, markerAt, reelDifficulty, rollCatch, zoneStart, type Catch } from '../state/fishing'
import { fishPreviewKey, usePreviewStore } from '../state/usePreviewStore'
import { getFishDef } from '../scene/fish/fishDefinitions'
import { getFoodDef } from '../scene/food/foodDefinitions'
import { sfx } from '../audio/sfx'
import { Modal } from './components/Modal'
import { Button } from './components/Button'
import { ItemThumbnail } from './ItemThumbnail'

type Phase = 'ready' | 'waiting' | 'bite' | 'reeling' | 'result'

/** How long a bite lasts before the fish swims off, and how long you get to reel. */
const BITE_MS = 1600
const REEL_MS = 7000

/** The fishing mini-game: cast, wait for a bite, then reel in while the marker is in the green. */
export function Fishing() {
  const open = useUIStore((s) => s.activeModal === 'fishing')
  if (!open) return null
  return (
    <Modal title="🎣 Fishing" onClose={() => useUIStore.getState().openModal(null)}>
      <FishingGame />
    </Modal>
  )
}

function FishingGame() {
  const left = useGameStore((s) => castsLeft(s.fishing, dayKey()))
  const [phase, setPhase] = useState<Phase>('ready')
  const [result, setResult] = useState<{ text: string; caught: Catch | null }>({ text: '', caught: null })
  const [reel, setReel] = useState({ zone: 0.25, start: 0.4, speed: 0.7, catch: null as Catch | null, began: 0 })
  const markerRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // Sweep the marker while reeling (straight on the element, no re-renders).
  useEffect(() => {
    if (phase !== 'reeling') return
    let frame = 0
    const tick = () => {
      const t = (performance.now() - reel.began) / 1000
      if (markerRef.current) markerRef.current.style.left = `${markerAt(t, reel.speed) * 100}%`
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, reel])

  const finish = (text: string, caught: Catch | null) => {
    window.clearTimeout(timer.current)
    setResult({ text, caught })
    setPhase('result')
  }

  const cast = () => {
    if (!useGameStore.getState().castLine()) return
    sfx.splash()
    setPhase('waiting')
    // A fish finds the bait after a little wait...
    timer.current = window.setTimeout(() => {
      sfx.pop(0.7)
      setPhase('bite')
      // ...and swims off if you don't reel in quickly.
      timer.current = window.setTimeout(() => finish('It nibbled the bait and swam off. So close!', null), BITE_MS)
    }, 1500 + Math.random() * 3000)
  }

  const strike = () => {
    window.clearTimeout(timer.current)
    const c = rollCatch(useGameStore.getState().xp)
    const { zone, speed } = reelDifficulty(c)
    setReel({ zone, speed, start: zoneStart(zone), catch: c, began: performance.now() })
    setPhase('reeling')
    timer.current = window.setTimeout(() => finish('It wriggled off the hook. Try again!', null), REEL_MS)
  }

  const reelIn = () => {
    const at = markerAt((performance.now() - reel.began) / 1000, reel.speed)
    if (at >= reel.start && at <= reel.start + reel.zone && reel.catch) {
      const text = useGameStore.getState().landCatch(reel.catch)
      if (reel.catch.kind === 'fish') sfx.magic()
      else sfx.coin(true)
      finish(text, reel.catch)
    } else {
      sfx.denied()
      finish('Splash! It got away. Watch the green zone and try again.', null)
    }
  }

  return (
    <div className="fishing">
      <div className={`fishing-scene is-${phase}`} aria-hidden>
        <span className="fishing-line" />
        <span className="fishing-bobber" />
        {phase === 'bite' && <span className="fishing-alert">!</span>}
        <span className="fishing-ripple" />
      </div>

      {phase === 'ready' && (
        <div className="fishing-panel">
          <p>{left > 0 ? 'Cast your line and wait for a nibble. You might catch coins, treats, or a brand-new fish!' : 'No casts left today. The fish will be biting again tomorrow!'}</p>
          <Button variant="primary" disabled={left <= 0} onClick={cast}>
            🎣 Cast ({left}/{CASTS_PER_DAY} left today)
          </Button>
        </div>
      )}
      {phase === 'waiting' && (
        <div className="fishing-panel">
          <p>Waiting for a bite… keep your eyes on the bobber.</p>
        </div>
      )}
      {phase === 'bite' && (
        <div className="fishing-panel">
          <p>
            <strong>Something's biting!</strong>
          </p>
          <Button variant="primary" className="fishing-big" onClick={strike}>
            Hook it!
          </Button>
        </div>
      )}
      {phase === 'reeling' && (
        <div className="fishing-panel">
          <p>Tap Reel while the marker is in the green!</p>
          <div className="reel-bar">
            <span className="reel-zone" style={{ left: `${reel.start * 100}%`, width: `${reel.zone * 100}%` }} />
            <span className="reel-marker" ref={markerRef} />
          </div>
          <Button variant="primary" className="fishing-big" onClick={reelIn}>
            Reel!
          </Button>
        </div>
      )}
      {phase === 'result' && (
        <div className="fishing-panel">
          {result.caught && <CatchArt caught={result.caught} />}
          <p>{result.text}</p>
          <Button variant="primary" disabled={left <= 0} onClick={() => setPhase('ready')}>
            {left > 0 ? `Cast again (${left} left)` : 'No casts left today'}
          </Button>
        </div>
      )}
    </div>
  )
}

function CatchArt({ caught }: { caught: Catch }) {
  // A rare-colour catch needs its own thumbnail.
  const morph = caught.kind === 'fish' ? caught.morph : undefined
  const defId = caught.kind === 'fish' ? caught.defId : ''
  useEffect(() => {
    if (morph) usePreviewStore.getState().requestPreviews([{ key: fishPreviewKey(defId, morph), kind: 'fish', defId, morph }])
  }, [defId, morph])
  if (caught.kind === 'fish') {
    const def = getFishDef(caught.defId)
    return (
      <span className="fishing-catch">
        <ItemThumbnail previewKey={fishPreviewKey(caught.defId, caught.morph)} color={def?.color ?? '#7fd3ff'} className="pedia-thumb" />
      </span>
    )
  }
  return <span className="fishing-catch fishing-catch-icon">{caught.kind === 'coins' ? caught.icon : getFoodDef(caught.treat).icon}</span>
}
