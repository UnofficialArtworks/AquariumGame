import { applyArrival } from '../state/moving'

// Imported first by main.tsx: a moving code brought in on the last page load becomes this
// device's save before the game store reads it.
try {
  if (applyArrival()) sessionStorage.setItem('aquarium-moved-in', '1')
} catch {
  // Storage blocked: nothing to bring in.
}
