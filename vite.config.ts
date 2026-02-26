import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
// CI может передать APP_VERSION через env (git tag)
const version = process.env.APP_VERSION?.replace(/^v/, '') || pkg.version

export default defineConfig({
  base: '/mobile-xr/',
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Mobile XR',
        short_name: 'MobileXR',
        description: 'WebXR Hand Tracking — floating 3D interface',
        theme_color: '#0a0a1a',
        background_color: '#0a0a1a',
        display: 'fullscreen',
        orientation: 'landscape',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [{
          urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
          handler: 'CacheFirst',
          options: { cacheName: 'mediapipe-cache', expiration: { maxEntries:20, maxAgeSeconds:2592000 } }
        }]
      }
    })
  ],
  build: {
    target: 'es2020',
    rollupOptions: { output: { manualChunks: { three: ['three'] } } }
  },
  server: { host: true }
})
