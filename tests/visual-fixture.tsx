// Disposable browser QA. State is in memory on a separate dev-server origin.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App'
import { createInitialState } from '../src/state/migrations'
import { useGameStore } from '../src/state/useGameStore'
import { useUIStore } from '../src/state/useUIStore'
import { BACKGROUND_CATALOG } from '../src/scene/backgrounds'
import { FISH_CATALOG } from '../src/scene/fish/fishDefinitions'
import { DECORATION_CATALOG } from '../src/scene/decorations/decorationDefinitions'
import { createNurseryEgg } from '../src/state/nursery'
import { growAlgae, loadAlgae, scrubAlgae } from '../src/sim/algae'
import '../src/styles/global.css'

useGameStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
const initial = createInitialState()
initial.aquariumName = 'Aquarium Visual QA'
initial.currency = 100000
initial.xp = 100000
initial.murk = 0
initial.backgroundId = 'coral-reef'
initial.unlockedBackgroundIds = BACKGROUND_CATALOG.map((def) => def.id)
initial.unlockedDecorationDefIds = DECORATION_CATALOG.map((def) => def.id)
for (const fish of initial.ownedFish) initial.fishVitals[fish.id].growth = 1
const [first, second] = initial.ownedFish
first.habitat = second.habitat = 'nursery'
initial.nurseryEggs = Array.from({ length: 6 }, () => ({ ...createNurseryEgg(first, second), hatchSeconds: 600, remainingSeconds: 600 }))
// Same species at opposite size bounds makes adult variation easy to inspect.
const def = FISH_CATALOG.find((fish) => fish.id === 'goldfish')!
for (const [index, sizeScale] of def.sizeRange.entries()) {
  const id = crypto.randomUUID()
  initial.ownedFish.push({ id, defId: def.id, name: index === 0 ? 'Tiny' : 'Jumbo', bornAt: Date.now(), habitat: 'main', sizeScale })
  initial.fishVitals[id] = { hunger: 0.25, growth: 1, mealsEaten: 9 }
}
useGameStore.setState(initial)
useUIStore.setState({ activeTank: 'main', welcomeBack: null, levelUp: null })
loadAlgae(0)
growAlgae(1800, 0.3)
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

const panel = document.createElement('div')
panel.style.cssText = 'position:fixed;left:12px;bottom:90px;z-index:1000;background:#fff;color:#123;padding:8px;font:12px sans-serif;max-width:250px;pointer-events:auto'
const monitor = document.createElement('output')
monitor.textContent = 'Frame monitor ready'
panel.append(monitor)
const button = document.createElement('button')
button.textContent = 'Check all backgrounds'
panel.append(document.createElement('br'), button)
document.body.append(panel)
const clearButton = document.createElement('button')
clearButton.textContent = 'Clear QA algae'
clearButton.onclick = () => {
  scrubAlgae(12, 2, 25, 1, 25)
  useUIStore.getState().setMode('view')
}
panel.append(document.createElement('br'), clearButton)
button.onclick = () => {
  button.disabled = true
  const backgrounds = [BACKGROUND_CATALOG[1], ...BACKGROUND_CATALOG.filter((bg) => bg.style !== 1)]
  const sample = document.createElement('canvas')
  sample.width = sample.height = 24
  const ctx = sample.getContext('2d', { willReadFrequently: true })!
  const results: string[] = []
  let index = 0
  let frames = 0
  let black = 0
  let started = performance.now()
  useGameStore.setState({ backgroundId: backgrounds[0].id })
  const step = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.tank-canvas canvas')
    const elapsed = performance.now() - started
    if (canvas && elapsed > 1500) {
      ctx.drawImage(canvas, 0, 0, 24, 24)
      const pixels = ctx.getImageData(0, 0, 24, 24).data
      let light = 0
      for (let i = 0; i < pixels.length; i += 4) light += pixels[i] + pixels[i + 1] + pixels[i + 2]
      if (light / (24 * 24 * 3) < 1) black++
      frames++
    }
    monitor.textContent = `${backgrounds[index].name}: ${frames} frames, ${black} black frames`
    if (elapsed > (index === 0 ? 45000 : 10000)) {
      results.push(`${backgrounds[index].name}: ${frames} frames, ${black} black`)
      console.info(results.at(-1))
      index++
      if (index === backgrounds.length) {
        monitor.textContent = results.join('; ')
        button.disabled = false
        useGameStore.setState({ backgroundId: 'coral-reef' })
        return
      }
      useGameStore.setState({ backgroundId: backgrounds[index].id })
      frames = black = 0
      started = performance.now()
    }
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
