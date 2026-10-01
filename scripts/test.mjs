import { build } from 'vite'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

// Reuse Vite's TypeScript pipeline and Node's test runner; no extra test runtime.
await build({
  configFile: false,
  publicDir: false,
  logLevel: 'error',
  build: {
    ssr: 'tests/game.test.ts',
    outDir: 'node_modules/.cache/aquarium-tests',
    emptyOutDir: false,
    rolldownOptions: { output: { entryFileNames: 'game.test.mjs' } },
  },
})
const result = spawnSync(process.execPath, ['--test', resolve('node_modules/.cache/aquarium-tests/game.test.mjs')], { stdio: 'inherit' })
process.exitCode = result.status ?? 1
