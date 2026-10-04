import { useUIStore } from '../state/useUIStore'
import { ESCAPE_LAYER, useEscape } from './escape'

/** Covers the screen in relax mode: any tap (or Esc) brings the controls back. */
export function RelaxOverlay() {
  useEscape(() => useUIStore.getState().setRelax(false), ESCAPE_LAYER.relax)
  return (
    <button className="relax-catcher" onClick={() => useUIStore.getState().setRelax(false)} aria-label="Leave relax mode">
      <span className="relax-hint">Tap anywhere to come back</span>
    </button>
  )
}
