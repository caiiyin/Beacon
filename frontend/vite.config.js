import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 개발 환경(JupyterHub)에서는 프록시 경로를 base로 사용
// 빌드(배포) 시에는 항상 루트(/)를 사용 — FastAPI가 /로 서빙하기 때문
const isDev = process.env.NODE_ENV !== 'production'
const HUB_PREFIX = process.env.JUPYTERHUB_SERVICE_PREFIX
  ? `${process.env.JUPYTERHUB_SERVICE_PREFIX}proxy/5173/`
  : '/'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 빌드 결과에 서비스워커·manifest 자동 포함
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Beacon - 다국어 산업안전',
        short_name: 'Beacon',
        description: '외국인 근로자를 위한 다국어 산업안전 플랫폼',
        theme_color: '#0ABFBC',
        background_color: '#F0FAFA',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // 정적 에셋(JS·CSS·이미지) — 캐시 우선 전략
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // API 요청은 캐시하지 않고 항상 네트워크에서 가져옴
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
          {
            // WebSocket은 서비스워커가 관여하지 않음 (ws:// 자동 제외)
            urlPattern: /^\/ws\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  base: isDev ? HUB_PREFIX : '/',
  server: {
    port: 5173,
    // 컨테이너 환경에서 inotify 한계 우회용 polling 감시
    watch: {
      usePolling: true,
      interval: 300,
    },
    // 개발 시 백엔드 API를 프록시로 연결 (CORS 없이 사용 가능)
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
})
