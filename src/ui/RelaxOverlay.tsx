import { useEffect } from 'react'
import { useUIStore } from '../state/useUIStore'

/** Covers the screen in relax mode: any tap (or Esc) brings the controls back. */
export function RelaxOverlay() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useUIStore.getState().setRelax(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <button className="relax-catcher" onClick={() => useUIStore.getState().setRelax(false)} aria-label="Leave relax mode">
      <span className="relax-hint">Tap anywhere to come back</span>
    </button>
  )
}
