import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// O navegador só fala com /api (mesma origem). O proxy repassa ao backend em :3001,
// então o token do MYP Cards nunca chega ao frontend e um único túnel serve tudo.
const proxy = { '/api': { target: 'http://localhost:3001', xfwd: true } }

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { proxy, allowedHosts: ['.trycloudflare.com'] },
  preview: { proxy, allowedHosts: ['.trycloudflare.com'] }
})
