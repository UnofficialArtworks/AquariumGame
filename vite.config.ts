import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Libraries (three.js, React and friends) get their own file. They
        // rarely change, so returning players keep them cached and only
        // re-download the game's own code after an update.
        codeSplitting: {
          groups: [{ name: 'vendor', test: /[\\/]node_modules[\\/]/ }],
        },
      },
    },
    // A 3D game needs its engine up front, so a big vendor file is expected.
    chunkSizeWarningLimit: 1500,
  },
})
