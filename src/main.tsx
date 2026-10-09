// First: a moving code brought in on the last page load becomes the save before anything reads it.
import './app/arrival'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Nunito ships with the game, so playing asks nothing of any other server.
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/700.css'
import '@fontsource/nunito/800.css'
import '@fontsource/nunito/900.css'
import './styles/global.css'
import App from './App.tsx'
import { useGameStore } from './state/useGameStore'
import { useUIStore } from './state/useUIStore'
import { algaeCoverage, loadAlgae } from './sim/algae'
import { bonusesFor } from './state/bonuses'
import { shareCodeFrom } from './state/share'
import { beginVisit } from './app/visit'
import { applyTankSize } from './state/tankSizes'

// A shared tank link (#tank=...) opens a look-only visit to a friend's tank.
const sharedCode = shareCodeFrom(location.hash)
if (sharedCode) {
  beginVisit(sharedCode)
} else {
  // The save is already hydrated (synchronous localStorage), so algae can catch
  // up on the time the player was away before the first frame renders.
  const saved = useGameStore.getState()
  applyTankSize(saved.tankSizeId)
  loadAlgae(saved.murk, bonusesFor(saved.placedDecorations).algaeRate)
  const welcome = useUIStore.getState().welcomeBack
  if (welcome) useUIStore.getState().setWelcomeBack({ ...welcome, algaePercent: Math.round(algaeCoverage() * 100) })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
