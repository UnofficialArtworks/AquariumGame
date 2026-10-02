// Disposable browser QA for fish movement and feeding. State is in memory only.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { _roots } from '@react-three/fiber'
import App from '../src/App'
import { createInitialState } from '../src/state/migrations'
import { useGameStore } from '../src/state/useGameStore'
import { useUIStore } from '../src/state/useUIStore'
import { DECORATION_CATALOG } from '../src/scene/decorations/decorationDefinitions'
import { dropFood, foodItems } from '../src/sim/food'
import { fishAgents, simClock } from '../src/sim/world'
import { feederCall, gadgetPulses } from '../src/sim/gadgets'
import '../src/styles/global.css'

useGameStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
const params = new URLSearchParams(location.search)
const initial = createInitialState()
initial.aquariumName = 'Fish QA'
initial.currency = 100000
initial.xp = 100000
initial.murk = 0
initial.unlockedDecorationDefIds = DECORATION_CATALOG.map((def) => def.id)
initial.ownedFish = []
initial.fishVitals = {}
const roster: Array<[string, number]> = params.has('roster')
  ? params.get('roster')!.split(',').map((entry) => {
      const [defId, count] = entry.split(':')
      return [defId, Number(count) || 1]
    })
  : params.has('jellies')
  ? [['moon-jelly', 10]]
  : [
      ['moon-jelly', 10],
      ['goldfish', 2],
      ['neon-tetra', 5],
      ['clownfish', 1],
      ['angelfish', 1],
      ['betta', 1],
      ['cory-catfish', 2],
      ['seahorse', 1],
      ['axolotl', 1],
      ['discus', 1],
    ]
for (const [defId, count] of roster) {
  for (let i = 0; i < count; i++) {
    const id = crypto.randomUUID()
    initial.ownedFish.push({ id, defId, name: `${defId} ${i + 1}`, bornAt: Date.now(), habitat: 'main', sizeScale: 1 })
    initial.fishVitals[id] = { hunger: 0.42 + Math.random() * 0.1, growth: 1, mealsEaten: 9 }
  }
}
initial.placedDecorations = params.has('nofeeder')
  ? []
  : [{ id: 'qa-feeder', defId: 'auto-feeder', position: [-1.6, 0, 0.4], rotationY: 0 }]
if (params.has('perf')) {
  // A busy late-game tank: lots of decor, gadgets and a full roster.
  const decor: Array<[string, number, number]> = [
    ['shipwreck', -2.4, -1.0], ['classic-castle', 2.3, -1.0], ['volcano', 0.2, -1.2], ['coral-reef', -0.9, -0.6],
    ['brain-coral', 1.2, 0.2], ['tall-kelp', -3.2, -1.2], ['tall-kelp', 3.2, -1.3], ['sea-anemone', 0.9, 1.0],
    ['flower-plant', -0.4, 0.9], ['gem-rock', 2.9, 0.8], ['treasure-chest', -2.8, 1.0], ['grow-lamp', 1.8, -0.2],
    ['marimo-moss', -1.0, 1.2], ['bubble-filter', 3.3, -0.2], ['coin-fountain', -0.2, 0.0], ['air-stone', 2.2, 1.2],
  ]
  decor.forEach(([defId, x, z], i) => initial.placedDecorations.push({ id: `qa-${i}`, defId, position: [x, 0, z], rotationY: i * 0.7 }))
  const extra: Array<[string, number]> = [['rainbowfish', 3], ['koi', 1], ['reef-shark', 1]]
  for (const [defId, count] of extra) for (let i = 0; i < count; i++) {
    const id = crypto.randomUUID()
    initial.ownedFish.push({ id, defId, name: `${defId} ${i + 1}`, bornAt: Date.now(), habitat: 'main', sizeScale: 1 })
    initial.fishVitals[id] = { hunger: 0.2, growth: 1, mealsEaten: 9 }
  }
}
useGameStore.setState(initial)
useUIStore.setState({ activeTank: 'main', welcomeBack: null, levelUp: null })
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

// The QA browser pane may be hidden (rAF throttled to ~1fps). step() pins the
// clock to 60fps while it advances the scene by hand, then hands it back to
// real time so a visible page keeps running at true speed.
function step(seconds: number) {
  const canvas = document.querySelector('.tank-canvas canvas')
  const store = canvas ? _roots.get(canvas as HTMLCanvasElement)?.store : undefined
  if (!store) return false
  const clock = store.getState().clock
  const realGetDelta = clock.getDelta
  clock.getDelta = function () {
    this.elapsedTime += 1 / 60
    return 1 / 60
  }
  try {
    for (let i = 0; i < Math.round(seconds * 60); i++) store.getState().advance(performance.now())
  } finally {
    clock.getDelta = realGetDelta
    clock.oldTime = performance.now()
  }
  return true
}
/** Advance every other canvas (e.g. the shop-thumbnail renderer) by hand while the pane is hidden. */
function pump(frames = 60) {
  const main = document.querySelector('.tank-canvas canvas')
  for (const [canvas, root] of _roots) {
    if (canvas === main) continue
    for (let i = 0; i < frames; i++) root.store.getState().advance(performance.now())
  }
}
/** Frame cost breakdown: scene update vs render submission, draw calls, triangles, optional GPU time. */
async function perf(frames = 240) {
  const canvas = document.querySelector('.tank-canvas canvas') as HTMLCanvasElement | null
  const store = canvas ? _roots.get(canvas)?.store : undefined
  if (!store) return null
  step(0.05)
  const { gl } = store.getState()
  const info = gl.info
  info.autoReset = false
  const realRender = gl.render.bind(gl)
  let renderMs = 0
  let renderCalls = 0
  gl.render = (scene, camera) => {
    const t0 = performance.now()
    realRender(scene, camera)
    renderMs += performance.now() - t0
    renderCalls++
  }
  const ctx = gl.getContext() as WebGL2RenderingContext
  const timer = ctx.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
  const gpuQueries: WebGLQuery[] = []
  let calls = 0
  let triangles = 0
  const heap0 = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0
  const t0 = performance.now()
  for (let i = 0; i < frames; i++) {
    info.reset()
    let q: WebGLQuery | null = null
    if (timer && i % 20 === 0) {
      q = ctx.createQuery()
      if (q) ctx.beginQuery(timer.TIME_ELAPSED_EXT, q)
    }
    step(1 / 60)
    if (q) {
      ctx.endQuery(timer!.TIME_ELAPSED_EXT)
      gpuQueries.push(q)
    }
    calls += info.render.calls
    triangles += info.render.triangles
  }
  ctx.finish()
  const total = performance.now() - t0
  const heap1 = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0
  gl.render = realRender
  info.autoReset = true
  await new Promise((r) => setTimeout(r, 300))
  const gpu = gpuQueries.map((q) => (ctx.getQueryParameter(q, ctx.QUERY_RESULT_AVAILABLE) ? ctx.getQueryParameter(q, ctx.QUERY_RESULT) / 1e6 : NaN))
  return {
    frameMs: +(total / frames).toFixed(2),
    renderSubmitMs: +(renderMs / frames).toFixed(2),
    updateMs: +((total - renderMs) / frames).toFixed(2),
    rendersPerFrame: +(renderCalls / frames).toFixed(1),
    drawCalls: Math.round(calls / frames),
    triangles: Math.round(triangles / frames),
    programs: info.programs?.length,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    gpuMs: gpu.filter(Number.isFinite).map((v) => +v.toFixed(2)),
    heapGrowthKB: Math.round((heap1 - heap0) / 1024),
    dpr: gl.getPixelRatio(),
    size: [gl.domElement.width, gl.domElement.height],
  }
}

function follow(kind: string, index = 0) {
  const agent = [...fishAgents.values()].filter((a) => a.def.kind === kind || a.def.id === kind)[index]
  if (!agent) return
  useUIStore.getState().selectFish(agent.id)
  useUIStore.getState().setFollowFish(true)
  document.querySelectorAll<HTMLElement>('.hud-layer, .hud, header, nav, .fish-panel, .toast-stack').forEach((e) => (e.style.visibility = 'hidden'))
}

// Feeding stats for QA: how much food got eaten vs rotted.
const stats = { dropped: 0, eaten: 0, wasted: 0 }
;(window as unknown as Record<string, unknown>).fishQA = { stats, foodItems, dropFood, fishAgents, useGameStore, useUIStore, feederCall, gadgetPulses, simClock, step, follow, perf, pump, r3f: () => _roots.get(document.querySelector('.tank-canvas canvas') as HTMLCanvasElement)?.store.getState() }
const seen = new Set<number>()
setInterval(() => {
  for (const f of foodItems) if (!f.inedible && !seen.has(f.uid)) {
    seen.add(f.uid)
    stats.dropped++
  }
}, 50)
const unsub = useGameStore.subscribe((s, prev) => {
  if (s.waste.length > prev.waste.length) for (const w of s.waste.slice(prev.waste.length)) if (w.kind === 'food') stats.wasted++
})
void unsub
