import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = '/Stealgull/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      base,
      scope: base,
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'Stealgull — Furto con becco',
        short_name: 'Stealgull',
        description: 'Sei un gabbiano. Ruba cibo ai turisti e scatena il caos!',
        theme_color: '#12364a',
        background_color: '#12364a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: base + 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: base + 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: base + 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ]
});
