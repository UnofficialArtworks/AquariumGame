// A soft, never-ending soundtrack, synthesized like the sound effects so there
// are no audio files to host or license. Each track is a slow pad and a little
// bass over a four-chord loop, with a music-box melody wandering over the
// track's pentatonic scale (every note fits every chord). Day, night and the
// nursery each have a few tracks that take turns, crossfading every few minutes.
import { onAudioUnlocked } from './sfx'

export type MusicMood = 'day' | 'night' | 'nursery'

interface Chord {
  /** Bass root (MIDI). */
  bass: number
  /** Pad voicing (MIDI). */
  pad: number[]
}

interface Track {
  name: string
  mood: MusicMood
  /** Seconds per chord. */
  chordSeconds: number
  /** Seconds per melody step. */
  step: number
  /** Chance a step plays a note. */
  density: number
  /** Melody notes (MIDI), low to high. */
  scale: number[]
  chords: Chord[]
  wave: OscillatorType
}

/** Every MIDI note from low to high in the major pentatonic of `root` (0 = C … 11 = B). */
function penta(root: number, low: number, high: number): number[] {
  const steps = [0, 2, 4, 7, 9]
  const notes: number[] = []
  for (let n = low; n <= high; n++) if (steps.includes((((n - root) % 12) + 12) % 12)) notes.push(n)
  return notes
}

const C = 0
const D = 2
const F = 5
const G = 7

const SUNLIT_CHORDS: Chord[] = [
  { bass: 41, pad: [57, 60, 64, 67] }, // Fmaj9
  { bass: 40, pad: [55, 59, 62, 64] }, // C/E
  { bass: 45, pad: [60, 64, 67, 71] }, // Am9
  { bass: 43, pad: [62, 67, 69] }, // Gsus2
]

const TRACKS: Track[] = [
  { name: 'Sunlit Shallows', mood: 'day', chordSeconds: 9.6, step: 0.3, density: 0.26, scale: penta(C, 60, 84), chords: SUNLIT_CHORDS, wave: 'sine' },
  {
    name: 'Coral Garden',
    mood: 'day',
    chordSeconds: 8.4,
    step: 0.26,
    density: 0.3,
    scale: penta(D, 62, 86),
    chords: [
      { bass: 38, pad: [54, 57, 61, 64] }, // Dmaj9
      { bass: 47, pad: [62, 66, 69, 73] }, // Bm9
      { bass: 40, pad: [55, 59, 62, 66] }, // Em9
      { bass: 43, pad: [59, 62, 66, 69] }, // Gmaj9
    ],
    wave: 'triangle',
  },
  {
    name: 'Lazy Lagoon',
    mood: 'day',
    chordSeconds: 11.2,
    step: 0.35,
    density: 0.2,
    scale: penta(G, 64, 88),
    chords: [
      { bass: 36, pad: [52, 55, 59, 62] }, // Cmaj9
      { bass: 38, pad: [57, 62, 64, 69] }, // Dsus2
      { bass: 40, pad: [55, 59, 62, 66] }, // Em9
      { bass: 43, pad: [59, 62, 66, 69] }, // Gmaj9
    ],
    wave: 'sine',
  },
  {
    name: 'Moon Pool',
    mood: 'night',
    chordSeconds: 12.8,
    step: 0.4,
    density: 0.14,
    scale: penta(C, 57, 81),
    chords: [
      { bass: 45, pad: [60, 64, 67, 71] }, // Am9
      { bass: 41, pad: [57, 60, 64] }, // Fmaj7
      { bass: 38, pad: [53, 57, 60, 64] }, // Dm9
      { bass: 40, pad: [55, 59, 62] }, // Em7
    ],
    wave: 'sine',
  },
  {
    name: 'Deep Glow',
    mood: 'night',
    chordSeconds: 14,
    step: 0.45,
    density: 0.12,
    scale: penta(G, 52, 76),
    chords: [
      { bass: 40, pad: [55, 59, 62, 66] }, // Em9
      { bass: 36, pad: [52, 55, 59, 64] }, // Cmaj7
      { bass: 45, pad: [55, 60, 64, 71] }, // Am9
      { bass: 38, pad: [57, 62, 64] }, // Dsus2
    ],
    wave: 'sine',
  },
  { name: 'Bubble Lullaby', mood: 'nursery', chordSeconds: 8, step: 0.25, density: 0.34, scale: penta(C, 72, 96), chords: SUNLIT_CHORDS, wave: 'triangle' },
  {
    name: 'Little Fins',
    mood: 'nursery',
    chordSeconds: 9,
    step: 0.28,
    density: 0.32,
    scale: penta(F, 77, 98),
    chords: [
      { bass: 41, pad: [57, 60, 64, 67] }, // Fmaj9
      { bass: 38, pad: [53, 57, 60, 64] }, // Dm9
      { bass: 46, pad: [57, 60, 62, 65] }, // Bbmaj9
      { bass: 48, pad: [55, 60, 62, 67] }, // Csus2
    ],
    wave: 'triangle',
  },
]

/** Times through a track's chord loop before the next track takes over (about three minutes). */
const LOOPS_PER_TRACK = 5
const VOLUME = 0.22
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
const tracksFor = (mood: MusicMood) => TRACKS.filter((t) => t.mood === mood)

let ctx: AudioContext | null = null
let out: GainNode | null = null
let dry: GainNode | null = null
let wet: GainNode | null = null
/** The current track's voices go through this, so a track change can fade the old one out. */
let bus: GainNode | null = null
let enabled = true
let moodOf: () => MusicMood = () => 'day'
let timer: number | null = null
let nextChord = 0
let nextStep = 0
let chordIndex = 0
let noteIndex = 4
let rest = 0
let track: Track = TRACKS[0]
const turn: Record<MusicMood, number> = { day: 0, night: 0, nursery: 0 }
let skipRequested = false
const listeners = new Set<() => void>()

/** Turn the music on or off (fades). */
export function setMusicEnabled(on: boolean) {
  enabled = on
  fadeTo(on && !document.hidden ? VOLUME : 0)
  if (on) start()
}

/** Tell the music which mood to play; read whenever a new chord starts. */
export function setMusicMood(read: () => MusicMood) {
  moodOf = read
}

/** The name of the track playing now. */
export function currentTrackName(): string {
  return track.name
}

/** Move on to the next track for the current mood (crossfades within a moment). */
export function nextTrack() {
  skipRequested = true
  if (ctx) nextChord = Math.min(nextChord, ctx.currentTime + 0.4)
}

/** Hear about track changes (for the "now playing" line). */
export function subscribeMusic(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

onAudioUnlocked((context) => {
  ctx = context
  out = context.createGain()
  out.gain.value = 0
  out.connect(context.destination)
  dry = context.createGain()
  dry.gain.value = 0.6
  dry.connect(out)
  const reverb = context.createConvolver()
  reverb.buffer = impulse(context, 3.2)
  const hall = context.createGain()
  hall.gain.value = 0.5
  reverb.connect(hall).connect(out)
  // Every voice also feeds the hall through this send.
  wet = context.createGain()
  wet.connect(reverb)
  document.addEventListener('visibilitychange', () => fadeTo(enabled && !document.hidden ? VOLUME : 0))
  if (enabled) {
    fadeTo(VOLUME, 4)
    start()
  }
})

function fadeTo(volume: number, seconds = 0.8) {
  if (!ctx || !out) return
  out.gain.cancelScheduledValues(ctx.currentTime)
  out.gain.setTargetAtTime(volume, ctx.currentTime, seconds / 3)
}

function start() {
  if (!ctx || timer !== null) return
  nextChord = nextStep = ctx.currentTime + 0.3
  timer = window.setInterval(schedule, 120)
}

/** Fresh bus for a new track; the old one fades away under it. */
function changeTrack(next: Track, at: number) {
  const c = ctx
  if (!c || !dry || !wet) return
  if (bus) {
    const old = bus
    old.gain.setTargetAtTime(0.0001, at, 1.2)
    window.setTimeout(() => old.disconnect(), (at - c.currentTime + 8) * 1000)
  }
  bus = c.createGain()
  bus.connect(dry)
  bus.connect(wet)
  track = next
  chordIndex = 0
  noteIndex = Math.floor(next.scale.length / 2)
  rest = 2
  listeners.forEach((listener) => listener())
}

/** Pick the track for the next chord: stay put unless the mood changed, the loops ran out, or the player skipped. */
function trackForNextChord(at: number) {
  const mood = moodOf()
  const options = tracksFor(mood)
  const loopDone = chordIndex > 0 && chordIndex % track.chords.length === 0
  const timeUp = loopDone && chordIndex >= track.chords.length * LOOPS_PER_TRACK
  if (!bus) changeTrack(options[turn[mood] % options.length], at)
  else if (track.mood !== mood) changeTrack(options[turn[mood] % options.length], at)
  else if (timeUp || skipRequested) {
    turn[mood]++
    changeTrack(options[turn[mood] % options.length], at)
  }
  skipRequested = false
}

/** Queue everything due in the next half second. */
function schedule() {
  const c = ctx
  if (!c) return
  if (!enabled || document.hidden) {
    // Keep the clock moving so nothing piles up while paused.
    nextChord = nextStep = Math.max(nextChord, c.currentTime + 0.3)
    return
  }
  const horizon = c.currentTime + 0.5
  while (nextChord < horizon) {
    trackForNextChord(nextChord)
    playChord(track.chords[chordIndex % track.chords.length], nextChord, track.chordSeconds)
    chordIndex++
    nextChord += track.chordSeconds
  }
  while (nextStep < horizon) {
    playStep(nextStep)
    nextStep += track.step
  }
}

function playChord(chord: Chord, t0: number, seconds: number) {
  const end = t0 + seconds
  for (const note of chord.pad) {
    for (const detune of [-5, 5]) {
      voice(midiHz(note), t0, end + 2.5, { wave: detune < 0 ? 'sine' : 'triangle', volume: 0.012, attack: 2.4, release: 2.5, detune, cutoff: 900 })
    }
  }
  voice(midiHz(chord.bass), t0, t0 + seconds * 0.9, { wave: 'sine', volume: 0.05, attack: 0.08, release: 1.6, cutoff: 400 })
}

function playStep(t: number) {
  // Phrases: a few notes, then a breath.
  if (rest > 0) {
    rest--
    return
  }
  if (Math.random() > track.density) return
  const scale = track.scale
  const leap = [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]
  noteIndex = Math.max(0, Math.min(scale.length - 1, noteIndex + leap))
  // Drift back toward the middle so the tune doesn't wander off the ends.
  if (noteIndex === 0 || noteIndex === scale.length - 1) noteIndex = Math.floor(scale.length / 2)
  const hz = midiHz(scale[noteIndex])
  voice(hz, t, t + 1.8, { wave: track.wave, volume: track.wave === 'triangle' ? 0.04 : 0.05, attack: 0.012, release: 1.7, cutoff: 3200 })
  voice(hz * 2, t, t + 0.9, { wave: 'sine', volume: 0.012, attack: 0.01, release: 0.8, cutoff: 5000 })
  if (Math.random() < 0.12) rest = 3 + Math.floor(Math.random() * 5)
}

function voice(hz: number, t0: number, t1: number, o: { wave: OscillatorType; volume: number; attack: number; release: number; cutoff: number; detune?: number }) {
  const c = ctx
  if (!c || !bus) return
  const osc = c.createOscillator()
  osc.type = o.wave
  osc.frequency.value = hz
  if (o.detune) osc.detune.value = o.detune
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = o.cutoff
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(o.volume, t0 + o.attack)
  const releaseAt = Math.max(t0 + o.attack, t1 - o.release)
  gain.gain.setValueAtTime(o.volume, releaseAt)
  gain.gain.exponentialRampToValueAtTime(0.0001, t1)
  osc.connect(filter).connect(gain).connect(bus)
  osc.start(t0)
  osc.stop(t1 + 0.05)
}

/** A soft hall: stereo noise fading out. */
function impulse(c: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(c.sampleRate * seconds)
  const buffer = c.createBuffer(2, length, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6)
  }
  return buffer
}
