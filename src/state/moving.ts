/**
 * Moving the aquarium to a new address or device. A browser keeps the save for one address (and a
 * Home Screen app keeps its own), so the save travels as a moving code: the same link format as
 * peekarium.com/move/, with the save inside its #fragment so it never reaches a server.
 *
 * Bringing a save in is staged in sessionStorage and applied by `applyArrival` at the very start of
 * the next page load, before the game reads its save. The running game saves itself when the page
 * unloads, so writing straight into its storage would be overwritten.
 */
const KEYS = ['aquarium-save', 'aquarium-algae'] as const
/** Keys any Peekarium moving link may carry; links from peekarium.com/move/ also hold My Fuzzlet's. */
const KNOWN = [...KEYS, 'fuzzlet.save.v2', 'fuzzlet.save']
const STAGED = 'aquarium-moving-in'
const LIMIT = 8_000_000
export const MOVING_PAGE = 'https://peekarium.com/move/'

type Saves = Record<string, string>
type Reader = Pick<Storage, 'getItem'>
type Writer = Pick<Storage, 'setItem' | 'getItem' | 'removeItem'>

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(text: string) {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const output = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await output.arrayBuffer())
}

/** This aquarium's save as a moving link. Empty when there is nothing saved yet. */
export async function movingLink(storage: Reader = localStorage) {
  const saves: Saves = {}
  for (const key of KEYS) {
    const value = storage.getItem(key)
    if (value !== null) saves[key] = value
  }
  if (!saves['aquarium-save']) return ''
  const json = new TextEncoder().encode(JSON.stringify({ version: 1, saves }))
  const code =
    typeof CompressionStream === 'undefined' ? 'j' + toBase64Url(json) : 'z' + toBase64Url(await transform(json, new CompressionStream('gzip')))
  return `${MOVING_PAGE}#saves=${code}`
}

/** A pasted moving link or bare code → this aquarium's saves. Throws a friendly message otherwise. */
export async function readMovingCode(text: string): Promise<Saves> {
  const compact = text.replace(/\s+/g, '')
  const code = compact.includes('#saves=') ? compact.slice(compact.indexOf('#saves=') + 7) : compact
  const problem = "That doesn't look like a moving code. Paste the whole code you copied."
  if (!code || code.length > LIMIT) throw new Error(problem)
  let bundle: { version?: unknown; saves?: unknown }
  try {
    let bytes = fromBase64Url(code.slice(1))
    if (code[0] === 'z') bytes = await transform(bytes, new DecompressionStream('gzip'))
    else if (code[0] !== 'j') throw new Error()
    bundle = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error(problem)
  }
  if (bundle.version !== 1 || !bundle.saves || typeof bundle.saves !== 'object') throw new Error(problem)
  const saves: Saves = {}
  for (const [key, value] of Object.entries(bundle.saves)) {
    if (!KNOWN.includes(key) || typeof value !== 'string') throw new Error(problem)
    JSON.parse(value)
    if ((KEYS as readonly string[]).includes(key)) saves[key] = value
  }
  if (!saves['aquarium-save']) throw new Error('This moving code has no aquarium in it.')
  return saves
}

/** Keep the saves for the next page load, which brings them in before the game starts. */
export function stageArrival(saves: Saves, session: Pick<Storage, 'setItem'> = sessionStorage) {
  session.setItem(STAGED, JSON.stringify(saves))
}

/** Run first thing on page load: brings in a staged save. True when one arrived. */
export function applyArrival(session: Writer = sessionStorage, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage) {
  const staged = session.getItem(STAGED)
  if (!staged) return false
  session.removeItem(STAGED)
  const saves = JSON.parse(staged) as Saves
  for (const key of KEYS) {
    if (typeof saves[key] === 'string') storage.setItem(key, saves[key])
    else storage.removeItem(key)
  }
  return true
}
