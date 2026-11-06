import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages serves this project under /file-compressor/.
  base: '/file-compressor/',
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: { exclude: ['@lipoe/browser-qpdf'] },
  plugins: [react()],
})
