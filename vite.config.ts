import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
//import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    //vueDevTools(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'GeoMesh3D',
        short_name: 'GeoMesh3D',
        description: 'GeoMesh3D 在线三维几何学习辅助平台',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // 预缓存构建产物：JS/CSS/HTML/字体/本地图片等
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
        // 运行时缓存策略（只缓存图片，不缓存 API，避免不同用户/不同 token 之间读到旧数据）
        runtimeCaching: [
          {
            // 头像、缩略图等后端图片资源
            urlPattern: /\/(?:user\/avatar|thumbnails)\/.+/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'geomesh-images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 天
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('/three/')) return 'three'
          if (id.includes('/vue-router/')) return 'vue-router'
          if (id.includes('/vue/')) return 'vue'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
})
