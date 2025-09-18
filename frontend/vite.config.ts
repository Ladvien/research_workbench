/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { config } from 'dotenv'

// Load environment variables from parent directory and local env files
config({ path: '../.env' })

// Get frontend configuration from environment variables
const frontendPort = parseInt(process.env.VITE_PORT || '4511', 10)
const frontendHost = process.env.FRONTEND_HOST || '0.0.0.0'

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
          // Performance optimization: Strategic chunk splitting
          if (id.includes('node_modules')) {
            // Core React libraries - frequently used
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }

            // UI libraries - moderate usage
            if (id.includes('@assistant-ui') || id.includes('lucide-react')) {
              return 'ui-vendor';
            }

            // Markdown rendering - heavy but used frequently
            if (id.includes('react-markdown') || id.includes('remark') || id.includes('rehype')) {
              return 'markdown-vendor';
            }

            // Math rendering - very heavy, separate to enable lazy loading
            if (id.includes('katex') || id.includes('react-katex')) {
              return 'math-vendor';
            }

            // Charts and visualization - optional features
            if (id.includes('recharts') || id.includes('d3')) {
              return 'charts-vendor';
            }

            // Testing utilities - should not be in production
            if (id.includes('vitest') || id.includes('@testing-library')) {
              return 'test-vendor';
            }

            // All other vendor libraries
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
    // Allow requests from these hosts
    hmr: {
      port: frontendPort,
      protocol: 'ws',
      host: 'localhost'
    },
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
        '**/test-utils.ts'
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
