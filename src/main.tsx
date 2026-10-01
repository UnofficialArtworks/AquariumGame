import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.tsx'
import { useGameStore } from './state/useGameStore'
import { useUIStore } from './state/useUIStore'
import { algaeCoverage, loadAlgae } from './sim/algae'
import { bonusesFor } from './state/bonuses'

// The save is already hydrated (synchronous localStorage), so algae can catch
// up on the time the player was away before the first frame renders.
const saved = useGameStore.getState()
loadAlgae(saved.murk, bonusesFor(saved.placedDecorations).algaeRate)
const welcome = useUIStore.getState().welcomeBack
if (welcome) useUIStore.getState().setWelcomeBack({ ...welcome, algaePercent: Math.round(algaeCoverage() * 100) })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
