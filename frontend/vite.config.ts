/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { config } from 'dotenv'

// Load environment variables from parent directory
config({ path: '../.env' })

// Get frontend configuration from environment variables
const frontendPort = parseInt(process.env.FRONTEND_PORT || '5173', 10)
const frontendHost = process.env.FRONTEND_HOST || 'localhost'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: frontendPort,
    host: frontendHost,
    strictPort: true, // Fail if port is already in use
  },
  preview: {
    port: frontendPort,
    host: frontendHost,
    strictPort: true,
    allowedHosts: ['workbench.lolzlab.com', 'localhost', '192.168.1.110'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{js,ts,tsx}', 'tests/**/*_test.{js,ts,tsx}'],
  },
})
