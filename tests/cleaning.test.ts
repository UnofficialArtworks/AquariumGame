import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampGlassHead } from '../src/scene/cleaning/glassReach'
import { TOOL_CATALOG } from '../src/scene/cleaning/toolDefinitions'
import { WALLS, TANK_BOTTOM_Y } from '../src/scene/TankBounds'
import { ALGAE_RES, growAlgae, scrubAlgae, algaeAt } from '../src/sim/algae'

test('every glass tool reaches algae cells at the bottom of all four walls', () => {
  const lowestCell = TANK_BOTTOM_Y + 0.5 / ALGAE_RES
  for (const tool of TOOL_CATALOG) {
    if (tool.category !== 'glass') continue
    for (const wall of WALLS) {
      const head = clampGlassHead(tool, wall, 0, -100)
      assert.ok(Math.abs(head.y - lowestCell) < tool.halfHeight, `${tool.id} cannot clean ${wall.id} bottom row`)
    }
  }
})

test('glass tools can clear the lowest algae cells all the way into corners', () => {
  const lowestCell = TANK_BOTTOM_Y + 0.5 / ALGAE_RES
  for (const tool of TOOL_CATALOG) {
    if (tool.category !== 'glass') continue
    growAlgae(1e6, 1)
    for (const wall of WALLS) {
      for (let along = -wall.length / 2; along <= wall.length / 2; along += 0.04) {
        const head = clampGlassHead(tool, wall, along, -100)
        for (let i = 0; i < 5; i++) scrubAlgae(wall.a * head.along + wall.b, head.y, tool.halfWidth, tool.strength, tool.halfHeight)
      }
      for (let along = -wall.length / 2 + 0.5 / ALGAE_RES; along < wall.length / 2; along += 1 / ALGAE_RES) {
        assert.ok(algaeAt(wall.a * along + wall.b, lowestCell) < 0.001, `${tool.id} leaves unreachable algae at ${wall.id}:${along}`)
      }
    }
  }
})
