import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { dayKey } from '../state/goals'
import {
  castsLeft,
  CASTS_PER_DAY,
  judgeReel,
  LINE_STRENGTH,
  markerAt,
  nextZoneStart,
  reelDifficulty,
  reelHits,
  reelSpeed,
  rollCatch,
  zoneStart,
  type Catch,
  type ReelJudgement,
} from '../state/fishing'
import { fishPreviewKey, usePreviewStore } from '../state/usePreviewStore'
import { getFishDef } from '../scene/fish/fishDefinitions'
import { getFoodDef } from '../scene/food/foodDefinitions'
import { getMorph, speciesLabel } from '../state/morphs'
import { sfx } from '../audio/sfx'
import { Modal } from './components/Modal'
import { Button } from './components/Button'
import { ItemThumbnail } from './ItemThumbnail'
import { CAST_MS, LEAP_MS, PondScene, type CatchArt } from './fishing/pondScene'

type Phase = 'ready' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'landing' | 'lost' | 'result'

/** How long a bite lasts before the fish swims off. */
const BITE_MS = 1700
/** The marker pauses this long after each tap so you can see where it stopped. */
const FEEDBACK_MS = 450

interface Reel {
  catch: Catch
  need: number
  hits: number
  strength: number
  zone: number
  start: number
  speed: number
}

interface Result {
  text: string
  caught: Catch | null
  isNew: boolean
}

/** The fishing mini-game: cast, wait for the big splash, hook it, then reel it in with well-timed taps. */
export function Fishing() {
  const open = useUIStore((s) => s.activeModal === 'fishing')
  if (!open) return null
  return (
    <Modal title="🎣 Fishing" className="fishing-modal" onClose={() => useUIStore.getState().openModal(null)}>
      <FishingGame />
    </Modal>
  )
}

function vibrate(ms: number) {
  try {
    // Browsers only allow a buzz once the page has been tapped.
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(ms)
  } catch {
    // Not every device can buzz.
  }
}

function catchArt(c: Catch): CatchArt {
  if (c.kind === 'coins') return { emoji: c.icon, color: '#ffd34d' }
  if (c.kind === 'treat') return { emoji: getFoodDef(c.treat).icon, color: '#ffb36b' }
  const def = getFishDef(c.defId)
  return { image: usePreviewStore.getState().images[fishPreviewKey(c.defId, c.morph)], color: getMorph(c.morph)?.color ?? def?.color ?? '#7fd3ff' }
}

function FishingGame() {
  const left = useGameStore((s) => castsLeft(s.fishing, dayKey()))
  const night = useUIStore((s) => s.night)
  const [phase, setPhaseState] = useState<Phase>('ready')
  const [hint, setHint] = useState('')
  const [result, setResult] = useState<Result>({ text: '', caught: null, isNew: false })
  const [reel, setReelState] = useState<Reel | null>(null)
  const [flash, setFlash] = useState<{ verdict: ReelJudgement; at: number; id: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<PondScene | null>(null)
  const markerRef = useRef<HTMLSpanElement>(null)
  const timers = useRef<number[]>([])
  // Live copies for the animation loop and input handlers.
  const phaseRef = useRef<Phase>('ready')
  const reelRef = useRef<Reel | null>(null)
  // The marker's own clock: how far it has travelled, what's on screen, and when it may move again.
  const marker = useRef({ trips: 0, last: 0, shown: 0, frozenUntil: 0 })
  const lastAct = useRef(0)
  const flashId = useRef(0)
  /** A caught fish whose picture is still being drawn. */
  const awaitingArt = useRef<Catch | null>(null)

  const setPhase = (next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }
  const setReel = (next: Reel | null) => {
    reelRef.current = next
    setReelState(next)
  }
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }

  useEffect(() => {
    const scene = new PondScene(canvasRef.current!)
    sceneRef.current = scene
    return () => {
      scene.destroy()
      timers.current.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.night = night
  }, [night])

  // Swap in the catch's picture as soon as it's ready.
  useEffect(
    () =>
      usePreviewStore.subscribe(() => {
        const c = awaitingArt.current
        const art = c && catchArt(c)
        if (!art?.image) return
        awaitingArt.current = null
        sceneRef.current?.showCatch(art)
      }),
    [],
  )

  // Move the marker straight on the element while reeling (no re-renders).
  useEffect(() => {
    if (phase !== 'reeling') return
    let frame = 0
    const m = marker.current
    m.last = performance.now()
    const tick = (now: number) => {
      const r = reelRef.current
      if (r && now >= m.frozenUntil) m.trips += ((now - m.last) / 1000) * reelSpeed(r.speed, r.hits)
      m.last = now
      m.shown = markerAt(m.trips, 1)
      if (markerRef.current) markerRef.current.style.left = `${m.shown * 100}%`
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase])

  const scene = () => sceneRef.current

  const cast = () => {
    if (phaseRef.current !== 'ready' && phaseRef.current !== 'result') return
    if (!useGameStore.getState().castLine()) return
    clearTimers()
    awaitingArt.current = null
    setHint('')
    sfx.cast()
    scene()?.set('casting')
    setPhase('casting')
    later(() => {
      sfx.splash()
      scene()?.set('waiting')
      setPhase('waiting')
      // A fish finds the bait after a little wait, testing it a time or two first...
      const wait = 1800 + Math.random() * 3200
      const nibbles = Math.floor(Math.random() * 3)
      for (let i = 0; i < nibbles; i++) {
        later(() => {
          sfx.nibble()
          scene()?.nibble()
        }, wait * (0.25 + (0.6 * (i + Math.random())) / Math.max(1, nibbles)))
      }
      later(bite, wait)
    }, CAST_MS)
  }

  const bite = () => {
    sfx.splash()
    sfx.pop(0.7)
    vibrate(70)
    setHint('')
    scene()?.set('bite')
    setPhase('bite')
    // ...and swims off if you don't hook it quickly.
    later(() => lose('It nibbled the bait and swam off. So close!'), BITE_MS)
  }

  const hook = () => {
    clearTimers()
    const c = rollCatch(useGameStore.getState().xp)
    // Get the catch's picture ready while you reel.
    if (c.kind === 'fish' && c.morph) {
      usePreviewStore.getState().requestPreviews([{ key: fishPreviewKey(c.defId, c.morph), kind: 'fish', defId: c.defId, morph: c.morph }], true)
    }
    const { zone, speed } = reelDifficulty(c)
    setReel({ catch: c, need: reelHits(c), hits: 0, strength: LINE_STRENGTH, zone, start: zoneStart(zone), speed })
    Object.assign(marker.current, { trips: 0, shown: 0, frozenUntil: 0, last: performance.now() })
    setFlash(null)
    sfx.reel(0)
    scene()?.set('reeling')
    scene()?.reelTo(0)
    setPhase('reeling')
  }

  const reelTap = (eventTime: number) => {
    const r = reelRef.current
    const m = marker.current
    const now = performance.now()
    if (!r || now < m.frozenUntil) return
    // Judge both what was on screen and where the marker really was at the tap: either one in the green counts.
    const lag = Math.max(0, Math.min(0.05, (eventTime - m.last) / 1000))
    const real = markerAt(m.trips + lag * reelSpeed(r.speed, r.hits), 1)
    const verdicts = [judgeReel(m.shown, r.start, r.zone), judgeReel(real, r.start, r.zone)]
    const verdict: ReelJudgement = verdicts.includes('perfect') ? 'perfect' : verdicts.includes('hit') ? 'hit' : 'miss'
    m.frozenUntil = now + FEEDBACK_MS
    setFlash({ verdict, at: m.shown, id: ++flashId.current })
    if (verdict === 'miss') {
      const strength = r.strength - 1
      sfx.twang()
      vibrate(40)
      scene()?.strain()
      setReel({ ...r, strength })
      if (strength <= 0) later(() => lose('The line went slack and it got away. Try again!'), FEEDBACK_MS)
      return
    }
    const hits = r.hits + 1
    sfx.reel(hits)
    scene()?.reelTo(hits / r.need)
    if (hits >= r.need) {
      setReel({ ...r, hits })
      later(() => land(r.catch), FEEDBACK_MS * 0.6)
      return
    }
    const shown = m.shown
    setReel({ ...r, hits })
    // The zone hops somewhere new once you've seen where you stopped.
    later(() => {
      const current = reelRef.current
      if (current && phaseRef.current === 'reeling') setReel({ ...current, start: nextZoneStart(current.zone, shown) })
    }, FEEDBACK_MS)
  }

  const land = (c: Catch) => {
    clearTimers()
    const before = c.kind === 'fish' && Boolean(useGameStore.getState().fishpedia[c.defId])
    const text = useGameStore.getState().landCatch(c)
    const isNew = c.kind === 'fish' && !before && Boolean(useGameStore.getState().fishpedia[c.defId])
    const art = catchArt(c)
    awaitingArt.current = c.kind === 'fish' && !art.image ? c : null
    scene()?.showCatch(art)
    scene()?.set('landing')
    sfx.leap()
    setPhase('landing')
    later(() => {
      if (c.kind === 'fish') sfx.magic()
      else sfx.coin(true)
      scene()?.set('caught')
      setResult({ text, caught: c, isNew })
      setPhase('result')
    }, LEAP_MS)
  }

  const lose = (text: string) => {
    clearTimers()
    sfx.splash()
    scene()?.set('lost')
    setPhase('lost')
    later(() => {
      setResult({ text, caught: null, isNew: false })
      setPhase('result')
    }, 700)
  }

  /** One button does it all: cast, hook, reel or cast again. */
  const act = (eventTime: number, fromPond = false) => {
    if (eventTime - lastAct.current < 120) return
    lastAct.current = eventTime
    switch (phaseRef.current) {
      case 'ready':
      case 'result':
        if (!fromPond) cast()
        break
      case 'waiting':
        setHint('Not yet… wait for the big splash!')
        break
      case 'bite':
        hook()
        break
      case 'reeling':
        reelTap(eventTime)
        break
    }
  }

  // Space or Enter plays too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return
      // Leave other controls (like the close button) to do their own thing.
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('input, textarea, select') || (target?.closest('button, a') && !target.closest('.fishing'))) return
      e.preventDefault()
      act(e.timeStamp)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const press = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    act(e.timeStamp)
  }
  // Pointer presses are handled on the way down; this catches clicks from assistive tech,
  // but not the echo of a key press the window listener already played.
  const keyClick = (e: MouseEvent) => {
    if (e.detail === 0 && performance.now() - lastAct.current > 400) act(performance.now())
  }

  return (
    <div className="fishing">
      <div
        className={`fishing-stage is-${phase}`}
        onPointerDown={(e) => {
          if (e.button === 0) act(e.timeStamp, true)
        }}
      >
        <canvas ref={canvasRef} className="fishing-canvas" aria-label="A garden pond with your fishing line" role="img" />
        {phase === 'reeling' && reel && (
          <div className="reel-hud">
            <div className="reel-meta">
              <span className="reel-pips" aria-label={`${reel.hits} of ${reel.need} reeled in`}>
                {Array.from({ length: reel.need }, (_, i) => (
                  <span key={i} className={i < reel.hits ? 'is-on' : ''} />
                ))}
              </span>
              <span className="reel-line" aria-label={`Line strength ${reel.strength} of ${LINE_STRENGTH}`}>
                {Array.from({ length: LINE_STRENGTH }, (_, i) => (
                  <span key={i} className={i < reel.strength ? 'is-on' : ''}>
                    ❤
                  </span>
                ))}
              </span>
            </div>
            <div className={`reel-bar ${flash ? `is-${flash.verdict}` : ''}`} key={flash?.id ?? 0}>
              <span className="reel-zone" style={{ left: `${reel.start * 100}%`, width: `${reel.zone * 100}%` }} />
              <span className="reel-marker" ref={markerRef} style={{ left: `${marker.current.shown * 100}%` }} />
              {flash && (
                <span className={`reel-flash is-${flash.verdict}`} style={{ left: `${flash.at * 100}%` }}>
                  {flash.verdict === 'perfect' ? 'Perfect!' : flash.verdict === 'hit' ? 'Nice!' : 'Missed!'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {(phase === 'ready' || phase === 'casting') && (
        <div className="fishing-panel">
          <p>{left > 0 ? 'Cast your line, wait for the big splash, then reel it in. You might catch coins, treats, or a brand-new fish!' : 'No casts left today. The fish will be biting again tomorrow!'}</p>
          <Button variant="primary" className="fishing-big" disabled={left <= 0 || phase === 'casting'} onClick={cast}>
            🎣 Cast
          </Button>
          <CastsLeft left={left} />
        </div>
      )}
      {phase === 'waiting' && (
        <div className="fishing-panel">
          <p>{hint || 'Watch the bobber… little nibbles don’t count. Wait for the big splash!'}</p>
          <Button variant="primary" className="fishing-big is-waiting" onPointerDown={press} onClick={keyClick}>
            Hook it!
          </Button>
        </div>
      )}
      {phase === 'bite' && (
        <div className="fishing-panel">
          <p>
            <strong>Something’s biting!</strong>
          </p>
          <Button variant="primary" className="fishing-big is-hot" onPointerDown={press} onClick={keyClick}>
            Hook it!
          </Button>
        </div>
      )}
      {phase === 'reeling' && (
        <div className="fishing-panel">
          <p>Tap Reel (or the pond) when the marker is in the green!</p>
          <Button variant="primary" className="fishing-big" onPointerDown={press} onClick={keyClick}>
            Reel!
          </Button>
          <small className="key-hint">Space works too</small>
        </div>
      )}
      {(phase === 'landing' || phase === 'lost') && (
        <div className="fishing-panel">
          <p>{phase === 'landing' ? 'Here it comes…' : 'Oh no!'}</p>
          <Button variant="primary" className="fishing-big" disabled>
            🎣 Cast again
          </Button>
        </div>
      )}
      {phase === 'result' && (
        <div className="fishing-panel">
          {result.caught && <CatchCard caught={result.caught} isNew={result.isNew} />}
          <p>{result.text}</p>
          <Button variant="primary" className="fishing-big" disabled={left <= 0} onClick={cast}>
            {left > 0 ? '🎣 Cast again' : 'No casts left today'}
          </Button>
          <CastsLeft left={left} />
        </div>
      )}
    </div>
  )
}

function CastsLeft({ left }: { left: number }) {
  return (
    <span className="casts-left" aria-label={`${left} of ${CASTS_PER_DAY} casts left today`}>
      {Array.from({ length: CASTS_PER_DAY }, (_, i) => (
        <span key={i} className={i < left ? 'is-on' : ''} />
      ))}
      <small>
        {left}/{CASTS_PER_DAY} casts left today
      </small>
    </span>
  )
}

function CatchCard({ caught, isNew }: { caught: Catch; isNew: boolean }) {
  // A rare-colour catch needs its own thumbnail.
  const morph = caught.kind === 'fish' ? caught.morph : undefined
  const defId = caught.kind === 'fish' ? caught.defId : ''
  useEffect(() => {
    if (morph) usePreviewStore.getState().requestPreviews([{ key: fishPreviewKey(defId, morph), kind: 'fish', defId, morph }])
  }, [defId, morph])
  if (caught.kind === 'fish') {
    const def = getFishDef(caught.defId)
    const m = getMorph(caught.morph)
    return (
      <div className="catch-card">
        <span className="fishing-catch">
          <ItemThumbnail previewKey={fishPreviewKey(caught.defId, caught.morph)} color={def?.color ?? '#7fd3ff'} className="pedia-thumb" />
        </span>
        <span className="catch-copy">
          <strong>{def ? speciesLabel(def, caught.morph) : 'A fish'}</strong>
          <span>
            {def && <span className={`rarity rarity-${def.rarity}`}>{def.rarity}</span>}
            {m && <span className="rarity rarity-morph">{m.icon} rare colours</span>}
            {isNew && <span className="rarity rarity-new">✨ new species</span>}
          </span>
        </span>
      </div>
    )
  }
  return (
    <div className="catch-card">
      <span className="fishing-catch fishing-catch-icon">{caught.kind === 'coins' ? caught.icon : getFoodDef(caught.treat).icon}</span>
      <span className="catch-copy">
        <strong>{caught.kind === 'coins' ? `+${caught.coins} coins` : `${caught.count} × ${getFoodDef(caught.treat).name}`}</strong>
        <span>{caught.kind === 'coins' ? 'Treasure from the pond' : 'A treat for your fish'}</span>
      </span>
    </div>
  )
}
