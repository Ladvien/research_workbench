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
    // Use happy-dom for better performance (40% faster than jsdom)
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{js,ts,tsx}', 'tests/**/*_test.{js,ts,tsx}'],

    // React 18+ specific configuration
    pool: 'threads', // Better for React 18 concurrent features
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 4,
        useAtomics: true
      }
    },

    // Enhanced test configuration for React 18+
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,

    // Optimized timeouts
    testTimeout: 15000, // Allow more time for React 18 concurrent features
    hookTimeout: 15000,

    // Better error reporting with reduced verbosity
    reporter: ['default'],

    // Performance optimizations
    isolate: false, // Faster test execution
    passWithNoTests: true,

    // Enhanced coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '*.config.ts',
        'tests/**',
        '**/*.test.{js,ts,tsx}',
        '**/*.spec.{js,ts,tsx}',
        '**/test-utils.tsx'
      ],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
})
