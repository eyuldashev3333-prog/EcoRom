import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: https://eyuldashev3333-prog.github.io/EcoRom/
export default defineConfig({
  base: '/EcoRom/',
  plugins: [react()],
  test: { environment: 'node' },
})
