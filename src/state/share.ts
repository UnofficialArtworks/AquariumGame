// Share your tank as a link. The whole tank (layout, fish and scenery) is
// packed into the link itself, after the #, so nothing is uploaded anywhere
// and nothing reaches a server. Whoever opens it gets a look-only copy of the
// tank as it was when the link was made. Fish names stay private: shared
// fish just go by their species.
import type { DecorationInstance, FishInstance, FishVitals, GameState, MorphId } from './types'
import { getDecorationDef } from '../scene/decorations/decorationDefinitions'
import { getFishDef, resolveFishId } from '../scene/fish/fishDefinitions'
import { BACKGROUND_CATALOG, DEFAULT_BACKGROUND_ID } from '../scene/backgrounds'
import { DEFAULT_SUBSTRATE_ID, SUBSTRATE_CATALOG } from '../scene/substrates'
import { DEFAULT_STAND_ID, STAND_CATALOG } from '../scene/stands/standDefinitions'
import { clampDecoration } from '../scene/TankBounds'
import { aquariumCapacity, DEFAULT_TANK_SIZE, getTankSize } from './tankSizes'
import { getMorph } from './morphs'
import { isPattern } from './patterns'

export interface SharedTank {
  name: string
  backgroundId: string
  substrateId: string
  standId: string
  tankSizeId: string
  decorations: DecorationInstance[]
  fish: FishInstance[]
  /** Fish id → growth, so babies still look like babies. */
  growth: Record<string, number>
}

/** [defId, x, z, rotation] */
type PackedDecoration = [string, number, number, number]
/** [defId, size, growth, color, color2, color3, morph, pattern]: the rest only for hatched fish. */
type PackedFish = [string, number, number, string?, string?, string?, string?, string?]

interface Packed {
  v: 1
  n: string
  b: string
  g: string
  s: string
  /** Tank size (left out for the classic tank, and in links made before tanks could grow). */
  t?: string
  d: PackedDecoration[]
  f: PackedFish[]
}

/** Decorations a shared tank may hold (generous; the game itself has no hard cap). */
const MAX_SHARED_DECORATIONS = 80
export const DEFAULT_SHARED_NAME = "A friend's aquarium"
const round = (n: number) => Math.round(n * 100) / 100

export function packTank(s: GameState): Packed {
  return {
    v: 1,
    n: s.aquariumName,
    b: s.backgroundId,
    g: s.substrateId,
    s: s.standId,
    ...(s.tankSizeId !== DEFAULT_TANK_SIZE ? { t: s.tankSizeId } : {}),
    d: s.placedDecorations.map((d) => [d.defId, round(d.position[0]), round(d.position[2]), round(d.rotationY)]),
    f: s.ownedFish
      .filter((f) => f.habitat === 'main')
      .map((f): PackedFish => {
        const size = round(f.sizeScale)
        const growth = round(s.fishVitals[f.id]?.growth ?? 1)
        const i = f.inheritance
        return i ? [f.defId, size, growth, i.color, i.color2, i.color3 ?? '', i.morph ?? '', i.pattern ?? ''] : [f.defId, size, growth]
      }),
  }
}

const HEX = /^#[0-9a-f]{6}$/i
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Tank names are typed by players: keep them short and plain. */
function cleanName(raw: unknown): string {
  const name = str(raw)
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 28)
  return name || DEFAULT_SHARED_NAME
}

/** Turn anything decoded from a link into a safe tank, or null if it isn't one. Unknown items are dropped. */
export function unpackTank(raw: unknown): SharedTank | null {
  const p = raw as Partial<Packed> | null
  if (!p || typeof p !== 'object' || p.v !== 1 || !Array.isArray(p.d) || !Array.isArray(p.f)) return null
  const pick = <T extends { id: string }>(catalog: readonly T[], id: unknown, fallback: string) => (catalog.some((c) => c.id === id) ? (id as string) : fallback)
  const size = getTankSize(str(p.t))
  const decorations: DecorationInstance[] = []
  for (const entry of p.d.slice(0, MAX_SHARED_DECORATIONS)) {
    if (!Array.isArray(entry)) continue
    const def = getDecorationDef(str(entry[0]))
    if (!def) continue
    const [x, z] = clampDecoration(num(entry[1]), num(entry[2]), def.footprintRadius, size.width / 2, size.depth / 2)
    decorations.push({ id: `shared-d${decorations.length}`, defId: def.id, position: [x, 0, z], rotationY: num(entry[3]) % (Math.PI * 2) })
  }
  const fish: FishInstance[] = []
  const growth: Record<string, number> = {}
  for (const entry of p.f.slice(0, aquariumCapacity(size.id))) {
    if (!Array.isArray(entry)) continue
    const def = getFishDef(resolveFishId(str(entry[0])))
    if (!def) continue
    const id = `shared-f${fish.length}`
    const [min, max] = def.sizeRange
    const color = str(entry[3])
    const color2 = str(entry[4])
    const color3 = str(entry[5])
    const morph = getMorph(str(entry[6]) as MorphId) ? (str(entry[6]) as MorphId) : undefined
    const pattern = isPattern(entry[7]) ? entry[7] : undefined
    fish.push({
      id,
      defId: def.id,
      name: def.name,
      bornAt: 0,
      habitat: 'main',
      sizeScale: Math.min(max, Math.max(min, num(entry[1], 1))),
      inheritance:
        HEX.test(color) && HEX.test(color2)
          ? { bodyParentName: '', colorParentName: '', bodyParentId: '', colorParentId: '', color, color2, color3: HEX.test(color3) ? color3 : undefined, morph, pattern }
          : undefined,
    })
    growth[id] = Math.min(1, Math.max(0, num(entry[2], 1)))
  }
  return {
    name: cleanName(p.n),
    backgroundId: pick(BACKGROUND_CATALOG, p.b, DEFAULT_BACKGROUND_ID),
    substrateId: pick(SUBSTRATE_CATALOG, p.g, DEFAULT_SUBSTRATE_ID),
    standId: pick(STAND_CATALOG, p.s, DEFAULT_STAND_ID),
    tankSizeId: size.id,
    decorations,
    fish,
    growth,
  }
}

// --- text codes ---------------------------------------------------------------------
// "z" + base64url(deflate(json)) where the browser can compress, else "j" + base64url(json).

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** Longest code we'll try to read (a full tank is well under this). */
const MAX_CODE_LENGTH = 12_000

export async function encodeTank(s: GameState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(packTank(s)))
  if (typeof CompressionStream === 'function') {
    try {
      return `z${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`
    } catch {
      // Fall through to the plain form.
    }
  }
  return `j${toBase64Url(json)}`
}

export async function decodeTank(code: string): Promise<SharedTank | null> {
  if (!code || code.length > MAX_CODE_LENGTH) return null
  try {
    let bytes = fromBase64Url(code.slice(1))
    if (code[0] === 'z') {
      if (typeof DecompressionStream !== 'function') return null
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'))
    } else if (code[0] !== 'j') {
      return null
    }
    if (bytes.length > 200_000) return null
    return unpackTank(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return null
  }
}

/** Find a tank code in a pasted link, a #tank= hash, or a bare code. */
export function shareCodeFrom(text: string): string | null {
  const trimmed = text.trim()
  const match = trimmed.match(/#tank=([A-Za-z0-9_-]+)/) ?? trimmed.match(/^tank=([A-Za-z0-9_-]+)$/) ?? trimmed.match(/^([zj][A-Za-z0-9_-]{8,})$/)
  return match ? match[1] : null
}

export function shareLink(code: string, base = `${location.origin}${location.pathname}`): string {
  return `${base}#tank=${code}`
}

/** What the game shows while you visit a shared tank: their tank, happy fish, clean water, no gifts or eggs. */
export function visitState(tank: SharedTank): Partial<GameState> {
  const vitals: Record<string, FishVitals> = Object.fromEntries(tank.fish.map((f) => [f.id, { hunger: 0.15, growth: tank.growth[f.id] ?? 1, mealsEaten: 10 }]))
  return {
    aquariumName: tank.name,
    backgroundId: tank.backgroundId,
    substrateId: tank.substrateId,
    standId: tank.standId,
    tankSizeId: tank.tankSizeId,
    placedDecorations: tank.decorations,
    ownedFish: tank.fish,
    fishVitals: vitals,
    murk: 0.03,
    waste: [],
    gifts: [],
    nurseryEggs: [],
    nurserySession: null,
  }
}
