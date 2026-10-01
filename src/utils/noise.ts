import { mulberry32 } from './rng'

// Classic "improved" gradient noise (Perlin 2002) with a fixed seeded
// permutation table, so terrain/rocks/algae patterns are stable between loads.

const perm = new Uint8Array(512)
{
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  const rand = mulberry32(1337)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = p[i]
    p[i] = p[j]
    p[j] = tmp
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a)
}

function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15
  const u = h < 8 ? x : y
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}

/** Gradient noise in roughly [-1, 1]. */
export function noise3(x: number, y: number, z: number): number {
  const fx = Math.floor(x)
  const fy = Math.floor(y)
  const fz = Math.floor(z)
  const X = fx & 255
  const Y = fy & 255
  const Z = fz & 255
  x -= fx
  y -= fy
  z -= fz
  const u = fade(x)
  const v = fade(y)
  const w = fade(z)
  const A = perm[X] + Y
  const AA = perm[A] + Z
  const AB = perm[A + 1] + Z
  const B = perm[X + 1] + Y
  const BA = perm[B] + Z
  const BB = perm[B + 1] + Z

  return lerp(
    lerp(
      lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
      lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u),
      v,
    ),
    lerp(
      lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
      lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u),
      v,
    ),
    w,
  )
}

export function noise2(x: number, y: number): number {
  return noise3(x, y, 0.5)
}

/** Fractal (multi-octave) noise, roughly [-1, 1]. */
export function fbm3(x: number, y: number, z: number, octaves = 4): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x * freq, y * freq, z * freq) * amp
    norm += amp
    amp *= 0.5
    freq *= 2.03
  }
  return sum / norm
}
