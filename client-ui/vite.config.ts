import { readFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { RequestHandler } from 'msw'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// The backend picks the business from the Host header, so the proxy keeps it (changeOrigin: false):
// http://food.localhost:5173/api/... → http://localhost:8100/api/... with "Host: food.localhost:5173".
const backend = process.env.BACKEND_URL ?? 'http://localhost:8100'
const proxy = {
  '/api': { target: backend, changeOrigin: false },
  '/media': { target: backend, changeOrigin: false },
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }

/**
 * `npm run dev:mock` — the Shop API answered by the MSW handlers of the tests (src/test/handlers.ts) with
 * a demo menu, so the UI can be developed without the backend. Never part of the build.
 */
function mockApi(): Plugin {
  return {
    name: 'deliveryhub:mock-api',
    apply: 'serve',
    configureServer(server) {
      let handlers: Promise<RequestHandler[]> | null = null
      const loadHandlers = () =>
        (handlers ??= Promise.all([server.ssrLoadModule('/src/test/handlers.ts'), server.ssrLoadModule('/src/test/demo.ts')]).then(
          ([module, demo]) => module.createHandlers(demo.demoData) as RequestHandler[],
        ))

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '/'
        try {
          if (url.startsWith('/media/demo/')) {
            const directory = process.env.MOCK_MEDIA_DIR
            const file = directory ? path.join(directory, path.basename(decodeURIComponent(url.split('?')[0]!))) : ''
            const data = file ? await readFile(file).catch(() => null) : null
            res.statusCode = data ? 200 : 404
            if (data) res.setHeader('Content-Type', IMAGE_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
            res.end(data ?? undefined)
            return
          }
          if (!url.startsWith('/api/')) return next()

          const { getResponse } = await import('msw')
          const origin = `http://${req.headers.host ?? 'localhost'}`
          const headers = new Headers()
          for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value)
          const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : new Uint8Array(await readBody(req))
          const request = new Request(origin + url, { method: req.method, headers, body })
          await new Promise((resolve) => setTimeout(resolve, 300)) // a realistic delay: skeletons and spinners are visible
          const response = await getResponse(await loadHandlers(), request, { baseUrl: origin })
          if (!response) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'not_found' }))
            return
          }
          res.statusCode = response.status
          response.headers.forEach((value, name) => res.setHeader(name, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), process.env.MOCK_API ? mockApi() : null],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: ['.localhost'],
    proxy: process.env.MOCK_API ? undefined : proxy,
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: ['.localhost'],
    proxy,
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change rarely: a separate chunk stays cached across deployments of the shop. The map
        // (MapLibre, ~1 MB) is a chunk of its own, loaded only when the checkout's map opens.
        codeSplitting: {
          groups: [
            { name: 'map', test: /node_modules[\\/]maplibre-gl[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/](?!maplibre-gl[\\/])/ },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1100,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    testTimeout: 15_000,
  },
})
