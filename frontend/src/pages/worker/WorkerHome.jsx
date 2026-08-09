import { useState, useEffect, useCallback, useRef } from 'react'
import { useLang } from '../../App.jsx'
import { t } from '../../i18n/index.js'
import { getHazardEvents, getVoiceReports } from '../../api/index.js'
import { useWebSocket } from '../../api/useWebSocket.js'
import VoiceRecorder from '../../components/VoiceRecorder.jsx'

// 로그인 구현 전 임시 worker_id (브라우저별로 고정)
const DEMO_WORKER_ID = (() => {
  const stored = localStorage.getItem('beacon_worker_id')
  if (stored) return Number(stored)
  const id = Math.floor(Math.random() * 900) + 100
  localStorage.setItem('beacon_worker_id', id)
  return id
})()

const SEV_COLOR = {
  low:      { bg: '#F0FDF4', text: '#166534', dot: '#22C55E' },
  medium:   { bg: '#FFFBEB', text: '#92400E', dot: '#F59E0B' },
  high:     { bg: '#FFF7ED', text: '#9A3412', dot: '#F97316' },
  critical: { bg: '#FEF2F2', text: '#991B1B', dot: '#EF4444' },
}
const HAZARD_ICON  = { helmet_missing:'⛑️', vest_missing:'🦺', restricted_zone:'🚧', fire_smoke:'🔥' }
const STATUS_STYLE = {
  received:   { bg: '#EFF6FF', text: '#1D4ED8', label: '접수됨' },
  processing: { bg: '#FFFBEB', text: '#92400E', label: '처리중' },
  completed:  { bg: '#F0FDF4', text: '#166534', label: '완료' },
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
  if (score >= 90) return { label: '매우 안전', emoji: '🟢' }
  if (score >= 70) return { label: '양호',     emoji: '🟡' }
  if (score >= 50) return { label: '주의',     emoji: '🟠' }
  return              { label: '위험',     emoji: '🔴' }
}

export default function WorkerHome() {
  const { lang }  = useLang()
  const [events,  setEvents]  = useState([])
  const [reports, setReports] = useState([])
  const [wsConn,  setWsConn]  = useState(false)
  const [popup,   setPopup]   = useState(null)   // 긴급 알림 팝업
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

  // ── WebSocket: 근로자 채널 ────────────────────────────────────────
  const handleWsMsg = useCallback((msg) => {
    if (msg.type === 'connected') {
      setWsConn(true)
    }
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

  const { send } = useWebSocket(`/ws/worker/${DEMO_WORKER_ID}`, handleWsMsg)

  useEffect(() => {
    const id = setInterval(() => send('ping'), 30000)
    return () => clearInterval(id)
  }, [send])

  // VoiceRecorder 완료 콜백
  const handleReportComplete = useCallback(() => { fetchAll() }, [fetchAll])

  const score = calcSafetyScore(events)
  const { label: grade, emoji } = scoreGrade(score)
  const cardGrad = score >= 70
    ? 'linear-gradient(135deg,#0ABFBC,#08999A)'
    : score >= 50
      ? 'linear-gradient(135deg,#F59E0B,#D97706)'
      : 'linear-gradient(135deg,#EF4444,#DC2626)'

  const myReports = reports.slice(0, 3)
  const popupCol  = popup ? (SEV_COLOR[popup.severity] || SEV_COLOR.high) : null

  return (
    <main style={s.main}>

      {/* ── 긴급 알림 팝업 ───────────────────────────────────────── */}
      {popup && popupCol && (
        <div style={{ ...s.popup, background: popupCol.bg, borderColor: popupCol.border || popupCol.dot }}>
          <span style={s.popupIcon}>{popup.icon}</span>
          <div style={{ flex: 1 }}>
            <p style={{ ...s.popupTitle, color: popupCol.text }}>
              {popup.severity === 'critical' ? '🚨 긴급 위험 발생' : '⚠️ 위험 감지'}
            </p>
            <p style={{ ...s.popupSub, color: popupCol.text }}>📍 {popup.zone}</p>
          </div>
          <button onClick={() => setPopup(null)} style={s.popupClose}>✕</button>
        </div>
      )}

      {/* ── 안전 점수 카드 ───────────────────────────────────────── */}
      <div style={{ ...s.scoreCard, background: cardGrad }}>
        <div style={s.scoreTop}>
          <span style={s.scoreLabel}>{t(lang, 'safetyScore')}</span>
          <span style={{ ...s.wsChip, background: wsConn ? 'rgba(255,255,255,.3)' : 'rgba(255,100,100,.4)' }}>
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

      {/* ── 최근 안전 알림 ───────────────────────────────────────── */}
      <section style={s.section}>
        <h2 style={s.sectionTitle}>{t(lang, 'recentAlerts')}</h2>
        {events.length === 0
          ? <div style={s.emptyCard}>
              <span style={{ fontSize:'1.8rem' }}>🔔</span>
              <p style={s.emptyText}>{t(lang, 'noAlerts')}</p>
            </div>
          : <div style={s.list}>
              {events.slice(0,5).map(ev => {
                const col = SEV_COLOR[ev.severity] || SEV_COLOR.medium
                return (
                  <div key={ev.id} style={{ ...s.alertCard, background: col.bg }}>
                    <span style={{ ...s.dot, background: col.dot }} />
                    <span style={s.alertIcon}>{HAZARD_ICON[ev.type]||'⚠️'}</span>
                    <div style={s.alertBody}>
                      <span style={{ ...s.alertType, color: col.text }}>
                        {t(lang, `hazardType.${ev.type}`)}
                      </span>
                      <span style={s.alertSub}>📍 {ev.zone}</span>
                    </div>
                    <span style={s.alertTime}>{timeAgo(ev.detected_at)}</span>
                  </div>
                )
              })}
              {events.length > 5 && <p style={s.moreText}>+ {events.length-5}건 더</p>}
            </div>
        }
      </section>

      {/* ── 음성 신고 ────────────────────────────────────────────── */}
      <section style={s.section}>
        <h2 style={s.sectionTitle}>{t(lang, 'reportIncident')}</h2>
        <VoiceRecorder
          lang={lang}
          workerId={DEMO_WORKER_ID}
          onComplete={handleReportComplete}
        />
      </section>

      {/* ── 내 신고 내역 ─────────────────────────────────────────── */}
      {myReports.length > 0 && (
        <section style={s.section}>
          <h2 style={s.sectionTitle}>📋 신고 내역</h2>
          <div style={s.list}>
            {myReports.map(r => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.received
              return (
                <div key={r.id} style={s.reportCard}>
                  <div style={s.reportTop}>
                    <span style={s.alertIcon}>🎙️</span>
                    <div style={s.alertBody}>
                      <span style={s.alertType}>
                        {(r.original_text || '').slice(0, 40)}{r.original_text?.length > 40 ? '…' : ''}
                      </span>
                      <span style={s.alertSub}>{timeAgo(r.created_at)}</span>
                    </div>
                    <span style={{ ...s.statusChip, background: st.bg, color: st.text }}>
                      {st.label}
                    </span>
                  </div>
                  {r.admin_reply_translated && (
                    <div style={s.replyBox}>
                      <span style={s.replyLabel}>💬 {t(lang, 'adminMenu')} 답변</span>
                      <p style={s.replyText}>{r.admin_reply_translated}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

    </main>
  )
}

// ── 스타일 ────────────────────────────────────────────────────────────
const s = {
  main:    { padding:'1rem', display:'flex', flexDirection:'column', gap:'1rem' },
  section: { display:'flex', flexDirection:'column', gap:'0.75rem' },
  sectionTitle: { fontSize:'1rem', fontWeight:700 },

  popup:      { display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.875rem 1rem', borderRadius:'var(--radius-card)', border:'2px solid', boxShadow:'0 4px 20px rgba(0,0,0,.15)' },
  popupIcon:  { fontSize:'2rem', flexShrink:0 },
  popupTitle: { fontSize:'0.9rem', fontWeight:800, margin:0 },
  popupSub:   { fontSize:'0.8rem', margin:'0.2rem 0 0' },
  popupClose: { fontSize:'1.1rem', cursor:'pointer', background:'none', border:'none', opacity:0.6, flexShrink:0 },

  scoreCard:   { borderRadius:'var(--radius-card)', padding:'1.25rem 1.5rem', color:'#fff', boxShadow:'0 6px 24px rgba(10,191,188,.25)' },
  scoreTop:    { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' },
  scoreLabel:  { fontSize:'0.85rem', opacity:.9 },
  wsChip:      { fontSize:'0.72rem', fontWeight:700, borderRadius:'2rem', padding:'0.2rem 0.6rem' },
  scoreRow:    { display:'flex', alignItems:'center', gap:'1.5rem' },
  scoreCircle: { display:'flex', alignItems:'baseline', gap:'0.2rem' },
  scoreNum:    { fontSize:'3.5rem', fontWeight:800, lineHeight:1 },
  scoreUnit:   { fontSize:'1.1rem', fontWeight:600 },
  scoreRight:  { display:'flex', flexDirection:'column', gap:'0.4rem' },
  scoreBadge:  { display:'inline-block', background:'rgba(255,255,255,.25)', borderRadius:'2rem', padding:'0.25rem 0.875rem', fontSize:'0.9rem', fontWeight:700 },
  scoreSub:    { fontSize:'0.75rem', opacity:.8 },

  emptyCard: { background:'#fff', borderRadius:'var(--radius-card)', padding:'1.5rem', textAlign:'center', boxShadow:'var(--shadow-card)', display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem' },
  emptyText: { color:'var(--color-text-sub)', fontSize:'0.9rem' },

  list:      { display:'flex', flexDirection:'column', gap:'0.5rem' },
  alertCard: { borderRadius:'0.875rem', padding:'0.75rem 1rem', display:'flex', alignItems:'center', gap:'0.6rem', boxShadow:'0 2px 8px rgba(0,0,0,.05)' },
  dot:       { width:8, height:8, borderRadius:'50%', flexShrink:0 },
  alertIcon: { fontSize:'1.25rem', flexShrink:0 },
  alertBody: { flex:1, display:'flex', flexDirection:'column', gap:'0.1rem' },
  alertType: { fontSize:'0.88rem', fontWeight:700 },
  alertSub:  { fontSize:'0.78rem', color:'var(--color-text-sub)' },
  alertTime: { fontSize:'0.72rem', color:'var(--color-text-sub)', flexShrink:0 },
  moreText:  { fontSize:'0.8rem', color:'var(--color-text-sub)', textAlign:'center' },

  reportCard:  { background:'#fff', borderRadius:'0.875rem', padding:'0.875rem 1rem', boxShadow:'var(--shadow-card)', display:'flex', flexDirection:'column', gap:'0.5rem' },
  reportTop:   { display:'flex', alignItems:'center', gap:'0.6rem' },
  statusChip:  { padding:'0.2rem 0.6rem', borderRadius:'2rem', fontSize:'0.72rem', fontWeight:700, flexShrink:0 },
  replyBox:    { background:'#F0FDF4', borderRadius:'0.5rem', padding:'0.6rem 0.75rem', display:'flex', flexDirection:'column', gap:'0.2rem' },
  replyLabel:  { fontSize:'0.72rem', fontWeight:700, color:'#166534' },
  replyText:   { fontSize:'0.88rem', color:'#166534', lineHeight:1.5 },
}
