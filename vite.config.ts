import crypto from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function pwaServiceWorkerPlugin(): Plugin {
  return {
    name: 'grid34-pwa-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const precacheFiles = Object.values(bundle)
        .filter((file): file is { type: 'asset'; fileName: string } | { type: 'chunk'; fileName: string } => 'fileName' in file)
        .map((file) => file.fileName)
        .filter((fileName) => fileName !== 'sw.js')

      const cacheHash = crypto
        .createHash('sha256')
        .update(precacheFiles.join('|'))
        .digest('hex')
        .slice(0, 12)

      const precacheList = [
        '/',
        '/index.html',
        '/apple-touch-icon.png',
        '/icon-192.png',
        '/icon-512.png',
        '/logo.png',
        '/manifest.webmanifest',
        ...precacheFiles.map((fileName) => `/${fileName}`),
      ]

      const swSource = `
const CACHE_NAME = 'grid34-pwa-${cacheHash}'
const PRECACHE_URLS = ${JSON.stringify(precacheList, null, 2)}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await cache.addAll(PRECACHE_URLS)
    self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request)
        const cache = await caches.open(CACHE_NAME)
        cache.put(event.request, response.clone())
        return response
      } catch {
        const cache = await caches.open(CACHE_NAME)
        return (await cache.match(event.request)) || (await cache.match('/index.html')) || (await cache.match('/'))
      }
    })())
    return
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(event.request)
    if (cached) {
      event.waitUntil((async () => {
        try {
          const response = await fetch(event.request)
          cache.put(event.request, response.clone())
        } catch {
          // Ignore network refresh failures when serving a cached asset.
        }
      })())
      return cached
    }

    try {
      const response = await fetch(event.request)
      cache.put(event.request, response.clone())
      return response
    } catch {
      return cached || Response.error()
    }
  })())
})
`

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: swSource,
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pwaServiceWorkerPlugin(),
  ],
})
