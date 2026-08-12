import { useEffect, useRef, useState } from 'react'

// Beacon 백엔드 /ws/camera 경유 (Cloudflare 터널과 동일 origin)
const PPE_WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/camera`

const CAPTURE_INTERVAL_MS = 500
const CAPTURE_W    = 640
const CAPTURE_H    = 480
const JPEG_QUALITY = 0.8
const RECONNECT_MS = 2000

export default function CameraModal({ onClose }) {
  const videoRef   = useRef(null)
  const overlayRef = useRef(null)
  const captureRef = useRef(null)
  const wsRef      = useRef(null)
  const timerRef   = useRef(null)
  const sendingRef = useRef(false)
  const obsRef     = useRef(null)

  const [status,    setStatus]    = useState('연결 중…')
  const [detCount,  setDetCount]  = useState(0)
  const [connected, setConnected] = useState(false)
  const [detections, setDetections] = useState([])

  /* ── WebSocket ──────────────────────────────────────────── */
  function connectWs() {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const ws = new WebSocket(PPE_WS_URL)
    wsRef.current = ws

    ws.onopen = () => { setConnected(true); setStatus('연결됨') }

    ws.onmessage = (e) => {
      sendingRef.current = false
      try {
        const data = JSON.parse(e.data)
        if (data.error) return
        const dets = data.detections || []
        setDetCount(dets.length)
        setDetections(dets)
        drawBoxes(dets)
      } catch { /* JSON 파싱 실패 무시 */ }
    }

    ws.onclose = () => {
      setConnected(false)
      sendingRef.current = false
      setStatus('재연결 중…')
      setTimeout(connectWs, RECONNECT_MS)
    }
    ws.onerror = () => ws.close()
  }

  /* ── 바운딩박스 그리기 ─────────────────────────────────── */
  function drawBoxes(dets) {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dw = canvas.width
    const dh = canvas.height
    ctx.clearRect(0, 0, dw, dh)

    // object-fit: contain 기준 실제 렌더 영역 계산
    const vAspect = CAPTURE_W / CAPTURE_H
    const cAspect = dw / dh
    let rW, rH, oX, oY
    if (vAspect > cAspect) {
      rW = dw; rH = dw / vAspect; oX = 0; oY = (dh - rH) / 2
    } else {
      rH = dh; rW = dh * vAspect; oX = (dw - rW) / 2; oY = 0
    }
    const sx = rW / CAPTURE_W
    const sy = rH / CAPTURE_H

    ctx.font = 'bold 12px system-ui, sans-serif'
    for (const det of dets) {
      const [x1, y1, x2, y2] = det.bbox
      const color = det.color || '#00BFFF'
      const label = `${det.class_name} ${(det.confidence * 100).toFixed(0)}%`

      const bx = oX + x1 * sx
      const by = oY + y1 * sy
      const bw = (x2 - x1) * sx
      const bh = (y2 - y1) * sy

      ctx.strokeStyle = color
      ctx.lineWidth   = 2.5
      ctx.strokeRect(bx, by, bw, bh)

      const tw = ctx.measureText(label).width
      ctx.fillStyle = color
      ctx.fillRect(bx, by - 20, tw + 10, 20)
      ctx.fillStyle = '#000'
      ctx.fillText(label, bx + 5, by - 5)
    }
  }

  /* ── 캡처 & 전송 ───────────────────────────────────────── */
  function captureAndSend() {
    const video   = videoRef.current
    const capture = captureRef.current
    const ws      = wsRef.current
    if (!video || !capture || !ws) return
    if (ws.readyState !== WebSocket.OPEN) return
    if (sendingRef.current) return
    if (video.readyState < 2) return

    capture.width  = CAPTURE_W
    capture.height = CAPTURE_H
    capture.getContext('2d').drawImage(video, 0, 0, CAPTURE_W, CAPTURE_H)
    ws.send(capture.toDataURL('image/jpeg', JPEG_QUALITY))
    sendingRef.current = true
  }

  /* ── 마운트 ────────────────────────────────────────────── */
  useEffect(() => {
    // 카메라
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(stream => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setStatus('카메라 권한 거부'))

    connectWs()
    timerRef.current = setInterval(captureAndSend, CAPTURE_INTERVAL_MS)

    // 오버레이 크기 동기화
    obsRef.current = new ResizeObserver(() => {
      const v = videoRef.current
      const o = overlayRef.current
      if (!v || !o) return
      const r = v.getBoundingClientRect()
      o.width  = r.width
      o.height = r.height
    })
    if (videoRef.current) obsRef.current.observe(videoRef.current)

    return () => {
      clearInterval(timerRef.current)
      wsRef.current?.close()
      videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())
      obsRef.current?.disconnect()
    }
  }, [])

  /* ── 렌더 ──────────────────────────────────────────────── */
  // 안전 클래스 요약 (Hardhat, Vest → 초록 / NO- → 빨강)
  const safe    = detections.filter(d => !d.class_name.startsWith('NO-') && d.class_name !== 'Person')
  const danger  = detections.filter(d => d.class_name.startsWith('NO-'))

  return (
    <div style={ms.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={ms.modal}>

        {/* 헤더 */}
        <div style={ms.header}>
          <span style={ms.title}>⛑️ PPE 실시간 탐지</span>
          <span style={{
            ...ms.chip,
            background: connected ? '#D1FAE5' : '#FEE2E2',
            color:      connected ? '#065F46' : '#991B1B',
          }}>
            {connected ? `● 탐지 ${detCount}건` : `○ ${status}`}
          </span>
          <button style={ms.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* 비디오 */}
        <div style={ms.videoWrap}>
          <video ref={videoRef} autoPlay muted playsInline style={ms.video} />
          <canvas ref={overlayRef} style={ms.overlay} />
          <canvas ref={captureRef} style={{ display: 'none' }} />
        </div>

        {/* 탐지 결과 요약 */}
        {detections.length > 0 && (
          <div style={ms.summary}>
            {danger.length > 0 && (
              <div style={{ ...ms.summaryBadge, background: '#FEE2E2', color: '#991B1B' }}>
                🚨 미착용 {danger.length}건: {[...new Set(danger.map(d => d.class_name))].join(', ')}
              </div>
            )}
            {safe.length > 0 && (
              <div style={{ ...ms.summaryBadge, background: '#D1FAE5', color: '#065F46' }}>
                ✅ 착용 {safe.length}건: {[...new Set(safe.map(d => d.class_name))].join(', ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const ms = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.88)',
    display: 'flex', alignItems: 'flex-end',
  },
  modal: {
    width: '100%', maxWidth: 430, margin: '0 auto',
    background: '#0a0e1a',
    borderRadius: '1.25rem 1.25rem 0 0',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    maxHeight: '95dvh',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.875rem 1rem',
    borderBottom: '1px solid #1e2a40',
    flexShrink: 0,
  },
  title:    { color: '#e2e8f0', fontWeight: 800, fontSize: '0.95rem', flex: 1 },
  chip: {
    fontSize: '0.72rem', fontWeight: 700,
    padding: '0.25rem 0.75rem', borderRadius: '99px',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    background: 'none', border: 'none',
    color: '#64748b', fontSize: '1.1rem',
    cursor: 'pointer', padding: '0.25rem', flexShrink: 0,
  },
  videoWrap: {
    position: 'relative', background: '#000',
    flex: 1, minHeight: 260,
    display: 'flex', alignItems: 'center',
  },
  video:   { width: '100%', objectFit: 'contain', display: 'block' },
  overlay: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' },
  summary: {
    display: 'flex', flexDirection: 'column', gap: '0.375rem',
    padding: '0.75rem 1rem',
    borderTop: '1px solid #1e2a40',
    flexShrink: 0,
  },
  summaryBadge: {
    borderRadius: '0.625rem', padding: '0.5rem 0.875rem',
    fontSize: '0.8rem', fontWeight: 700,
  },
}
