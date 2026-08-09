import { useState, useEffect, useRef, useCallback } from 'react'
import { t } from '../i18n/index.js'

/**
 * 음성 녹음 → 업로드 → STT → 번역 파이프라인 컴포넌트.
 *
 * 상태 흐름:
 *   idle → requesting → recording → uploading → done
 *                                             → error
 *
 * MediaRecorder 미지원 환경(구형 브라우저)에서는 Mock 모드로 자동 전환.
 */

const STATE = {
  IDLE:       'idle',
  REQUESTING: 'requesting',   // 마이크 권한 요청 중
  RECORDING:  'recording',    // 녹음 중
  UPLOADING:  'uploading',    // 서버 업로드 중
  DONE:       'done',         // 완료
  ERROR:      'error',        // 오류
}

const MAX_SECONDS = 60   // 최대 녹음 시간

/** 브라우저가 지원하는 오디오 MIME 타입 반환 */
function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) || null
}

function mimeToExt(mime) {
  if (!mime) return '.webm'
  if (mime.includes('webm')) return '.webm'
  if (mime.includes('ogg'))  return '.ogg'
  if (mime.includes('mp4'))  return '.mp4'
  return '.wav'
}

export default function VoiceRecorder({ lang, workerId, onComplete }) {
  const [recState, setRecState] = useState(STATE.IDLE)
  const [duration, setDuration] = useState(0)
  const [error,    setError]    = useState(null)
  const [result,   setResult]   = useState(null)

  const recorderRef = useRef(null)
  const chunksRef   = useRef([])
  const streamRef   = useRef(null)
  const timerRef    = useRef(null)
  const mimeType    = useRef(getSupportedMimeType())

  // 컴포넌트 언마운트 시 스트림·타이머 정리
  useEffect(() => () => {
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  // ── 업로드 ───────────────────────────────────────────────────────
  const uploadAudio = useCallback(async (blob) => {
    setRecState(STATE.UPLOADING)
    const ext      = mimeToExt(blob.type)
    const formData = new FormData()
    formData.append('file',        blob, `recording${ext}`)
    formData.append('worker_lang', lang)
    if (workerId) formData.append('worker_id', String(workerId))

    try {
      const res = await fetch('/api/voice-reports', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`서버 오류 ${res.status}`)
      const data = await res.json()
      setResult(data)
      setRecState(STATE.DONE)
      onComplete?.(data)
      // 4초 후 초기 상태로 복귀
      setTimeout(() => { setRecState(STATE.IDLE); setResult(null) }, 4000)
    } catch (e) {
      setError(`업로드 실패: ${e.message}`)
      setRecState(STATE.ERROR)
    }
  }, [lang, workerId, onComplete])

  // ── 녹음 중지 ────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current)
    if (recorderRef.current?.state !== 'inactive') {
      recorderRef.current.stop()   // onstop → uploadAudio 호출
    }
  }, [])

  // ── 녹음 시작 ────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    // MediaRecorder 미지원 → Mock 모드 폴백
    if (!mimeType.current) {
      setRecState(STATE.UPLOADING)
      try {
        const res = await fetch('/api/voice-reports/mock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worker_lang: lang, worker_id: workerId }),
        })
        const data = await res.json()
        setResult(data)
        setRecState(STATE.DONE)
        onComplete?.(data)
        setTimeout(() => { setRecState(STATE.IDLE); setResult(null) }, 4000)
      } catch (e) {
        setError(`Mock 신고 실패: ${e.message}`)
        setRecState(STATE.ERROR)
      }
      return
    }

    setRecState(STATE.REQUESTING)
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream, { mimeType: mimeType.current })
      recorderRef.current = recorder
      chunksRef.current   = []

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stopStream()
        const blob = new Blob(chunksRef.current, { type: mimeType.current })
        uploadAudio(blob)
      }

      recorder.start(200)   // 200ms 단위로 청크 수집
      setRecState(STATE.RECORDING)
      setDuration(0)

      // 초 단위 타이머
      timerRef.current = setInterval(() => {
        setDuration(d => {
          if (d >= MAX_SECONDS - 1) { stopRecording(); return d }
          return d + 1
        })
      }, 1000)

    } catch (e) {
      stopStream()
      const msg = e.name === 'NotAllowedError'
        ? '마이크 권한이 거부되었습니다.\n브라우저 주소창의 🔒 아이콘에서 마이크를 허용해주세요.'
        : `녹음 시작 실패: ${e.message}`
      setError(msg)
      setRecState(STATE.ERROR)
    }
  }, [lang, workerId, onComplete, stopRecording, stopStream, uploadAudio])

  // ── 버튼 클릭 핸들러 ─────────────────────────────────────────────
  function handleClick() {
    if (recState === STATE.IDLE)      startRecording()
    else if (recState === STATE.RECORDING) stopRecording()
    else if (recState === STATE.ERROR) { setRecState(STATE.IDLE); setError(null) }
  }

  const isBusy = recState === STATE.REQUESTING || recState === STATE.UPLOADING

  return (
    <div style={s.wrap}>
      {/* 애니메이션 CSS */}
      <style>{CSS}</style>

      {/* ── 큰 원형 마이크 버튼 ─────────────────────────────────── */}
      <button
        onClick={handleClick}
        disabled={isBusy}
        style={{ ...s.outerRing, ...outerStyle(recState) }}
        aria-label="음성 신고"
      >
        <div style={{ ...s.innerCircle, ...innerStyle(recState) }}>
          <span style={s.icon}>{iconFor(recState)}</span>
        </div>
      </button>

      {/* ── 타이머 (녹음 중만) ─────────────────────────────────── */}
      {recState === STATE.RECORDING && (
        <div style={s.timer}>
          <span style={s.timerDot} /> {formatTime(duration)} / {formatTime(MAX_SECONDS)}
        </div>
      )}

      {/* ── 상태 레이블 ─────────────────────────────────────────── */}
      <p style={{ ...s.label, color: labelColor(recState) }}>{labelFor(recState, lang)}</p>

      {/* ── 오류 메시지 ─────────────────────────────────────────── */}
      {recState === STATE.ERROR && error && (
        <div style={s.errorBox}>
          <p style={s.errorText}>{error}</p>
          <p style={s.errorHint}>탭하여 다시 시도</p>
        </div>
      )}

      {/* ── 완료 결과 요약 ──────────────────────────────────────── */}
      {recState === STATE.DONE && result && (
        <div style={s.resultBox}>
          <p style={s.resultTitle}>✅ 신고가 관리자에게 전달되었습니다</p>
          {result.original_text && (
            <div style={s.resultRow}>
              <span style={s.resultLabel}>🗣 원문</span>
              <span style={s.resultText}>{result.original_text}</span>
            </div>
          )}
          {result.translated_text && (
            <div style={s.resultRow}>
              <span style={s.resultLabel}>🇰🇷 한국어</span>
              <span style={s.resultText}>{result.translated_text}</span>
            </div>
          )}
        </div>
      )}

      {/* ── 안내 문구 (대기 중만) ───────────────────────────────── */}
      {recState === STATE.IDLE && (
        <p style={s.hint}>
          {mimeType.current
            ? '버튼을 눌러 녹음 시작 · 다시 누르면 중지'
            : '⚠️ 이 브라우저는 녹음을 지원하지 않아 Mock 모드로 동작합니다'}
        </p>
      )}
    </div>
  )
}

// ── 상태별 스타일/아이콘/레이블 헬퍼 ────────────────────────────────

function outerStyle(state) {
  const map = {
    [STATE.IDLE]:       { background: 'var(--color-primary-light)', borderColor: 'var(--color-primary)' },
    [STATE.REQUESTING]: { background: '#FFF7ED', borderColor: '#F59E0B' },
    [STATE.RECORDING]:  { background: '#FEE2E2', borderColor: '#EF4444', animation: 'pulseRing 1.5s ease infinite' },
    [STATE.UPLOADING]:  { background: '#EFF6FF', borderColor: '#3B82F6' },
    [STATE.DONE]:       { background: '#F0FDF4', borderColor: '#22C55E' },
    [STATE.ERROR]:      { background: '#FEF2F2', borderColor: '#EF4444' },
  }
  return map[state] || {}
}

function innerStyle(state) {
  const map = {
    [STATE.IDLE]:       { background: 'var(--color-primary)' },
    [STATE.REQUESTING]: { background: '#F59E0B', animation: 'spin 1s linear infinite' },
    [STATE.RECORDING]:  { background: '#EF4444', animation: 'pulse 1s ease infinite' },
    [STATE.UPLOADING]:  { background: '#3B82F6', animation: 'spin 1s linear infinite' },
    [STATE.DONE]:       { background: '#22C55E' },
    [STATE.ERROR]:      { background: '#EF4444' },
  }
  return map[state] || {}
}

function iconFor(state) {
  return { [STATE.IDLE]:'🎤', [STATE.REQUESTING]:'⏳', [STATE.RECORDING]:'⏹',
           [STATE.UPLOADING]:'📡', [STATE.DONE]:'✅', [STATE.ERROR]:'⚠️' }[state] || '🎤'
}

function labelFor(state, lang) {
  return {
    [STATE.IDLE]:       t(lang, 'tapToRecord'),
    [STATE.REQUESTING]: '마이크 권한 요청 중...',
    [STATE.RECORDING]:  t(lang, 'recording'),
    [STATE.UPLOADING]:  t(lang, 'processing'),
    [STATE.DONE]:       t(lang, 'done'),
    [STATE.ERROR]:      '오류 발생 — 탭하여 재시도',
  }[state] || ''
}

function labelColor(state) {
  return { [STATE.RECORDING]:'#EF4444', [STATE.DONE]:'#22C55E', [STATE.ERROR]:'#EF4444' }[state]
    || 'var(--color-primary-dark)'
}

function formatTime(sec) {
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`
}

// ── CSS 애니메이션 ──────────────────────────────────────────────────
const CSS = `
  @keyframes pulse     { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
  @keyframes pulseRing { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)}
                         50%{box-shadow:0 0 0 16px rgba(239,68,68,0)} }
  @keyframes spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
`

// ── 스타일 ─────────────────────────────────────────────────────────
const s = {
  wrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
    padding: '1.75rem 1rem',
    background: '#fff', borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-card)',
  },
  outerRing: {
    width: 120, height: 120, borderRadius: '50%',
    border: '3px solid', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background .2s, border-color .2s',
    background: 'none',
  },
  innerCircle: {
    width: 88, height: 88, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background .2s',
  },
  icon:  { fontSize: '2.4rem', lineHeight: 1 },
  timer: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    fontSize: '1rem', fontWeight: 700, color: '#EF4444',
    letterSpacing: '0.05em',
  },
  timerDot: {
    width: 8, height: 8, borderRadius: '50%',
    background: '#EF4444', animation: 'pulse 1s ease infinite', flexShrink: 0,
  },
  label: { fontSize: '1rem', fontWeight: 700, textAlign: 'center' },
  hint:  { fontSize: '0.78rem', color: 'var(--color-text-sub)', textAlign: 'center', maxWidth: 280 },

  errorBox:  { background: '#FEF2F2', borderRadius: '0.75rem', padding: '0.875rem 1rem', width: '100%', maxWidth: 320 },
  errorText: { fontSize: '0.85rem', color: '#991B1B', whiteSpace: 'pre-line', margin: 0 },
  errorHint: { fontSize: '0.75rem', color: '#B91C1C', margin: '0.4rem 0 0', textAlign: 'center' },

  resultBox: {
    background: '#F0FDF4', borderRadius: '0.875rem',
    padding: '0.875rem 1rem', width: '100%', maxWidth: 360,
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
  },
  resultTitle: { fontSize: '0.9rem', fontWeight: 700, color: '#166534', margin: 0 },
  resultRow:   { display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  resultLabel: { fontSize: '0.72rem', fontWeight: 700, color: '#166534' },
  resultText:  { fontSize: '0.85rem', color: '#14532D', lineHeight: 1.5 },
}
