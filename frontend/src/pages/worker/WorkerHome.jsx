import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../../App.jsx'
import { t } from '../../i18n/index.js'
import { getHazardEvents, getVoiceReports } from '../../api/index.js'
import { useWebSocket } from '../../api/useWebSocket.js'
import VoiceRecorder from '../../components/VoiceRecorder.jsx'
import CameraModal from '../../components/CameraModal.jsx'

const DEMO_WORKER_ID = (() => {
  const s = localStorage.getItem('beacon_worker_id')
  if (s) return Number(s)
  const id = Math.floor(Math.random() * 900) + 100
  localStorage.setItem('beacon_worker_id', id)
  return id
})()

const SEV_COLOR = {
  low:      { bg: '#F0FDF4', text: '#166534', dot: '#22C55E', badge: '#BBF7D0' },
  medium:   { bg: '#FFFBEB', text: '#92400E', dot: '#F59E0B', badge: '#FDE68A' },
  high:     { bg: '#FFF7ED', text: '#9A3412', dot: '#F97316', badge: '#FED7AA' },
  critical: { bg: '#FEF2F2', text: '#991B1B', dot: '#EF4444', badge: '#FECACA' },
}
const SEV_LABEL   = { low:'낮음', medium:'보통', high:'높음', critical:'긴급' }
const HAZARD_ICON = { helmet_missing:'⛑️', vest_missing:'🦺', restricted_zone:'🚧', fire_smoke:'🔥' }
const STATUS_STYLE = {
  received:   { bg:'#EFF6FF', text:'#1D4ED8', label:'접수됨' },
  processing: { bg:'#FFFBEB', text:'#92400E', label:'처리중' },
  completed:  { bg:'#F0FDF4', text:'#166534', label:'완료' },
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr + 'Z')) / 1000)
  if (diff < 60)   return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff/60)}분 전`
  return `${Math.floor(diff/3600)}시간 전`
}

function calcSafetyScore(events) {
  const p = { critical:15, high:8, medium:3, low:1 }
  return Math.max(0, 100 - events.slice(0,10).reduce((a,e) => a+(p[e.severity]||0), 0))
}
function scoreGrade(score) {
  if (score >= 90) return { label:'매우 안전', emoji:'🟢' }
  if (score >= 70) return { label:'양호',      emoji:'🟡' }
  if (score >= 50) return { label:'주의',      emoji:'🟠' }
  return              { label:'위험',      emoji:'🔴' }
}

export default function WorkerHome() {
  const { lang } = useLang()
  const [events,  setEvents]  = useState([])
  const [reports, setReports] = useState([])
  const [wsConn,  setWsConn]  = useState(false)
  const [popup,   setPopup]   = useState(null)
  const [showCamera, setShowCamera] = useState(false)
  const popupTimer = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      const [evts, rpts] = await Promise.all([getHazardEvents(), getVoiceReports()])
      setEvents(evts)
      setReports(rpts)
    } catch { /* 서버 미연결 무시 */ }
  }, [])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, 5000)
    return () => clearInterval(id)
  }, [fetchAll])

  const handleWsMsg = useCallback((msg) => {
    if (msg.type === 'connected') setWsConn(true)

    if (msg.type === 'hazard_alert') {
      setEvents(prev => {
        if (prev.some(e => e.id === msg.id)) return prev
        const ev = {
          id: msg.id, type: msg.event_type, zone: msg.zone,
          severity: msg.severity, source: msg.source,
          detected_at: msg.detected_at, created_at: msg.detected_at,
        }
        return [ev, ...prev].slice(0, 50)
      })
      if (msg.severity === 'critical' || msg.severity === 'high') {
        clearTimeout(popupTimer.current)
        setPopup({ icon: HAZARD_ICON[msg.event_type]||'⚠️', zone: msg.zone, severity: msg.severity })
        popupTimer.current = setTimeout(() => setPopup(null), 5000)
      }
    }
    if (msg.type === 'admin_reply') fetchAll()
  }, [fetchAll])

  const { send } = useWebSocket(
    `/ws/worker/${DEMO_WORKER_ID}`, handleWsMsg, true,
    { onClose: () => setWsConn(false) }
  )

  useEffect(() => {
    const id = setInterval(() => send('ping'), 30000)
    return () => clearInterval(id)
  }, [send])

  const handleReportComplete = useCallback(() => fetchAll(), [fetchAll])

  const score = calcSafetyScore(events)
  const { label: grade, emoji } = scoreGrade(score)
  const cardGrad = score >= 70
    ? 'linear-gradient(135deg,#0ABFBC,#08999A)'
    : score >= 50
      ? 'linear-gradient(135deg,#F59E0B,#D97706)'
      : 'linear-gradient(135deg,#EF4444,#DC2626)'

  const pendingCount = reports.filter(r => r.status !== 'completed').length
  const popupCol = popup ? (SEV_COLOR[popup.severity] || SEV_COLOR.high) : null

  return (
    <main style={s.main}>

      {/* ── 긴급 알림 팝업 ─────────────────────────────────────── */}
      {popup && popupCol && (
        <div style={{ ...s.popup, background: popupCol.bg, borderColor: popupCol.dot }}>
          <span style={s.popupIcon}>{popup.icon}</span>
          <div style={{ flex:1 }}>
            <p style={{ ...s.popupTitle, color: popupCol.text }}>
              {popup.severity === 'critical' ? '🚨 긴급 위험 발생' : '⚠️ 위험 감지'}
            </p>
            <p style={{ ...s.popupSub, color: popupCol.text }}>📍 {popup.zone}</p>
          </div>
          <button onClick={() => setPopup(null)} style={s.popupClose}>✕</button>
        </div>
      )}

      {/* ── 안전 점수 카드 ─────────────────────────────────────── */}
      <div style={{ ...s.scoreCard, background: cardGrad }}>
        <div style={s.scoreTop}>
          <span style={s.scoreLabel}>{t(lang, 'safetyScore')}</span>
          <span style={{ ...s.wsChip, background: wsConn ? 'rgba(255,255,255,.3)' : 'rgba(255,80,80,.4)' }}>
            {wsConn ? '● 실시간' : '○ 연결 중'}
          </span>
        </div>
        <div style={s.scoreRow}>
          <div style={s.scoreCircle}>
            <span style={s.scoreNum}>{score}</span>
            <span style={s.scoreUnit}>점</span>
          </div>
          <div style={s.scoreRight}>
            <span style={s.scoreBadge}>{emoji} {grade}</span>
            <span style={s.scoreSub}>최근 이벤트 {events.length}건 기준</span>
          </div>
        </div>
      </div>

      {/* ── PPE 카메라 탐지 버튼 ──────────────────────────────── */}
      <button style={s.cameraBtn} onClick={() => setShowCamera(true)}>
        <span style={{ fontSize: '1.4rem' }}>📷</span>
        <div style={s.cameraBtnText}>
          <span style={s.cameraBtnTitle}>PPE 안전장비 탐지</span>
          <span style={s.cameraBtnSub}>카메라로 안전모·조끼 착용 확인</span>
        </div>
        <span style={s.cameraBtnArrow}>▶</span>
      </button>

      {showCamera && <CameraModal onClose={() => setShowCamera(false)} />}

      {/* ── 최근 안전 알림 — 가로 슬라이더 ───────────────────── */}
      <section style={s.section}>
        <h2 style={s.sectionTitle}>{t(lang, 'recentAlerts')}</h2>
        {events.length === 0
          ? <div style={s.emptyCard}>
              <span style={{ fontSize:'1.8rem' }}>🔔</span>
              <p style={s.emptyText}>{t(lang, 'noAlerts')}</p>
            </div>
          : <>
              <div className="hide-scrollbar" style={s.slider}>
                {events.slice(0, 15).map(ev => {
                  const col = SEV_COLOR[ev.severity] || SEV_COLOR.medium
                  return (
                    <div key={ev.id} style={{ ...s.sliderCard, background: col.bg }}>
                      <span style={s.sliderIcon}>{HAZARD_ICON[ev.type]||'⚠️'}</span>
                      <span style={{ ...s.sliderType, color: col.text }}>
                        {t(lang, `hazardType.${ev.type}`)}
                      </span>
                      <span style={s.sliderZone} title={ev.zone}>{ev.zone}</span>
                      <span style={{ ...s.sliderBadge, background: col.badge, color: col.text }}>
                        {SEV_LABEL[ev.severity]}
                      </span>
                      <span style={s.sliderTime}>{timeAgo(ev.detected_at)}</span>
                    </div>
                  )
                })}
              </div>
              {events.length > 3 && (
                <p style={s.sliderHint}>← 옆으로 밀어서 더 보기</p>
              )}
            </>
        }
      </section>

      {/* ── 음성 신고 ──────────────────────────────────────────── */}
      <section style={s.section}>
        <h2 style={s.sectionTitle}>{t(lang, 'reportIncident')}</h2>
        <VoiceRecorder lang={lang} workerId={DEMO_WORKER_ID} onComplete={handleReportComplete} />

        {/* 신고내역 보기 버튼 */}
        <Link to="/worker/reports" style={s.historyBtn}>
          📋 신고내역 보기
          {pendingCount > 0 && (
            <span style={s.historyBadge}>{pendingCount}</span>
          )}
        </Link>
      </section>

    </main>
  )
}

const s = {
  main:         { padding:'1rem', display:'flex', flexDirection:'column', gap:'1rem' },
  section:      { display:'flex', flexDirection:'column', gap:'0.625rem' },
  sectionTitle: { fontSize:'1rem', fontWeight:800 },

  popup:      { display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.875rem 1rem', borderRadius:'var(--radius-card)', border:'2px solid', boxShadow:'0 4px 20px rgba(0,0,0,.15)' },
  popupIcon:  { fontSize:'2rem', flexShrink:0 },
  popupTitle: { fontSize:'0.9rem', fontWeight:800, margin:0 },
  popupSub:   { fontSize:'0.8rem', margin:'0.2rem 0 0' },
  popupClose: { fontSize:'1.1rem', background:'none', border:'none', opacity:0.6, flexShrink:0, padding:'0.5rem', cursor:'pointer' },

  scoreCard:   { borderRadius:'var(--radius-card)', padding:'1.25rem 1.5rem', color:'#fff', boxShadow:'0 6px 24px rgba(10,191,188,.25)' },
  scoreTop:    { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' },
  scoreLabel:  { fontSize:'0.85rem', opacity:.9 },
  wsChip:      { fontSize:'0.72rem', fontWeight:700, borderRadius:'2rem', padding:'0.2rem 0.625rem' },
  scoreRow:    { display:'flex', alignItems:'center', gap:'1.5rem' },
  scoreCircle: { display:'flex', alignItems:'baseline', gap:'0.2rem' },
  scoreNum:    { fontSize:'3.5rem', fontWeight:800, lineHeight:1 },
  scoreUnit:   { fontSize:'1.1rem', fontWeight:600 },
  scoreRight:  { display:'flex', flexDirection:'column', gap:'0.4rem' },
  scoreBadge:  { display:'inline-block', background:'rgba(255,255,255,.25)', borderRadius:'2rem', padding:'0.25rem 0.875rem', fontSize:'0.9rem', fontWeight:700 },
  scoreSub:    { fontSize:'0.75rem', opacity:.8 },

  emptyCard: { background:'#fff', borderRadius:'var(--radius-card)', padding:'1.5rem', textAlign:'center', boxShadow:'var(--shadow-card)', display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem' },
  emptyText: { color:'var(--color-text-sub)', fontSize:'0.9rem' },

  /* ── 가로 슬라이더 ── */
  slider: {
    display: 'flex',
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    gap: '0.5rem',
    paddingBottom: '0.25rem',
  },
  sliderCard: {
    /* 3개가 한 화면에 보임 + 살짝 잘려 스크롤 유도 */
    minWidth: 'calc(33.33% - 0.35rem)',
    maxWidth: 'calc(33.33% - 0.35rem)',
    scrollSnapAlign: 'start',
    flexShrink: 0,
    borderRadius: '0.875rem',
    padding: '0.75rem 0.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.3rem',
    boxShadow: '0 2px 8px rgba(0,0,0,.05)',
  },
  sliderIcon:  { fontSize: '1.5rem' },
  sliderType:  { fontSize: '0.68rem', fontWeight:700, textAlign:'center', lineHeight:1.3, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' },
  sliderZone:  { fontSize: '0.65rem', color:'var(--color-text-sub)', textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', width:'100%' },
  sliderBadge: { fontSize: '0.63rem', fontWeight:700, padding:'0.15rem 0.4rem', borderRadius:'2rem', whiteSpace:'nowrap' },
  sliderTime:  { fontSize: '0.62rem', color:'var(--color-text-sub)' },
  sliderHint:  { fontSize:'0.72rem', color:'var(--color-text-sub)', textAlign:'center' },

  /* ── 신고내역 버튼 ── */
  historyBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    height: 48,
    borderRadius: 'var(--radius-btn)',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary-dark)',
    fontSize: '0.9rem',
    fontWeight: 700,
    textDecoration: 'none',
    border: '1.5px solid var(--color-primary)',
    position: 'relative',
  },
  cameraBtn: {
    display: 'flex', alignItems: 'center', gap: '0.875rem',
    padding: '0.875rem 1rem',
    background: 'linear-gradient(135deg, #0ABFBC, #0891B2)',
    border: 'none', borderRadius: 'var(--radius-card)',
    color: '#fff', cursor: 'pointer', width: '100%',
    boxShadow: '0 4px 16px rgba(10,191,188,0.35)',
    textAlign: 'left',
  },
  cameraBtnText:  { display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1 },
  cameraBtnTitle: { fontSize: '0.95rem', fontWeight: 800 },
  cameraBtnSub:   { fontSize: '0.75rem', opacity: 0.85 },
  cameraBtnArrow: { fontSize: '0.85rem', opacity: 0.7 },

  historyBadge: {
    background: 'var(--color-danger)',
    color: '#fff',
    borderRadius: '50%',
    minWidth: 20,
    height: 20,
    fontSize: '0.7rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
  },
}
