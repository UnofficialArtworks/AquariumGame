// Manual browser QA fixture, excluded from the production entry/build.
// Game mutations live in memory and never overwrite the player's save.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useGameStore } from '../src/state/useGameStore'
import { createInitialState } from '../src/state/migrations'
import { useUIStore } from '../src/state/useUIStore'
import { loadAlgae } from '../src/sim/algae'
import { createNurseryEgg } from '../src/state/nursery'
import App from '../src/App'
import '../src/styles/global.css'

useGameStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
const initial = createInitialState()
initial.aquariumName = 'Bubble Buddies QA'
initial.currency = 150
initial.ownedFish[0].name = 'Bubbles'
initial.ownedFish[1].name = 'Waffles'
initial.fishVitals[initial.ownedFish[0].id].growth = 1
initial.fishVitals[initial.ownedFish[1].id].growth = 1
initial.ownedFish[0].habitat = 'nursery'
initial.ownedFish[1].habitat = 'nursery'
const nearHatch = createNurseryEgg(initial.ownedFish[0], initial.ownedFish[1])
const cozyEgg = createNurseryEgg(initial.ownedFish[0], initial.ownedFish[1])
initial.nurseryEggs = [{ ...nearHatch, remainingSeconds: 20 }, { ...cozyEgg, hatchSeconds: 600, remainingSeconds: 600 }]
useGameStore.setState(initial)
useUIStore.setState({ activeTank: 'nursery', welcomeBack: null, levelUp: null })
loadAlgae(0.1)
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

// Report actual HUD hit-testing during a scrub; this fixture never ships in the game.
new MutationObserver((changes) => {
  if (!changes.some((change) => change.attributeName === 'data-scrubbing')) return
  const root = document.querySelector('.game-root')
  const hud = document.querySelector('.hud-top')
  if (root?.getAttribute('data-scrubbing') === 'true' && hud) {
    const style = getComputedStyle(hud)
    console.info(`Scrub HUD: visibility=${style.visibility}; pointer-events=${style.pointerEvents}`)
  }
}).observe(document.getElementById('root')!, { subtree: true, attributes: true, attributeFilter: ['data-scrubbing'] })
