import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 개발 환경(JupyterHub)에서는 프록시 경로를 base로 사용
// 빌드(배포) 시에는 항상 루트(/)를 사용 — FastAPI가 /로 서빙하기 때문
const isDev = process.env.NODE_ENV !== 'production'
const HUB_PREFIX = process.env.JUPYTERHUB_SERVICE_PREFIX
  ? `${process.env.JUPYTERHUB_SERVICE_PREFIX}proxy/5173/`
  : '/'

export default defineConfig({
  plugins: [react()],
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
