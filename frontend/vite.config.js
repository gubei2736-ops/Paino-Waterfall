import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Ignore soundfonts directory to prevent EBUSY errors on Windows
      // when large numbers of .wav/.mp3 files are present
      ignored: ['**/public/soundfonts/**'],
    },
  },
})
