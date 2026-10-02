// Every sound in the game is synthesized with the Web Audio API — no audio
// files to host or license. Browsers only allow audio after a user gesture,
// so nothing plays until unlockAudio() runs from the first click/tap.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let ambienceGain: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let enabled = true
let ambienceTimer: number | null = null

function getNoise(context: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer
  const length = context.sampleRate * 2
  noiseBuffer = context.createBuffer(1, length, context.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return noiseBuffer
}

function ready(): AudioContext | null {
  if (!ctx || !master || !enabled) return null
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }
  try {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = enabled ? 0.55 : 0
    master.connect(ctx.destination)
    startAmbience()
  } catch {
    ctx = null
  }
}

export function setSoundEnabled(on: boolean) {
  enabled = on
  if (master && ctx) master.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.05)
}

function tone(
  freq: number,
  duration: number,
  { type = 'sine', volume = 0.3, endFreq, delay = 0, attack = 0.005 }: { type?: OscillatorType; volume?: number; endFreq?: number; delay?: number; attack?: number } = {},
) {
  const c = ready()
  if (!c || !master) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(volume, t0 + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain).connect(master)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function noise(
  duration: number,
  { freq = 1000, q = 1, type = 'bandpass', volume = 0.2, endFreq, delay = 0 }: { freq?: number; q?: number; type?: BiquadFilterType; volume?: number; endFreq?: number; delay?: number } = {},
) {
  const c = ready()
  if (!c || !master) return
  const t0 = c.currentTime + delay
  const src = c.createBufferSource()
  src.buffer = getNoise(c)
  const filter = c.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(freq, t0)
  if (endFreq) filter.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration)
  filter.Q.value = q
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  src.connect(filter).connect(gain).connect(master)
  src.start(t0, Math.random() * 1.5)
  src.stop(t0 + duration + 0.02)
}

let lastScrub = 0
let lastPop = 0

export const sfx = {
  pop(pitch = 1) {
    const now = performance.now()
    if (now - lastPop < 30) return
    lastPop = now
    tone(700 * pitch, 0.09, { endFreq: 260 * pitch, volume: 0.22 })
  },
  coin(big = false) {
    tone(988, 0.08, { type: 'square', volume: 0.07 })
    tone(1319, big ? 0.35 : 0.22, { type: 'square', volume: 0.07, delay: 0.07 })
    if (big) tone(1760, 0.3, { type: 'triangle', volume: 0.12, delay: 0.14 })
  },
  chomp() {
    tone(260 + Math.random() * 60, 0.08, { endFreq: 110, volume: 0.25 })
    noise(0.05, { freq: 900, volume: 0.06 })
  },
  splash() {
    noise(0.25, { freq: 1600, endFreq: 500, q: 0.8, volume: 0.12 })
    tone(500, 0.12, { endFreq: 900, volume: 0.05, delay: 0.02 })
  },
  tap() {
    tone(2300, 0.18, { volume: 0.12 })
    tone(3450, 0.12, { volume: 0.05 })
  },
  scrub() {
    const now = performance.now()
    if (now - lastScrub < 85) return
    lastScrub = now
    noise(0.09, { freq: 2200 + Math.random() * 900, q: 4, volume: 0.07 })
  },
  vacuum() {
    noise(0.18, { freq: 300, endFreq: 900, q: 1.5, volume: 0.12, type: 'lowpass' })
  },
  puff() {
    tone(180, 0.35, { endFreq: 620, volume: 0.2, type: 'triangle' })
  },
  buy() {
    tone(784, 0.12, { type: 'triangle', volume: 0.18 })
    tone(1175, 0.25, { type: 'triangle', volume: 0.18, delay: 0.09 })
  },
  click() {
    tone(1200, 0.04, { volume: 0.06 })
  },
  denied() {
    tone(220, 0.15, { type: 'square', volume: 0.05 })
    tone(180, 0.2, { type: 'square', volume: 0.05, delay: 0.1 })
  },
  levelUp() {
    const notes = [523, 659, 784, 1047, 1319]
    notes.forEach((f, i) => tone(f, 0.35, { type: 'triangle', volume: 0.16, delay: i * 0.09 }))
    noise(0.6, { freq: 6000, q: 0.5, volume: 0.03, delay: 0.3, type: 'highpass' })
  },
  water() {
    noise(2.4, { freq: 400, endFreq: 1800, q: 0.7, volume: 0.14, type: 'lowpass' })
  },
  /** The auto-feeder's dinner bell. */
  chime() {
    tone(1568, 0.5, { type: 'triangle', volume: 0.09 })
    tone(1175, 0.7, { type: 'triangle', volume: 0.09, delay: 0.18 })
    tone(2350, 0.4, { type: 'sine', volume: 0.03, delay: 0.18 })
  },
  magic() {
    ;[1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.25, { type: 'sine', volume: 0.08, delay: i * 0.05 }))
  },
}

/** Soft filtered-noise hum plus the occasional bubbler blip. */
function startAmbience() {
  const c = ctx
  if (!c || !master) return
  const src = c.createBufferSource()
  src.buffer = getNoise(c)
  src.loop = true
  const low = c.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 380
  ambienceGain = c.createGain()
  ambienceGain.gain.value = 0.05
  src.connect(low).connect(ambienceGain).connect(master)
  src.start()

  const blip = () => {
    if (enabled && Math.random() < 0.8) tone(500 + Math.random() * 700, 0.07, { endFreq: 240, volume: 0.035 })
    ambienceTimer = window.setTimeout(blip, 350 + Math.random() * 1600)
  }
  if (ambienceTimer === null) blip()
}
