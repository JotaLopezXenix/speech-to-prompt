import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// base '/': el frontend nuevo se sirve en la raíz (cutover SPEC-07, cierre 2b).
// Durante 2b fue '/app/' (ruta temporal) para desprender R5 sin tocar el viejo.
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Speech-to-Prompt',
        short_name: 'Speech-to-Prompt',
        description: 'Convierte dictados de voz en prompts limpios y estructurados.',
        lang: 'es',
        theme_color: '#2F5D50',
        background_color: '#F3EFE7',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // En dev, el backend Express corre en :3000; Vite (5173) le hace proxy de /api.
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
})
