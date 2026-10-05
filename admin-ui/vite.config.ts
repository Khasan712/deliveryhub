/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin, type ProxyOptions } from 'vite'

// The backend picks the business from the Host header, so the original host must be kept.
const backend: ProxyOptions = { target: 'http://localhost:8100', changeOrigin: false }
const proxy = { '/api': backend, '/media': backend }

// Every build has its own id; /version.json tells an open page that a newer build is on the server
// (src/lib/updates.ts).
const BUILD_ID = process.env.BUILD_ID ?? Date.now().toString(36)

function versionFile(): Plugin {
  return {
    name: 'admin-ui:version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
    },
  }
}

/** `npm run dev:mock` serves the MSW service worker so the UI runs on mocked API data (dev only). */
function mockServiceWorker(): Plugin {
  const require = createRequire(import.meta.url)
  return {
    name: 'admin-ui:mock-service-worker',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/mockServiceWorker.js', (_request, response) => {
        response.setHeader('Content-Type', 'text/javascript')
        response.end(readFileSync(require.resolve('msw/mockServiceWorker.js')))
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), versionFile(), mode === 'mock' && mockServiceWorker()],
  define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(BUILD_ID) },
  server: {
    port: 5174,
    strictPort: true,
    host: true,
    allowedHosts: ['.localhost'],
    proxy,
  },
  preview: {
    port: 5174,
    host: true,
    allowedHosts: ['.localhost'],
    proxy,
  },
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        // Libraries change rarely: keep them apart from the app code so they stay cached across deploys.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/ },
            { name: 'query', test: /node_modules[\\/]@tanstack[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    testTimeout: 15_000,
    // Node 22+ has its own (file-backed) localStorage that would shadow jsdom's.
    execArgv: process.allowedNodeEnvironmentFlags.has('--no-experimental-webstorage') ? ['--no-experimental-webstorage'] : [],
  },
}))
