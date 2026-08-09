import { useEffect, useRef } from 'react'

/**
 * WebSocket 연결 관리 훅.
 *
 * - 자동 재연결 (연결 끊기면 3초 후 재시도)
 * - onMessage 콜백이 매 렌더마다 바뀌어도 재연결 없이 최신 함수 호출
 * - 컴포넌트 언마운트 시 소켓 안전하게 닫음
 *
 * @param {string}   path       WS 경로 (예: '/ws/admin', '/ws/worker/1')
 * @param {Function} onMessage  메시지 수신 시 호출 (JSON 파싱된 객체 전달)
 * @param {boolean}  enabled    false 이면 연결 안 함 (선택)
 */
export function useWebSocket(path, onMessage, enabled = true, { onOpen, onClose } = {}) {
  const wsRef        = useRef(null)
  const onMessageRef = useRef(onMessage)
  const onOpenRef    = useRef(onOpen)
  const onCloseRef   = useRef(onClose)
  const timerRef     = useRef(null)
  const enabledRef   = useRef(enabled)

  // 리렌더 때마다 최신 콜백/플래그를 ref에 저장 (소켓 재연결 없이)
  useEffect(() => { onMessageRef.current = onMessage }, [onMessage])
  useEffect(() => { onOpenRef.current    = onOpen    }, [onOpen])
  useEffect(() => { onCloseRef.current   = onClose   }, [onClose])
  useEffect(() => { enabledRef.current   = enabled   }, [enabled])

  useEffect(() => {
    if (!enabled) return

    function connect() {
      if (!enabledRef.current) return

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const url   = `${proto}://${window.location.host}${path}`
      const ws    = new WebSocket(url)
      wsRef.current = ws

      ws.onopen    = () => onOpenRef.current?.()
      ws.onmessage = (e) => {
        try { onMessageRef.current(JSON.parse(e.data)) } catch { /* JSON 파싱 실패 무시 */ }
      }
      ws.onclose   = () => {
        onCloseRef.current?.()
        // 3초 후 재연결 시도
        timerRef.current = setTimeout(connect, 3000)
      }
      ws.onerror   = () => ws.close()
    }

    connect()

    return () => {
      clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [path, enabled])   // path 가 바뀌면 재연결

  // 서버로 메시지 전송 (ping 등에 활용)
  const send = (data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data))
    }
  }

  return { send, wsRef }
}

/**
 * WebSocket 연결 상태만 추적하는 가벼운 훅.
 * 컴포넌트에서 연결 표시(초록/빨강 점)용으로 사용.
 */
export function useWsStatus(path) {
  const statusRef = useRef('disconnected')
  const [, forceUpdate] = useEffect(() => {}, [])   // 상태 변화 시 리렌더 트리거용

  useEffect(() => {
    let ws, timer

    function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${window.location.host}${path}`)
      ws.onopen    = () => { statusRef.current = 'connected' }
      ws.onclose   = () => { statusRef.current = 'disconnected'; timer = setTimeout(connect, 3000) }
      ws.onerror   = () => ws.close()
      ws.onmessage = () => {}
    }

    connect()
    return () => { clearTimeout(timer); ws?.close() }
  }, [path])

  return statusRef.current
}
