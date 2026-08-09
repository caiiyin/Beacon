/**
 * 백엔드 API 호출 함수 모음.
 * vite.config.js의 proxy 설정으로 /api → http://localhost:8000/api 자동 연결.
 */

const BASE = ''   // vite proxy 사용 시 빈 문자열 (상대 경로)

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API 오류: ${res.status}`)
  return res.json()
}

// ─── 위험 감지 이벤트 ─────────────────────────────────────────
export const getHazardEvents  = ()       => request('GET',  '/api/hazard-events')
export const postHazardEvent  = (body)   => request('POST', '/api/hazard-events', body)

// ─── 알림 ─────────────────────────────────────────────────────
export const getAlerts        = ()       => request('GET',  '/api/alerts')

// ─── 음성 신고 ────────────────────────────────────────────────
export const getVoiceReports  = ()       => request('GET',  '/api/voice-reports')
export const postAdminReply   = (id, body) => request('POST', `/api/voice-reports/${id}/reply`, body)

// ─── WebSocket 연결 헬퍼 ──────────────────────────────────────
export function openWebSocket(path, onMessage) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${window.location.host}${path}`)
  ws.onmessage = (e) => onMessage(JSON.parse(e.data))
  return ws
}
