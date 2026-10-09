import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyArrival, MOVING_PAGE, movingLink, readMovingCode, stageArrival } from '../src/state/moving'

function memory(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

const save = JSON.stringify({ state: { aquariumName: 'Bubble Bay', coins: 420, ownedFish: [{ id: 'a' }] }, version: 7 })
const algae = JSON.stringify({ v: 1, t: 1, cols: 2, rows: 2, d: 'AAAA' })

test('a moving code carries the aquarium exactly, and only the aquarium', async () => {
  const link = await movingLink(memory({ 'aquarium-save': save, 'aquarium-algae': algae, 'fuzzlet.save.v2': '{}', other: 'x' }))
  assert.ok(link.startsWith(`${MOVING_PAGE}#saves=z`))
  assert.deepEqual(await readMovingCode(link), { 'aquarium-save': save, 'aquarium-algae': algae })
  // Pasted from Notes: line breaks and spaces, or only the code after #saves=.
  const code = link.slice(link.indexOf('#saves=') + 7)
  assert.deepEqual(await readMovingCode(`  ${code.slice(0, 20)}\n${code.slice(20)}  `), { 'aquarium-save': save, 'aquarium-algae': algae })
  assert.equal(await movingLink(memory({ 'aquarium-algae': algae })), '')
})

test('a peekarium.com/move/ link with both games brings in only the aquarium', async () => {
  const plain = (bundle: unknown) => `${MOVING_PAGE}#saves=j${btoa(JSON.stringify(bundle)).replace(/=+$/, '')}`
  assert.deepEqual(await readMovingCode(plain({ version: 1, saves: { 'aquarium-save': save, 'fuzzlet.save.v2': '{"pets":[]}' } })), {
    'aquarium-save': save,
  })
  await assert.rejects(readMovingCode(plain({ version: 1, saves: { 'fuzzlet.save.v2': '{}' } })), /no aquarium/)
  await assert.rejects(readMovingCode(plain({ version: 1, saves: { 'aquarium-save': save, 'peekarium:preferences:v1': '{}' } })))
  await assert.rejects(readMovingCode(plain({ version: 1, saves: { 'aquarium-save': 'not json' } })))
  await assert.rejects(readMovingCode('hello there'))
  await assert.rejects(readMovingCode('zAAAA'))
})

test('a staged arrival becomes the save at the next start, replacing old algae', () => {
  const session = memory()
  const storage = memory({ 'aquarium-save': '{"old":true}', 'aquarium-algae': algae })
  stageArrival({ 'aquarium-save': save }, session)
  assert.equal(applyArrival(session, storage), true)
  assert.equal(storage.data.get('aquarium-save'), save)
  assert.equal(storage.data.has('aquarium-algae'), false)
  assert.equal(applyArrival(session, storage), false)
})
