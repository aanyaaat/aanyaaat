import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'robots.txt',
      ],
      manifest: {
        name: 'Aanyaa — Offline AI Companion',
        short_name: 'Aanyaa',
        description: 'A warm, personal companion that runs entirely on your device. No internet, no cloud, no tracking.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        background_color: '#FFF8FB',
        theme_color: '#FFF8FB',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,

        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,

        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,json,wasm,data}',
        ],
      },
    }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  optimizeDeps: {
    exclude: [
      'lucide-react',
      '@electric-sql/pglite',
    ],
  },

  build: {
    target: "esnext",

    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          webllm: ["@mlc-ai/web-llm"],
          pglite: ["@electric-sql/pglite"],
        },
      },
    },
  },
});