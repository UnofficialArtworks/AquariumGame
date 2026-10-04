// The fishing scene: a garden pond seen from the bank, painted on a 2D
// canvas. Fishing.tsx runs the game and tells this which moment it's in;
// everything here is only for show.

export type PondMoment = 'ready' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'landing' | 'lost' | 'caught'

/** How long a cast takes to land, in ms (Fishing.tsx plays the splash then). */
export const CAST_MS = 750
/** How long a catch takes to leap out of the water, in ms. */
export const LEAP_MS = 1000

export interface CatchArt {
  /** A thumbnail of the fish, when one is ready. */
  image?: string
  /** Treasure and treats are drawn as their emoji. */
  emoji?: string
  color: string
}

interface Point {
  x: number
  y: number
}

interface Drop extends Point {
  vx: number
  vy: number
  born: number
  life: number
  r: number
}

interface Ring extends Point {
  born: number
  size: number
  life: number
  alpha: number
}

interface Palette {
  skyTop: string
  skyLow: string
  hillFar: string
  hillNear: string
  leaf: [string, string, string, string]
  trunk: string
  waterTop: string
  waterMid: string
  waterLow: string
  bank: [string, string]
  edge: string
  reed: string
  pad: [string, string]
  petal: string
  rod: string
  line: string
  glint: string
}

const DAY: Palette = {
  skyTop: '#6cc0ef',
  skyLow: '#d6f2ff',
  hillFar: '#93c9a8',
  hillNear: '#62a77a',
  leaf: ['#3f8a4c', '#4f9d57', '#2f7240', '#67b56a'],
  trunk: '#6b4a33',
  waterTop: '#a3dde0',
  waterMid: '#4aaab6',
  waterLow: '#1d6f86',
  bank: ['#72c05e', '#3c8a43'],
  edge: '#5a6b3a',
  reed: '#3f7f3a',
  pad: ['#4c9f4f', '#2f7a3c'],
  petal: '#ff9cc6',
  rod: '#5b3b27',
  line: 'rgba(255, 255, 255, 0.85)',
  glint: '255, 252, 225',
}

const NIGHT: Palette = {
  skyTop: '#050f26',
  skyLow: '#1d3463',
  hillFar: '#1d3551',
  hillNear: '#152a40',
  leaf: ['#16303a', '#1b3a42', '#132a33', '#21464c'],
  trunk: '#0f1d27',
  waterTop: '#2d5687',
  waterMid: '#173d66',
  waterLow: '#0a2340',
  bank: ['#24513f', '#13342a'],
  edge: '#1c2c24',
  reed: '#1a3d31',
  pad: ['#1f4d3f', '#143a30'],
  petal: '#d79bc0',
  rod: '#3d2b20',
  line: 'rgba(215, 228, 255, 0.6)',
  glint: '225, 236, 255',
}

/** Lily pads: x, y (fractions of the view), radius, and whether one is in flower. */
const PADS: Array<[number, number, number, boolean]> = [
  [0.09, 0.5, 15, false],
  [0.17, 0.6, 11, true],
  [0.07, 0.71, 20, false],
  [0.66, 0.43, 9, false],
  [0.9, 0.46, 12, true],
  [0.95, 0.56, 9, false],
]

const TAU = Math.PI * 2
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeOut = (t: number) => 1 - (1 - t) ** 3
const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2
/** 0 → 1 → 0 as u goes from 0 to 1. */
const bump = (u: number) => (u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0)

/** A little repeatable random, so the trees and stars stay put between frames. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function makeCanvas(w: number, h: number, dpr: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * dpr))
  canvas.height = Math.max(1, Math.round(h * dpr))
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { canvas, ctx }
}

export class PondScene {
  night = false
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly observer: ResizeObserver
  /** Gentler sway for players who prefer less motion. */
  private readonly sway: number
  private w = 1
  private h = 1
  private dpr = 1
  private backdrop: HTMLCanvasElement | null = null
  private backdropKey = ''
  private frame = 0
  private last = 0
  private moment: PondMoment = 'ready'
  private momentAt = 0
  /** Where this cast landed, as fractions of the view. */
  private spot: Point = { x: 0.42, y: 0.62 }
  private pull = 0
  private shownPull = 0
  private tension = 0
  private nibbleAt = -1e9
  private lastRingAt = 0
  private drops: Drop[] = []
  private rings: Ring[] = []
  private shadow = { x: 0, y: 0, heading: 0, alpha: 0, vx: 0, vy: 0 }
  private art: { image: HTMLImageElement | null; emoji?: string; color: string } | null = null
  private bobber: Point = { x: 0, y: 0 }
  private castFrom: Point = { x: 0, y: 0 }
  private leapFrom: Point = { x: 0, y: 0 }
  private fly = { x: 0.5, y: 0.3, tx: 0.5, ty: 0.3, nextAt: 0, heading: 0 }
  private readonly dashes: Array<{ x: number; d: number; len: number; phase: number; speed: number }>
  private readonly glints: Array<{ x: number; d: number; len: number; phase: number }>
  private readonly blades: Array<{ x: number; height: number; lean: number; width: number; cattail: boolean; shade: number }>
  private readonly daisies: Array<{ x: number; y: number; color: string }>
  private readonly fireflies: Array<{ x: number; y: number; phase: number; speed: number }>

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.sway = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.35 : 1
    const r = seeded(7)
    this.dashes = Array.from({ length: 58 }, () => ({ x: r(), d: r(), len: 6 + r() * 16, phase: r() * TAU, speed: 0.4 + r() * 0.8 }))
    this.glints = Array.from({ length: 24 }, () => ({ x: r(), d: r(), len: 5 + r() * 12, phase: r() * TAU }))
    this.blades = Array.from({ length: 14 }, (_, i) => ({
      x: 0.005 + r() * 0.2,
      height: 0.24 + r() * 0.22,
      lean: (r() - 0.35) * 0.08,
      width: 2.2 + r() * 2.2,
      cattail: i % 4 === 1,
      shade: r(),
    }))
    this.daisies = Array.from({ length: 16 }, () => ({ x: 0.3 + r() * 0.62, y: 0.955 + r() * 0.04, color: r() < 0.6 ? '#ffffff' : '#ffd84d' }))
    this.fireflies = Array.from({ length: 10 }, () => ({ x: r(), y: 0.4 + r() * 0.5, phase: r() * TAU, speed: 0.6 + r() * 0.8 }))
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)
    this.resize()
    const loop = (now: number) => {
      this.frame = requestAnimationFrame(loop)
      // A frame's timestamp can be a touch earlier than performance.now(), which effects are timed by.
      this.draw(Math.max(now, performance.now()))
    }
    this.frame = requestAnimationFrame(loop)
  }

  destroy() {
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
  }

  /** Move on to the next moment of the game. */
  set(moment: PondMoment) {
    const now = performance.now()
    const spot = this.spotPx()
    if (moment === 'ready') {
      this.art = null
      this.pull = this.shownPull = 0
    }
    if (moment === 'casting') {
      this.spot = { x: 0.3 + Math.random() * 0.26, y: 0.56 + Math.random() * 0.12 }
      this.pull = this.shownPull = 0
      this.art = null
      this.castFrom = { ...this.bobber }
    }
    if (moment === 'waiting') {
      const s = this.spotPx()
      this.splash(s.x, s.y, 8, 120)
      this.ring(s.x, s.y, 26, 0.8)
      Object.assign(this.shadow, { x: s.x - this.w * 0.3, y: s.y + 24, alpha: 0 })
    }
    if (moment === 'bite') {
      this.splash(spot.x, spot.y, 14, 190)
      this.ring(spot.x, spot.y, 38, 0.9)
    }
    if (moment === 'lost') {
      const bank = this.bankPx()
      const away = Math.atan2(this.shadow.y - bank.y - this.h * 0.3, this.shadow.x - bank.x)
      this.shadow.vx = Math.cos(away) * 260
      this.shadow.vy = Math.sin(away) * 90
      this.splash(this.bobber.x, this.bobber.y, 10, 150)
      this.ring(this.bobber.x, this.bobber.y, 30, 0.8)
    }
    if (moment === 'landing') {
      this.leapFrom = { ...this.bobber }
      this.splash(this.bobber.x, this.bobber.y, 26, 260)
      this.ring(this.bobber.x, this.bobber.y, 48, 1)
    }
    this.moment = moment
    this.momentAt = now
  }

  /** Something tests the bait: the bobber dips. */
  nibble() {
    this.nibbleAt = performance.now()
    const s = this.spotPx()
    this.ring(s.x, s.y, 16, 0.7)
  }

  /** How far the catch has been reeled in: 0 where it bit, 1 at the bank. */
  reelTo(progress: number) {
    this.pull = clamp01(progress)
    this.tension = Math.max(this.tension, 0.45)
    this.splash(this.bobber.x, this.bobber.y, 8, 140)
  }

  /** A missed tap: the line pulls tight and the fish tugs away. */
  strain() {
    this.tension = 1
    this.splash(this.bobber.x, this.bobber.y, 10, 170)
    this.ring(this.bobber.x, this.bobber.y, 30, 0.8)
  }

  /** What's on the line, for when it leaps out. */
  showCatch(art: CatchArt) {
    let image: HTMLImageElement | null = null
    if (art.image) {
      image = new Image()
      image.src = art.image
    }
    this.art = { image, emoji: art.emoji, color: art.color }
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = Math.max(1, rect.width)
    this.h = Math.max(1, rect.height)
    this.canvas.width = Math.round(this.w * this.dpr)
    this.canvas.height = Math.round(this.h * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  private get palette() {
    return this.night ? NIGHT : DAY
  }

  private get horizon() {
    return this.h * 0.34
  }

  /** 0 at the far bank, 1 at our feet. */
  private depth(y: number) {
    return clamp01((y - this.horizon) / (this.h - this.horizon))
  }

  private spotPx(): Point {
    return { x: this.spot.x * this.w, y: this.spot.y * this.h }
  }

  /** Where a catch is reeled in to: near the bank, but clear of the reel bar. */
  private bankPx(): Point {
    return { x: this.w * 0.6, y: this.h * 0.71 }
  }

  private restTip(): Point {
    return { x: this.w * 0.83, y: this.h * 0.14 }
  }

  private splash(x: number, y: number, count: number, power: number) {
    const now = performance.now()
    for (let i = 0; i < count; i++) {
      this.drops.push({
        x: x + (Math.random() - 0.5) * 6,
        y,
        vx: (Math.random() - 0.5) * power * 1.1,
        vy: -(0.45 + Math.random() * 0.75) * power,
        born: now,
        life: 450 + Math.random() * 400,
        r: 0.9 + Math.random() * 1.9,
      })
    }
  }

  private ring(x: number, y: number, size: number, alpha: number) {
    this.rings.push({ x, y, born: performance.now(), size: size * (0.55 + this.depth(y) * 0.7), life: 900, alpha })
  }

  // --- the frame --------------------------------------------------------------

  private draw(now: number) {
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000)
    this.last = now
    const t = now / 1000
    const { ctx, w, h } = this
    this.ensureBackdrop()
    ctx.clearRect(0, 0, w, h)
    if (this.backdrop) ctx.drawImage(this.backdrop, 0, 0, w, h)

    const bob = this.updateBobber(now, dt)
    this.updateShadow(now, dt)
    const tip = this.rodTip(now, t)
    this.autoRipples(now, bob)

    this.drawSkyLife(t)
    this.drawShimmer(t)
    this.drawPads(t)
    this.drawShadow()
    this.drawRings(now)
    if (bob.visible) this.drawBobber(bob)
    this.drawBank(t)
    this.drawLine(tip, bob, t)
    this.drawRod(tip)
    this.drawDrops(now, dt)
    this.drawCatch(now, t, dt)
    this.drawCritters(now, t, dt)
    if (this.moment === 'bite') this.drawAlert(now, t, bob)
  }

  private updateBobber(now: number, dt: number) {
    const t = now / 1000
    const spot = this.spotPx()
    const bank = this.bankPx()
    const since = now - this.momentAt
    this.shownPull += (this.pull - this.shownPull) * Math.min(1, dt * 5)
    this.tension = Math.max(0, this.tension - dt * 2.2)
    let x = spot.x
    let y = spot.y
    let sink = 0
    let inWater = true
    let visible = true
    const reeled = () => ({ x: lerp(spot.x, bank.x, this.shownPull), y: lerp(spot.y, bank.y, this.shownPull) })
    switch (this.moment) {
      case 'ready': {
        const tip = this.restTip()
        x = tip.x + Math.sin(t * 1.6) * 5 * this.sway
        y = tip.y + this.h * 0.2
        inWater = false
        break
      }
      case 'casting': {
        const k = clamp01(since / CAST_MS)
        x = lerp(this.castFrom.x, spot.x, k)
        y = lerp(this.castFrom.y, spot.y, k) - Math.sin(Math.PI * k) * this.h * 0.3
        inWater = k >= 1
        break
      }
      case 'waiting':
        y += Math.sin(t * 2.1) * 1.4 * this.sway
        sink = bump((now - this.nibbleAt) / 260) * 5
        break
      case 'bite':
        x += Math.sin(t * 23) * 2
        sink = 7 + Math.sin(t * 31) * 2.5
        break
      case 'reeling': {
        const at = reeled()
        const amp = 5 * (1 - this.shownPull * 0.4)
        x = at.x + Math.sin(t * 9.3) * amp + this.tension * Math.sin(t * 40) * 4
        y = at.y + Math.sin(t * 7.1) * amp * 0.4 - this.tension * 6
        sink = 6 + Math.sin(t * 13) * 2
        break
      }
      case 'lost': {
        const at = reeled()
        x = at.x
        y = at.y + Math.sin(t * 2.1) * 1.4
        break
      }
      case 'landing':
      case 'caught': {
        const c = this.catchPos(now, t)
        x = c.x
        y = c.y
        inWater = false
        visible = false
        break
      }
    }
    this.bobber = { x, y }
    return { x, y, sink, inWater, visible }
  }

  private updateShadow(now: number, dt: number) {
    const s = this.shadow
    const t = now / 1000
    let want = 0
    let tx = s.x
    let ty = s.y
    if (this.moment === 'waiting') {
      const spot = this.spotPx()
      const k = clamp01((now - this.momentAt) / 4000)
      const a = t * 0.8
      const r = lerp(80, 20, k) * (0.6 + this.depth(spot.y) * 0.6)
      tx = spot.x + Math.cos(a) * r * 1.5
      ty = spot.y + 12 + Math.sin(a) * r * 0.45
      want = 0.3
    } else if (this.moment === 'bite' || this.moment === 'reeling') {
      tx = this.bobber.x + Math.sin(t * 6) * 6
      ty = this.bobber.y + 10
      want = 0.42
    }
    if (this.moment === 'lost') {
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.heading = Math.atan2(s.vy, s.vx)
    } else {
      const dx = tx - s.x
      const dy = ty - s.y
      s.x += dx * Math.min(1, dt * 3)
      s.y += dy * Math.min(1, dt * 3)
      if (Math.hypot(dx, dy) > 1) s.heading = Math.atan2(dy, dx)
    }
    s.alpha += (want - s.alpha) * Math.min(1, dt * (this.moment === 'lost' ? 4 : 1.6))
  }

  private rodTip(now: number, t: number): Point {
    const rest = this.restTip()
    const since = now - this.momentAt
    switch (this.moment) {
      case 'casting': {
        const u = clamp01((since / CAST_MS) * 1.5)
        return { x: rest.x + Math.sin(u * TAU) * 12, y: rest.y - Math.sin(u * Math.PI) * 10 }
      }
      case 'bite':
        return { x: rest.x - 4 + Math.sin(t * 25) * 2, y: rest.y + 8 }
      case 'reeling': {
        const pull = 10 + this.tension * 14
        const dx = this.bobber.x - rest.x
        const dy = this.bobber.y - rest.y
        const len = Math.hypot(dx, dy) || 1
        const shake = Math.sin(t * 40) * this.tension * 3
        return { x: rest.x + (dx / len) * pull + shake, y: rest.y + (dy / len) * pull }
      }
      case 'landing':
        return { x: rest.x, y: rest.y - bump(since / LEAP_MS) * 18 }
      default:
        return rest
    }
  }

  private autoRipples(now: number, bob: { x: number; y: number }) {
    const every = this.moment === 'waiting' ? 1800 : this.moment === 'bite' ? 260 : this.moment === 'reeling' ? 330 : 0
    if (!every || now - this.lastRingAt < every) return
    this.lastRingAt = now
    this.ring(bob.x, bob.y, this.moment === 'waiting' ? 16 : 24, this.moment === 'waiting' ? 0.5 : 0.75)
    if (this.moment === 'reeling' && Math.random() < 0.6) this.splash(bob.x, bob.y, 4, 110)
  }

  // --- the painting -----------------------------------------------------------

  private ensureBackdrop() {
    const key = `${this.w}x${this.h}x${this.dpr}x${this.night}`
    if (this.backdrop && this.backdropKey === key) return
    this.backdropKey = key
    const { w, h, dpr } = this
    const c = this.palette
    const hy = this.horizon
    const { canvas, ctx: g } = makeCanvas(w, h, dpr)
    const r = seeded(11)

    // Sky, with the sun or the moon and stars.
    const sky = g.createLinearGradient(0, 0, 0, hy)
    sky.addColorStop(0, c.skyTop)
    sky.addColorStop(1, c.skyLow)
    g.fillStyle = sky
    g.fillRect(0, 0, w, hy + 2)
    const light = this.lightPx()
    if (this.night) {
      for (let i = 0; i < 46; i++) {
        g.fillStyle = `rgba(255, 255, 255, ${0.35 + r() * 0.6})`
        g.beginPath()
        g.arc(r() * w, r() * hy * 0.92, 0.5 + r() * 1, 0, TAU)
        g.fill()
      }
      const glow = g.createRadialGradient(light.x, light.y, 0, light.x, light.y, h * 0.3)
      glow.addColorStop(0, 'rgba(200, 215, 255, 0.4)')
      glow.addColorStop(1, 'rgba(200, 215, 255, 0)')
      g.fillStyle = glow
      g.fillRect(0, 0, w, hy)
      g.fillStyle = '#f4f1df'
      g.beginPath()
      g.arc(light.x, light.y, 11, 0, TAU)
      g.fill()
      g.fillStyle = 'rgba(180, 180, 165, 0.35)'
      for (const [dx, dy, cr] of [[-3, -2, 2.6], [3, 3, 1.8], [4, -4, 1.2]]) {
        g.beginPath()
        g.arc(light.x + dx, light.y + dy, cr, 0, TAU)
        g.fill()
      }
    } else {
      const glow = g.createRadialGradient(light.x, light.y, 0, light.x, light.y, h * 0.42)
      glow.addColorStop(0, 'rgba(255, 251, 220, 0.95)')
      glow.addColorStop(0.25, 'rgba(255, 248, 210, 0.45)')
      glow.addColorStop(1, 'rgba(255, 248, 210, 0)')
      g.fillStyle = glow
      g.fillRect(0, 0, w, hy)
      g.fillStyle = 'rgba(255, 254, 240, 0.95)'
      g.beginPath()
      g.arc(light.x, light.y, 12, 0, TAU)
      g.fill()
    }

    // The far bank lives on its own layer so it can be mirrored in the water.
    const { canvas: farCanvas, ctx: f } = makeCanvas(w, h, dpr)
    const hills = (color: string, base: number, waves: Array<[number, number, number]>) => {
      f.fillStyle = color
      f.beginPath()
      f.moveTo(0, hy + 1)
      for (let x = 0; x <= w; x += 4) {
        let y = base
        for (const [amp, freq, phase] of waves) y += amp * Math.sin((x / w) * freq + phase)
        f.lineTo(x, hy - h * y)
      }
      f.lineTo(w, hy + 1)
      f.closePath()
      f.fill()
    }
    hills(c.hillFar, 0.075, [[0.035, 5.2, 1], [0.018, 13, 2]])
    hills(c.hillNear, 0.032, [[0.022, 7.3, 4], [0.01, 17, 0.5]])
    const treeBase = hy - h * 0.012
    for (let i = 0; i < 11; i++) {
      const x = (i + 0.2 + r() * 0.6) * (w / 11)
      const th = h * (0.08 + r() * 0.1)
      const kind = r()
      f.fillStyle = c.trunk
      f.fillRect(x - 1.5, treeBase - th * 0.42, 3, th * 0.42)
      if (kind < 0.18) {
        // A weeping willow.
        f.fillStyle = c.leaf[1]
        f.beginPath()
        f.ellipse(x, treeBase - th * 0.72, th * 0.42, th * 0.3, 0, 0, TAU)
        f.fill()
        f.strokeStyle = c.leaf[1]
        f.lineWidth = 2
        for (let s = 0; s < 14; s++) {
          const sx = x + (s / 13 - 0.5) * th * 0.84
          f.beginPath()
          f.moveTo(sx, treeBase - th * 0.72)
          f.quadraticCurveTo(sx + (sx - x) * 0.25, treeBase - th * 0.35, sx + (sx - x) * 0.18, treeBase - 1)
          f.stroke()
        }
      } else if (kind < 0.42) {
        // A tall poplar.
        f.fillStyle = c.leaf[2]
        f.beginPath()
        f.ellipse(x, treeBase - th * 0.62, th * 0.17, th * 0.5, 0, 0, TAU)
        f.fill()
        f.fillStyle = c.leaf[0]
        f.beginPath()
        f.ellipse(x - th * 0.05, treeBase - th * 0.7, th * 0.09, th * 0.38, 0, 0, TAU)
        f.fill()
      } else {
        // A round, leafy tree.
        for (let b = 0; b < 4; b++) {
          f.fillStyle = c.leaf[b % 3]
          f.beginPath()
          f.arc(x + (r() - 0.5) * th * 0.45, treeBase - th * (0.6 + r() * 0.2), th * (0.24 + r() * 0.12), 0, TAU)
          f.fill()
        }
        f.fillStyle = c.leaf[3]
        f.globalAlpha = 0.6
        f.beginPath()
        f.arc(x - th * 0.1, treeBase - th * 0.8, th * 0.13, 0, TAU)
        f.fill()
        f.globalAlpha = 1
      }
    }
    // Bushes and reeds along the far shore.
    for (let i = 0; i < 16; i++) {
      f.fillStyle = c.leaf[i % 4]
      f.beginPath()
      f.arc(r() * w, treeBase + 1, h * (0.012 + r() * 0.018), Math.PI, TAU)
      f.fill()
    }
    f.fillStyle = c.bank[1]
    f.fillRect(0, treeBase, w, hy - treeBase + 1)
    f.strokeStyle = c.reed
    f.lineWidth = 1
    for (let i = 0; i < 70; i++) {
      const x = r() * w
      f.beginPath()
      f.moveTo(x, hy)
      f.lineTo(x + (r() - 0.5) * 2, hy - 3 - r() * 6)
      f.stroke()
    }
    g.drawImage(farCanvas, 0, 0, w, h)

    // The water, with the far bank reflected in it.
    const water = g.createLinearGradient(0, hy, 0, h)
    water.addColorStop(0, c.waterTop)
    water.addColorStop(0.38, c.waterMid)
    water.addColorStop(1, c.waterLow)
    g.fillStyle = water
    g.fillRect(0, hy, w, h - hy)
    g.save()
    g.globalAlpha = 0.34
    g.translate(0, hy)
    g.scale(1, -0.55)
    g.translate(0, -hy)
    g.drawImage(farCanvas, 0, 0, w, h)
    g.restore()
    const sheen = g.createRadialGradient(light.x, hy + (h - hy) * 0.25, 0, light.x, hy + (h - hy) * 0.25, w * 0.35)
    sheen.addColorStop(0, `rgba(${c.glint}, 0.22)`)
    sheen.addColorStop(1, `rgba(${c.glint}, 0)`)
    g.fillStyle = sheen
    g.fillRect(0, hy, w, h - hy)
    g.fillStyle = 'rgba(255, 255, 255, 0.28)'
    g.fillRect(0, hy, w, 1.2)

    this.backdrop = canvas
  }

  private lightPx(): Point {
    return { x: this.w * (this.night ? 0.2 : 0.16), y: this.h * (this.night ? 0.11 : 0.07) }
  }

  private drawSkyLife(t: number) {
    const { ctx, w, h } = this
    if (this.night) {
      // A few stars twinkle.
      const r = seeded(29)
      for (let i = 0; i < 9; i++) {
        const x = r() * w
        const y = r() * this.horizon * 0.85
        const a = 0.5 + 0.5 * Math.sin(t * (1.5 + r() * 2) + i)
        ctx.fillStyle = `rgba(255, 255, 255, ${a})`
        ctx.beginPath()
        ctx.arc(x, y, 1.3, 0, TAU)
        ctx.fill()
      }
      return
    }
    // Slow clouds.
    const clouds: Array<[number, number, number, number]> = [
      [0.12, 0.09, 1, 5],
      [0.52, 0.17, 0.75, 3.5],
      [0.86, 0.07, 0.9, 4.2],
    ]
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    for (const [x0, y0, scale, speed] of clouds) {
      const s = (h / 230) * scale
      const x = ((x0 * w + t * speed * this.sway) % (w + 140 * s)) - 70 * s
      const y = y0 * h
      ctx.beginPath()
      for (const [dx, dy, r] of [[-26, 4, 12], [-10, -4, 16], [10, -6, 18], [28, 2, 13], [6, 6, 14]]) {
        ctx.moveTo(x + dx * s + r * s, y + dy * s)
        ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU)
      }
      ctx.fill()
    }
  }

  private drawShimmer(t: number) {
    const { ctx, w, h } = this
    const hy = this.horizon
    const c = this.palette
    ctx.lineCap = 'round'
    for (const d of this.dashes) {
      const y = hy + (h - hy) * (0.03 + 0.97 * d.d ** 1.6)
      const p = this.depth(y)
      const len = d.len * (0.35 + p * 1.3)
      const x = ((d.x * w + t * d.speed * (6 + 18 * p) * this.sway) % (w + 60)) - 30
      const a = 0.07 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.4 + d.phase))
      ctx.strokeStyle = `rgba(${c.glint}, ${a})`
      ctx.lineWidth = 0.7 + p * 1.4
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + len, y)
      ctx.stroke()
    }
    // A glittering path under the sun or moon.
    const lx = this.lightPx().x
    for (const g of this.glints) {
      const y = hy + (h - hy) * (0.02 + 0.6 * g.d ** 1.3)
      const p = this.depth(y)
      const x = lx + (g.x - 0.5) * (14 + p * w * 0.22) + Math.sin(t * 0.8 + g.phase) * 4 * this.sway
      const a = 0.18 + 0.5 * Math.max(0, Math.sin(t * 2.2 + g.phase))
      ctx.strokeStyle = `rgba(${c.glint}, ${a})`
      ctx.lineWidth = 0.8 + p * 1.6
      ctx.beginPath()
      ctx.moveTo(x - g.len * 0.5 * (0.4 + p), y)
      ctx.lineTo(x + g.len * 0.5 * (0.4 + p), y)
      ctx.stroke()
    }
  }

  private drawPads(t: number) {
    const { ctx, w, h } = this
    const c = this.palette
    const scale = Math.min(1.3, Math.max(0.7, w / 520))
    PADS.forEach(([px, py, radius, flower], i) => {
      const x = px * w
      const y = py * h + Math.sin(t * 1.2 + i) * 1.2 * this.sway
      const p = this.depth(y)
      const rx = radius * (0.6 + p * 0.9) * scale
      const ry = rx * 0.42
      const notch = i * 1.7 + 0.6
      const fill = ctx.createLinearGradient(x, y - ry, x, y + ry)
      fill.addColorStop(0, c.pad[0])
      fill.addColorStop(1, c.pad[1])
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.ellipse(x, y, rx, ry, 0, notch + 0.32, notch + TAU - 0.04)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.strokeStyle = 'rgba(0, 40, 20, 0.18)'
      for (let v = 1; v < 5; v++) {
        const a = notch + (v / 5) * TAU
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + Math.cos(a) * rx * 0.8, y + Math.sin(a) * ry * 0.8)
        ctx.stroke()
      }
      if (flower) {
        const fx = x + rx * 0.15
        const fy = y - ry * 0.5
        const s = rx * 0.32
        ctx.fillStyle = c.petal
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * TAU
          ctx.beginPath()
          ctx.ellipse(fx + Math.cos(a) * s * 0.55, fy + Math.sin(a) * s * 0.25 - s * 0.2, s * 0.5, s * 0.22, a, 0, TAU)
          ctx.fill()
        }
        ctx.fillStyle = '#ffd64d'
        ctx.beginPath()
        ctx.arc(fx, fy - s * 0.3, s * 0.25, 0, TAU)
        ctx.fill()
      }
    })
  }

  private drawShadow() {
    const s = this.shadow
    if (s.alpha < 0.01) return
    const { ctx } = this
    const size = 0.7 + this.depth(s.y) * 0.7
    ctx.save()
    ctx.translate(s.x, s.y)
    ctx.scale(size, size * 0.5)
    ctx.rotate(s.heading)
    ctx.fillStyle = `rgba(6, 28, 40, ${s.alpha})`
    ctx.beginPath()
    ctx.ellipse(0, 0, 18, 7, 0, 0, TAU)
    ctx.moveTo(-14, 0)
    ctx.lineTo(-27, -7)
    ctx.lineTo(-25, 0)
    ctx.lineTo(-27, 7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  private drawRings(now: number) {
    const { ctx } = this
    this.rings = this.rings.filter((r) => now - r.born < r.life)
    ctx.lineWidth = 1.2
    for (const r of this.rings) {
      const u = clamp01((now - r.born) / r.life)
      const radius = lerp(2, r.size, easeOut(u))
      ctx.strokeStyle = `rgba(255, 255, 255, ${r.alpha * (1 - u)})`
      ctx.beginPath()
      ctx.ellipse(r.x, r.y, radius, radius * 0.32, 0, 0, TAU)
      ctx.stroke()
    }
  }

  private drawBobber(b: { x: number; y: number; sink: number; inWater: boolean }) {
    const { ctx } = this
    const r = b.inWater ? 3.6 + this.depth(b.y) * 4.4 : 7
    const cy = b.y + b.sink
    const waterline = b.y + r * 0.35
    ctx.save()
    if (b.inWater) {
      ctx.beginPath()
      ctx.rect(b.x - r * 3, waterline - r * 6 - 40, r * 6, r * 6 + 40)
      ctx.clip()
    }
    ctx.strokeStyle = '#2b2b2b'
    ctx.lineWidth = Math.max(1, r * 0.22)
    ctx.beginPath()
    ctx.moveTo(b.x, cy - r)
    ctx.lineTo(b.x, cy - r * 1.7)
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(b.x, cy, r, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#ff4747'
    ctx.beginPath()
    ctx.arc(b.x, cy, r, Math.PI, TAU)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.arc(b.x, cy, r, 0, TAU)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.beginPath()
    ctx.arc(b.x - r * 0.35, cy - r * 0.45, r * 0.25, 0, TAU)
    ctx.fill()
    ctx.restore()
    if (b.inWater) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(b.x, waterline, r * 1.4, r * 0.38, 0, 0, TAU)
      ctx.stroke()
    }
  }

  private bankY(x: number) {
    // Matches the curve drawn in drawBank.
    const u = x / this.w
    return this.h * (u < 0.34 ? lerp(0.8, 0.94, (u / 0.34) ** 1.4) : lerp(0.94, 0.92, (u - 0.34) / 0.66))
  }

  private drawBank(t: number) {
    const { ctx, w, h } = this
    const c = this.palette
    const grass = ctx.createLinearGradient(0, h * 0.8, 0, h)
    grass.addColorStop(0, c.bank[0])
    grass.addColorStop(1, c.bank[1])
    ctx.fillStyle = grass
    ctx.beginPath()
    ctx.moveTo(0, h * 0.8)
    ctx.bezierCurveTo(w * 0.12, h * 0.8, w * 0.22, h * 0.9, w * 0.34, h * 0.94)
    ctx.bezierCurveTo(w * 0.55, h * 0.97, w * 0.8, h * 0.93, w, h * 0.92)
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = c.edge
    ctx.lineWidth = 2
    ctx.stroke()

    // Stones along the water's edge.
    for (const [sx, sr] of [[0.27, 9], [0.33, 6], [0.47, 11], [0.53, 7], [0.76, 8]] as Array<[number, number]>) {
      const x = sx * w
      const y = this.bankY(x) + 2
      const stone = ctx.createLinearGradient(x, y - sr, x, y + sr * 0.5)
      stone.addColorStop(0, this.night ? '#5a6672' : '#c9cdc4')
      stone.addColorStop(1, this.night ? '#2c343c' : '#7d8578')
      ctx.fillStyle = stone
      ctx.beginPath()
      ctx.ellipse(x, y, sr * 1.3, sr * 0.7, 0, Math.PI, TAU)
      ctx.lineTo(x + sr * 1.3, y + 2)
      ctx.lineTo(x - sr * 1.3, y + 2)
      ctx.fill()
    }
    // Little flowers in the grass.
    for (const d of this.daisies) {
      ctx.fillStyle = this.night ? 'rgba(220, 225, 255, 0.55)' : d.color
      ctx.beginPath()
      ctx.arc(d.x * w, d.y * h, 1.8, 0, TAU)
      ctx.fill()
    }

    // Reeds and cattails at the left, swaying.
    for (const [i, b] of this.blades.entries()) {
      const x0 = b.x * w
      const y0 = this.bankY(x0) + 6
      const sway = Math.sin(t * 1.2 + i * 0.7) * (3 + (i % 3)) * this.sway
      const tipX = x0 + b.lean * w + sway
      const tipY = y0 - b.height * h
      ctx.fillStyle = b.shade < 0.5 ? c.reed : c.leaf[b.shade < 0.75 ? 0 : 2]
      ctx.beginPath()
      ctx.moveTo(x0 - b.width, y0)
      ctx.quadraticCurveTo(x0 - b.width * 0.4 + sway * 0.3, (y0 + tipY) / 2, tipX, tipY)
      ctx.quadraticCurveTo(x0 + b.width * 0.4 + sway * 0.3, (y0 + tipY) / 2, x0 + b.width, y0)
      ctx.closePath()
      ctx.fill()
      if (b.cattail) {
        const hx = lerp(x0, tipX, 0.82)
        const hy = lerp(y0, tipY, 0.82)
        ctx.save()
        ctx.translate(hx, hy)
        ctx.rotate(Math.atan2(tipX - x0, y0 - tipY))
        ctx.fillStyle = this.night ? '#3a2a20' : '#7a4a2a'
        ctx.beginPath()
        ctx.roundRect(-2.6, -9, 5.2, 18, 2.6)
        ctx.fill()
        ctx.restore()
      }
    }
  }

  private drawLine(tip: Point, bob: { x: number; y: number; sink: number; inWater: boolean }, t: number) {
    const { ctx } = this
    const c = this.palette
    const slack: Record<PondMoment, number> = { ready: 0, casting: 0.15, waiting: 1, bite: 0.25, reeling: 0, landing: 0, caught: 0.15, lost: 1 }
    const r = bob.inWater ? 3.6 + this.depth(bob.y) * 4.4 : 7
    const end = { x: bob.x, y: bob.y + bob.sink - r * 1.7 }
    const mid = { x: (tip.x + end.x) / 2, y: (tip.y + end.y) / 2 }
    const sag = slack[this.moment] * (14 + 20 * this.depth(end.y))
    const shake = this.moment === 'reeling' ? Math.sin(t * 55) * this.tension * 5 : 0
    ctx.strokeStyle = c.line
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.quadraticCurveTo(mid.x + shake, mid.y + sag, end.x, end.y)
    ctx.stroke()
  }

  private drawRod(tip: Point) {
    const { ctx, w, h } = this
    const c = this.palette
    const butt = { x: w * 0.99, y: h * 1.04 }
    const rest = this.restTip()
    const ctrl = { x: lerp(butt.x, rest.x, 0.62), y: lerp(butt.y, rest.y, 0.62) }
    const at = (u: number): Point => ({
      x: (1 - u) ** 2 * butt.x + 2 * (1 - u) * u * ctrl.x + u * u * tip.x,
      y: (1 - u) ** 2 * butt.y + 2 * (1 - u) * u * ctrl.y + u * u * tip.y,
    })
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(butt.x, butt.y)
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, tip.x, tip.y)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.strokeStyle = c.rod
    ctx.lineWidth = 3
    ctx.stroke()
    // The cork handle, the reel and the line guides.
    const a = at(0.02)
    const b = at(0.18)
    ctx.strokeStyle = this.night ? '#8a6a48' : '#d2a26a'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    const reel = at(0.22)
    ctx.fillStyle = this.night ? '#5d6670' : '#a9b3bc'
    ctx.beginPath()
    ctx.arc(reel.x - 8, reel.y + 2, 7, 0, TAU)
    ctx.fill()
    ctx.fillStyle = this.night ? '#3a4048' : '#6e7882'
    ctx.beginPath()
    ctx.arc(reel.x - 8, reel.y + 2, 3, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = this.night ? '#8a929c' : '#d7dde2'
    ctx.lineWidth = 1
    for (const u of [0.45, 0.65, 0.85]) {
      const g = at(u)
      ctx.beginPath()
      ctx.arc(g.x - 2, g.y, 1.8, 0, TAU)
      ctx.stroke()
    }
  }

  private drawDrops(now: number, dt: number) {
    const { ctx } = this
    this.drops = this.drops.filter((d) => now - d.born < d.life)
    for (const d of this.drops) {
      d.vy += 900 * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      const a = 1 - (now - d.born) / d.life
      ctx.fillStyle = `rgba(232, 248, 255, ${0.85 * a})`
      ctx.beginPath()
      ctx.arc(d.x, d.y, d.r, 0, TAU)
      ctx.fill()
    }
  }

  private catchPos(now: number, t: number): Point & { k: number } {
    const k = this.moment === 'landing' ? clamp01((now - this.momentAt) / LEAP_MS) : 1
    const e = easeOut(k)
    const end = { x: this.w * 0.5, y: this.h * 0.42 }
    return {
      k,
      x: lerp(this.leapFrom.x, end.x, e),
      y: lerp(this.leapFrom.y, end.y, e) - Math.sin(Math.PI * k) * this.h * 0.25 + (k >= 1 ? Math.sin(t * 2) * 4 * this.sway : 0),
    }
  }

  private drawCatch(now: number, t: number, dt: number) {
    if ((this.moment !== 'landing' && this.moment !== 'caught') || !this.art) return
    const { ctx } = this
    const { x, y, k } = this.catchPos(now, t)
    const e = easeOut(k)
    const size = Math.min(this.w, this.h) * 0.55 * lerp(0.45, 1, e)

    // A burst of light once it's out of the water.
    const glow = clamp01((k - 0.55) / 0.45)
    if (glow > 0) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(t * 0.4 * this.sway)
      const rays = ctx.createRadialGradient(0, 0, size * 0.1, 0, 0, size * 0.95)
      rays.addColorStop(0, `rgba(255, 246, 200, ${0.55 * glow})`)
      rays.addColorStop(1, 'rgba(255, 246, 200, 0)')
      ctx.fillStyle = rays
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, size * 0.95, a, a + 0.28)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + t * 0.6
        const d = size * (0.48 + 0.08 * Math.sin(t * 3 + i))
        const s = 2.5 + 2 * Math.max(0, Math.sin(t * 4 + i * 1.3))
        this.sparkle(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, s * glow, `rgba(255, 255, 255, ${0.9 * glow})`)
      }
    }

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((1 - e) * -0.8 + Math.sin(t * 1.5) * 0.05 * this.sway)
    const art = this.art
    if (art.image?.complete && art.image.naturalWidth > 0) {
      ctx.drawImage(art.image, -size / 2, -size / 2, size, size)
    } else if (art.emoji) {
      ctx.font = `${Math.round(size * 0.6)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(art.emoji, 0, 0)
    } else {
      // A simple fish shape until its picture is ready.
      ctx.fillStyle = art.color
      ctx.beginPath()
      ctx.ellipse(0, 0, size * 0.3, size * 0.16, 0, 0, TAU)
      ctx.moveTo(-size * 0.24, 0)
      ctx.lineTo(-size * 0.44, -size * 0.14)
      ctx.lineTo(-size * 0.44, size * 0.14)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#1b1b1b'
      ctx.beginPath()
      ctx.arc(size * 0.18, -size * 0.03, size * 0.03, 0, TAU)
      ctx.fill()
    }
    ctx.restore()

    // Water streaming off it as it leaps.
    if (k < 0.9 && Math.random() < dt * 30) {
      this.drops.push({ x: x + (Math.random() - 0.5) * size * 0.4, y: y + size * 0.15, vx: (Math.random() - 0.5) * 30, vy: 20, born: now, life: 600, r: 1 + Math.random() * 1.5 })
    }
  }

  private sparkle(x: number, y: number, s: number, color: string) {
    if (s <= 0.2) return
    const { ctx } = this
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x, y - s * 2)
    ctx.quadraticCurveTo(x, y, x + s * 2, y)
    ctx.quadraticCurveTo(x, y, x, y + s * 2)
    ctx.quadraticCurveTo(x, y, x - s * 2, y)
    ctx.quadraticCurveTo(x, y, x, y - s * 2)
    ctx.fill()
  }

  private drawCritters(now: number, t: number, dt: number) {
    const { ctx, w, h } = this
    if (this.night) {
      for (const f of this.fireflies) {
        const x = f.x * w + Math.sin(t * 0.5 * f.speed + f.phase) * 30 * this.sway
        const y = f.y * h + Math.cos(t * 0.7 * f.speed + f.phase) * 14 * this.sway
        const a = Math.max(0, Math.sin(t * 2.3 * f.speed + f.phase)) ** 2
        if (a < 0.03) continue
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 7)
        glow.addColorStop(0, `rgba(225, 255, 140, ${0.8 * a})`)
        glow.addColorStop(1, 'rgba(225, 255, 140, 0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(x, y, 7, 0, TAU)
        ctx.fill()
      }
      return
    }
    // A dragonfly darting about and hovering.
    const fly = this.fly
    if (now > fly.nextAt) {
      fly.tx = 0.12 + Math.random() * 0.62
      fly.ty = 0.2 + Math.random() * 0.3
      fly.nextAt = now + 1300 + Math.random() * 2600
    }
    const dx = fly.tx - fly.x
    const dy = fly.ty - fly.y
    fly.x += dx * Math.min(1, dt * 3)
    fly.y += dy * Math.min(1, dt * 3)
    if (Math.abs(dx) > 0.01) fly.heading = dx > 0 ? 1 : -1
    const x = fly.x * w + Math.sin(t * 7) * 1.5
    const y = fly.y * h + Math.cos(t * 9) * 1.5
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(fly.heading, 1)
    const flutter = 0.6 + 0.4 * Math.sin(t * 70)
    ctx.fillStyle = `rgba(235, 250, 255, ${0.45 * flutter + 0.2})`
    for (const [ox, a] of [[1, -0.35], [1, 0.35], [-1.5, -0.25], [-1.5, 0.25]] as Array<[number, number]>) {
      ctx.beginPath()
      ctx.ellipse(ox, a * 9, 7.5, 2, a, 0, TAU)
      ctx.fill()
    }
    ctx.strokeStyle = '#1f8f9e'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(4, 0)
    ctx.lineTo(-12, 0)
    ctx.stroke()
    ctx.fillStyle = '#20606b'
    ctx.beginPath()
    ctx.arc(5, 0, 2.4, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  private drawAlert(now: number, t: number, bob: Point) {
    const { ctx } = this
    const k = clamp01((now - this.momentAt) / 240)
    const s = easeOutBack(k)
    ctx.save()
    ctx.translate(bob.x + 14, bob.y - 32)
    ctx.rotate(Math.sin(t * 18) * 0.12)
    ctx.scale(s, s)
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.arc(0, 0, 13, 0, TAU)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#ff7a1a'
    ctx.font = '900 19px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('!', 0, 1)
    ctx.restore()
  }
}
