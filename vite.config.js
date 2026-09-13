import { defineConfig } from 'vite';

/**
 * NEURO//VOID build config.
 *
 * Design goals:
 *  - Zero runtime dependencies (no CDN, no framework).
 *  - Relative asset URLs so the site works from any static host / sub-path
 *    (Render static sites, GitHub Pages, a USB stick, a local file server).
 *  - Hashed filenames + a small single bundle for fast startup on mobile.
 */
export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        entryFileNames: 'assets/game.[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]'
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // The game is served from localhost, from LAN IPs during play-testing and
    // from the hosted preview proxy, so host checking is deliberately open.
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    globals: false,
    setupFiles: ['tests/setup.js'],
    testTimeout: 20000
  }
});
