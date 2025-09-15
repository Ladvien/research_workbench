/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { config } from 'dotenv'

// Load environment variables from parent directory and local env files
config({ path: '../.env' })

// Get frontend configuration from environment variables
const frontendPort = parseInt(process.env.FRONTEND_PORT || '5173', 10)
const frontendHost = process.env.FRONTEND_HOST || 'localhost'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Production build optimizations
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false, // Disable sourcemaps in production for smaller bundles
    chunkSizeWarningLimit: 1000, // Increase limit to 1MB
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Create vendor chunk for node_modules
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('recharts')) {
              return 'charts';
            }
            return 'vendor';
          }
        }
      }
    },
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true
  },

  server: {
    port: frontendPort,
    host: frontendHost,
    strictPort: true, // Fail if port is already in use
    proxy: {
      '/api': {
        target: 'http://localhost:4512',
        changeOrigin: true,
        secure: false,
      }
    }
  },

  preview: {
    port: frontendPort,
    host: frontendHost,
    strictPort: true,
    allowedHosts: ['workbench.lolzlab.com', 'localhost', '192.168.1.110'],
    proxy: {
      '/api': {
        target: 'http://localhost:4512',
        changeOrigin: true,
        secure: false,
      }
    }
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{js,ts,tsx}', 'tests/**/*_test.{js,ts,tsx}'],
  },
})
