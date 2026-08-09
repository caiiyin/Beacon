import { useState, useEffect, useCallback, useRef } from 'react'
import { useLang } from '../../App.jsx'
import { t } from '../../i18n/index.js'
import { getHazardEvents, getVoiceReports, postAdminReply } from '../../api/index.js'
import { useWebSocket } from '../../api/useWebSocket.js'

// ── 상수 ─────────────────────────────────────────────────────────────
const SEV_COLOR = {
  low:      { bg: '#F0FDF4', text: '#166534', border: '#86EFAC' },
  medium:   { bg: '#FFFBEB', text: '#92400E', border: '#FCD34D' },
  high:     { bg: '#FFF7ED', text: '#9A3412', border: '#FDBA74' },
  critical: { bg: '#FEF2F2', text: '#991B1B', border: '#FCA5A5' },
}
const SEV_LABEL   = { low:'낮음', medium:'보통', high:'높음', critical:'긴급' }
const HAZARD_ICON = { helmet_missing:'⛑️', vest_missing:'🦺', restricted_zone:'🚧', fire_smoke:'🔥' }
const SOURCE_ICON = { yolo_camera:'📷', manual:'✍️', mock:'🤖', api:'🔌' }
const STATUS_STYLE = {
  received:   { bg:'#EFF6FF', text:'#1D4ED8', label:'접수' },
  processing: { bg:'#FFFBEB', text:'#92400E', label:'처리중' },
  completed:  { bg:'#F0FDF4', text:'#166534', label:'완료' },
}
const LANG_FLAG = { ko:'🇰🇷', en:'🇺🇸', vi:'🇻🇳', th:'🇹🇭', km:'🇰🇭' }
const REPORT_FILTERS = ['전체', '접수', '처리중', '완료']
const FILTER_STATUS  = { '전체': null, '접수': 'received', '처리중': 'processing', '완료': 'completed' }

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr + 'Z')) / 1000)
  if (diff < 60)   return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff/60)}분 전`
  return `${Math.floor(diff/3600)}시간 전`
}

// ── 토스트 알림 ───────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div style={s.toastWrap}>
      {toasts.map(item => (
        <div key={item.id} style={{ ...s.toast, ...(item.type === 'report' ? s.toastReport : s.toastHazard) }}>
          {item.icon} {item.text}
        </div>
      ))}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { lang }  = useLang()
  const [events,    setEvents]    = useState([])
  const [reports,   setReports]   = useState([])
  const [autoOn,    setAutoOn]    = useState(false)
  const [tab,       setTab]       = useState('events')
  const [wsConn,    setWsConn]    = useState(false)
  const [toasts,    setToasts]    = useState([])
  const [reportFlt, setReportFlt] = useState('전체')
  const [wsStatus,  setWsStatus]  = useState(null)   // { admins, workers }
  const toastId = useRef(0)

  // ── 토스트 표시 헬퍼 ────────────────────────────────────────────────
  const showToast = useCallback((text, icon, type) => {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, text, icon, type }])
    setTimeout(() => setToasts(prev => prev.filter(item => item.id !== id)), 4000)
  }, [])

  // ── 데이터 fetch ─────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [evts, rpts] = await Promise.all([getHazardEvents(), getVoiceReports()])
      setEvents(evts)
      setReports(rpts)
    } catch { /* 서버 미연결 무시 */ }
  }, [])

  const fetchWsStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ws/status')
      if (res.ok) setWsStatus(await res.json())
    } catch { /* 무시 */ }
  }, [])

  // 마운트 시 자동생성 상태 서버와 동기화
  useEffect(() => {
    fetchAll()
    fetch('/api/hazard-events/mock/auto/status')
      .then(r => r.json())
      .then(d => setAutoOn(d.running))
      .catch(() => {})
    fetchWsStatus()
  }, [fetchAll, fetchWsStatus])

  // 5초 폴링 (WS 끊김 안전망)
  useEffect(() => {
    const id = setInterval(() => { fetchAll(); fetchWsStatus() }, 5000)
    return () => clearInterval(id)
  }, [fetchAll, fetchWsStatus])

  // ── WebSocket: 관리자 채널 ───────────────────────────────────────────
  const handleWsMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'connected':
        setWsConn(true)
        break
      case 'new_hazard_event':
        setEvents(prev => {
          if (prev.some(e => e.id === msg.id)) return prev
          return [{
            id: msg.id, type: msg.event_type, zone: msg.zone,
            severity: msg.severity, source: msg.source,
            detected_at: msg.detected_at, created_at: msg.detected_at,
          }, ...prev].slice(0, 50)
        })
        showToast(
          `${HAZARD_ICON[msg.event_type]||'⚠️'} ${msg.zone} — ${SEV_LABEL[msg.severity]||msg.severity}`,
          '📡', 'hazard'
        )
        break
      case 'new_voice_report':
        fetchAll()
        setTab('reports')
        showToast(`새 음성 신고 접수 (${msg.worker_lang?.toUpperCase()})`, '🎙️', 'report')
        break
      case 'report_updated':
        setReports(prev => prev.map(r =>
          r.id === msg.report_id ? { ...r, status: msg.status } : r
        ))
        break
    }
  }, [fetchAll, showToast])

  const { send: wsSend } = useWebSocket('/ws/admin', handleWsMessage, true, {
    onClose: () => setWsConn(false),
  })

  // 30초마다 ping 전송으로 연결 유지
  useEffect(() => {
    const id = setInterval(() => wsSend('ping'), 30000)
    return () => clearInterval(id)
  }, [wsSend])

  // ── Mock 이벤트 제어 ──────────────────────────────────────────────────
  async function handleGenOne() {
    await fetch('/api/hazard-events/mock/generate', { method: 'POST' })
  }

  async function handleAutoToggle() {
    const url = autoOn
      ? '/api/hazard-events/mock/auto/stop'
      : '/api/hazard-events/mock/auto/start?interval_sec=8'
    await fetch(url, { method: 'POST' })
    setAutoOn(v => !v)
  }

  async function handleMockReport(workerLang) {
    await fetch('/api/voice-reports/mock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_lang: workerLang }),
    })
    setTab('reports')
  }

  // ── 신고 필터링 ──────────────────────────────────────────────────────
  const filterStatus  = FILTER_STATUS[reportFlt]
  const filteredRpts  = filterStatus ? reports.filter(r => r.status === filterStatus) : reports
  const pendingCount  = reports.filter(r => r.status !== 'completed').length

  return (
    <main style={s.main}>
      {/* CSS 애니메이션 */}
      <style>{CSS}</style>
      <Toast toasts={toasts} />

      {/* ── 헤더 ──────────────────────────────────────────────────── */}
      <div style={s.titleRow}>
        <h1 style={s.title}>🛡️ {t(lang, 'adminDashboard')}</h1>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          {wsStatus && (
            <span style={s.connBadge}>
              👷 {wsStatus.total_workers ?? 0} · 🖥️ {wsStatus.admin_connections ?? 0}
            </span>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
            <span style={{ ...s.wsDot, background: wsConn ? '#22C55E' : '#EF4444' }} />
            <span style={s.wsLabel}>{wsConn ? '실시간 연결됨' : '연결 중...'}</span>
          </div>
        </div>
      </div>

      {/* ── 탭 ────────────────────────────────────────────────────── */}
      <div style={s.tabBar}>
        <button style={{ ...s.tab, ...(tab==='events' ? s.tabActive : {}) }} onClick={() => setTab('events')}>
          📡 위험 감지 <span style={s.tabBadge}>{events.length}</span>
        </button>
        <button
          style={{ ...s.tab, ...(tab==='reports' ? s.tabActive : {}), position:'relative' }}
          onClick={() => setTab('reports')}
        >
          🎙️ 음성 신고
          {pendingCount > 0 && <span style={s.redDot}>{pendingCount}</span>}
        </button>
      </div>

      {/* ── 위험 감지 탭 ───────────────────────────────────────────── */}
      {tab === 'events' && (
        <section style={s.section}>
          {/* 컨트롤 바 */}
          <div style={s.mockBar}>
            <button onClick={handleGenOne} style={{ ...s.btn, ...s.btnPrimary }}>
              ⚡ Mock 1개 생성
            </button>
            <button onClick={handleAutoToggle} style={{ ...s.btn, ...(autoOn ? s.btnDanger : s.btnOutline) }}>
              {autoOn ? '⏹ 자동생성 중지' : '▶ 자동생성 (8초)'}
            </button>
            {autoOn && <span style={s.autoBadge}>🔄 자동 생성 중</span>}
          </div>

          {/* 심각도 요약 카드 */}
          <div style={s.statsRow}>
            {['critical','high','medium','low'].map(sev => {
              const cnt = events.filter(e => e.severity === sev).length
              const col = SEV_COLOR[sev]
              return (
                <div key={sev} style={{ ...s.statCard, background: col.bg, borderColor: col.border }}>
                  <span style={{ ...s.statNum, color: col.text }}>{cnt}</span>
                  <span style={{ ...s.statLabel, color: col.text }}>{SEV_LABEL[sev]}</span>
                </div>
              )
            })}
          </div>

          {/* 이벤트 목록 */}
          {events.length === 0
            ? <EmptyCard icon="📡" text="감지된 이벤트가 없습니다" sub="위 버튼으로 Mock 이벤트를 생성해보세요" />
            : <div style={s.list}>
                {events.map(ev => {
                  const col = SEV_COLOR[ev.severity] || SEV_COLOR.medium
                  return (
                    <div key={ev.id} style={{ ...s.card, borderLeftColor: col.border }}>
                      <span style={s.cardIcon}>{HAZARD_ICON[ev.type]||'⚠️'}</span>
                      <div style={s.cardBody}>
                        <span style={s.cardTitle}>{t(lang, `hazardType.${ev.type}`)}</span>
                        <span style={s.cardSub}>📍 {ev.zone}</span>
                      </div>
                      <div style={s.cardRight}>
                        <div style={{ display:'flex', gap:'0.3rem', justifyContent:'flex-end' }}>
                          <span style={{ ...s.badge, background: col.bg, color: col.text, borderColor: col.border }}>
                            {SEV_LABEL[ev.severity]}
                          </span>
                          {ev.source && (
                            <span style={{ ...s.badge, background:'#F8FAFC', color:'#475569', borderColor:'#E2E8F0' }}>
                              {SOURCE_ICON[ev.source]||'📡'} {ev.source}
                            </span>
                          )}
                        </div>
                        <span style={s.time}>{timeAgo(ev.detected_at)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
          }
        </section>
      )}

      {/* ── 음성 신고 탭 ───────────────────────────────────────────── */}
      {tab === 'reports' && (
        <section style={s.section}>
          {/* Mock 신고 버튼 */}
          <div style={s.mockBar}>
            {['vi','th','km','en'].map(l => (
              <button key={l} onClick={() => handleMockReport(l)}
                style={{ ...s.btn, ...s.btnOutline, fontSize:'0.8rem' }}>
                {LANG_FLAG[l]} Mock
              </button>
            ))}
          </div>

          {/* 상태 필터 */}
          <div style={s.filterBar}>
            {REPORT_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setReportFlt(f)}
                style={{ ...s.filterBtn, ...(reportFlt === f ? s.filterBtnActive : {}) }}
              >
                {f}
                {f !== '전체' && (
                  <span style={s.filterCount}>
                    {reports.filter(r => r.status === FILTER_STATUS[f]).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 신고 목록 */}
          {filteredRpts.length === 0
            ? <EmptyCard icon="🎙️" text={reportFlt === '전체' ? '접수된 신고가 없습니다' : `${reportFlt} 상태의 신고가 없습니다`}
                         sub={reportFlt === '전체' ? '위 버튼으로 Mock 신고를 생성해보세요' : undefined} />
            : <div style={s.list}>
                {filteredRpts.map(r => <ReportCard key={r.id} report={r} onReply={fetchAll} />)}
              </div>
          }
        </section>
      )}
    </main>
  )
}

// ── 신고 카드 ─────────────────────────────────────────────────────────
function ReportCard({ report, onReply }) {
  const [reply,    setReply]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [expanded, setExpanded] = useState(report.status !== 'completed')
  const st = STATUS_STYLE[report.status] || STATUS_STYLE.received

  async function handleSubmitReply() {
    if (!reply.trim()) return
    setSending(true)
    try {
      await postAdminReply(report.id, { reply_ko: reply })
      setReply('')
      onReply()
    } finally { setSending(false) }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitReply()
  }

  return (
    <div style={s.reportCard}>
      <div style={s.reportHeader} onClick={() => setExpanded(e => !e)}>
        <span style={s.cardIcon}>{LANG_FLAG[report.worker_lang]||'🌐'}</span>
        <div style={s.cardBody}>
          <span style={s.cardTitle}>신고 #{report.id} · {report.worker_lang.toUpperCase()}</span>
          <span style={s.cardSub}>{timeAgo(report.created_at)}</span>
        </div>
        <div style={s.cardRight}>
          <span style={{ ...s.badge, background: st.bg, color: st.text, borderColor: st.bg }}>
            {st.label}
          </span>
          <span style={s.time}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={s.reportBody}>
          {/* 근로자 원문 */}
          <div style={s.reportSection}>
            <span style={s.reportLabel}>🗣 근로자 원문 ({report.worker_lang.toUpperCase()})</span>
            <p style={s.reportText}>{report.original_text || '—'}</p>
          </div>

          {/* 한국어 번역 */}
          <div style={s.reportSection}>
            <span style={s.reportLabel}>🇰🇷 한국어 번역</span>
            <p style={{ ...s.reportText, fontWeight:600 }}>{report.translated_text || '—'}</p>
          </div>

          {/* 관리자 답변 (이미 작성된 경우) */}
          {report.admin_reply_ko && (
            <div style={s.replyDone}>
              <div style={s.replyDoneRow}>
                <span style={{ ...s.reportLabel, color:'#166534' }}>✅ 관리자 답변 (한국어)</span>
                <p style={s.reportText}>{report.admin_reply_ko}</p>
              </div>
              <div style={s.replyDoneRow}>
                <span style={{ ...s.reportLabel, color:'#166534' }}>
                  → 근로자 전달 ({report.worker_lang.toUpperCase()})
                </span>
                <p style={{ ...s.reportText, color:'#166534' }}>{report.admin_reply_translated}</p>
              </div>
            </div>
          )}

          {/* 답변 입력 (미완료 신고) */}
          {report.status !== 'completed' && (
            <div style={s.replyBox}>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="한국어로 답변을 입력하세요 (⌘+Enter 전송)"
                style={s.replyTextarea}
                rows={3}
              />
              <button
                onClick={handleSubmitReply}
                disabled={sending || !reply.trim()}
                style={{ ...s.btn, ...s.btnPrimary, width:'100%', opacity: (sending || !reply.trim()) ? 0.5 : 1 }}
              >
                {sending ? '전송 중...' : '📨 답변 전송 (자동 번역됨)'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyCard({ icon, text, sub }) {
  return (
    <div style={s.emptyCard}>
      <span style={{ fontSize:'2rem' }}>{icon}</span>
      <p style={s.emptyText}>{text}</p>
      {sub && <p style={{ ...s.emptyText, fontSize:'0.78rem' }}>{sub}</p>}
    </div>
  )
}

// ── CSS 애니메이션 ──────────────────────────────────────────────────
const CSS = `
  @keyframes slideIn {
    from { opacity:0; transform:translateX(20px) }
    to   { opacity:1; transform:translateX(0) }
  }
`

// ── 스타일 ────────────────────────────────────────────────────────────
const s = {
  main:       { padding:'1rem', display:'flex', flexDirection:'column', gap:'1rem' },
  titleRow:   { display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem' },
  title:      { fontSize:'1.2rem', fontWeight:800 },
  wsDot:      { width:10, height:10, borderRadius:'50%', flexShrink:0 },
  wsLabel:    { fontSize:'0.75rem', color:'var(--color-text-sub)' },
  connBadge:  { fontSize:'0.72rem', color:'var(--color-text-sub)', background:'#F1F5F9', borderRadius:'2rem', padding:'0.2rem 0.6rem' },

  toastWrap:   { position:'fixed', top:'4.5rem', right:'1rem', zIndex:999, display:'flex', flexDirection:'column', gap:'0.5rem', maxWidth:300 },
  toast:       { padding:'0.6rem 1rem', borderRadius:'0.75rem', fontSize:'0.85rem', fontWeight:600, boxShadow:'0 4px 16px rgba(0,0,0,.12)', animation:'slideIn .25s ease' },
  toastHazard: { background:'#FEF2F2', color:'#991B1B', border:'1px solid #FCA5A5' },
  toastReport: { background:'#EFF6FF', color:'#1D4ED8', border:'1px solid #BFDBFE' },

  tabBar:    { display:'flex', gap:'0.5rem' },
  tab:       { flex:1, padding:'0.6rem', borderRadius:'0.75rem', fontSize:'0.85rem', fontWeight:600, cursor:'pointer', background:'#fff', color:'var(--color-text-sub)', border:'1.5px solid var(--color-border)', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' },
  tabActive: { background:'var(--color-primary)', color:'#fff', border:'1.5px solid var(--color-primary)' },
  tabBadge:  { background:'rgba(255,255,255,.3)', borderRadius:'2rem', padding:'0 0.4rem', fontSize:'0.75rem' },
  redDot:    { position:'absolute', top:-6, right:-6, background:'var(--color-danger)', color:'#fff', borderRadius:'50%', width:18, height:18, fontSize:'0.7rem', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' },

  section:   { display:'flex', flexDirection:'column', gap:'0.75rem' },
  mockBar:   { display:'flex', gap:'0.5rem', flexWrap:'wrap', alignItems:'center' },
  autoBadge: { fontSize:'0.75rem', color:'var(--color-primary-dark)', fontWeight:600, animation:'pulse 1.5s ease infinite' },

  btn:        { padding:'0.5rem 0.875rem', borderRadius:'var(--radius-btn)', fontSize:'0.85rem', fontWeight:600, cursor:'pointer', border:'1.5px solid transparent', transition:'opacity .15s' },
  btnPrimary: { background:'var(--color-primary)', color:'#fff' },
  btnOutline: { background:'#fff', color:'var(--color-primary)', borderColor:'var(--color-primary)' },
  btnDanger:  { background:'var(--color-danger)', color:'#fff' },

  filterBar:      { display:'flex', gap:'0.4rem', flexWrap:'wrap' },
  filterBtn:      { padding:'0.35rem 0.75rem', borderRadius:'2rem', fontSize:'0.8rem', fontWeight:600, cursor:'pointer', background:'#fff', color:'var(--color-text-sub)', border:'1.5px solid var(--color-border)', display:'flex', alignItems:'center', gap:'0.3rem' },
  filterBtnActive:{ background:'var(--color-primary-light)', color:'var(--color-primary-dark)', border:'1.5px solid var(--color-primary)' },
  filterCount:    { background:'var(--color-primary-light)', color:'var(--color-primary-dark)', borderRadius:'2rem', padding:'0 0.4rem', fontSize:'0.72rem', fontWeight:700 },

  statsRow: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.5rem' },
  statCard: { borderRadius:'0.75rem', padding:'0.75rem 0.5rem', textAlign:'center', border:'1.5px solid', display:'flex', flexDirection:'column', gap:'0.2rem' },
  statNum:  { fontSize:'1.5rem', fontWeight:800 },
  statLabel:{ fontSize:'0.72rem', fontWeight:600 },

  list:     { display:'flex', flexDirection:'column', gap:'0.5rem' },
  card:     { background:'#fff', borderRadius:'0.875rem', padding:'0.875rem 1rem', boxShadow:'var(--shadow-card)', borderLeft:'4px solid', display:'flex', alignItems:'center', gap:'0.75rem' },
  cardIcon: { fontSize:'1.4rem', flexShrink:0 },
  cardBody: { flex:1, display:'flex', flexDirection:'column', gap:'0.15rem' },
  cardTitle:{ fontSize:'0.9rem', fontWeight:700 },
  cardSub:  { fontSize:'0.78rem', color:'var(--color-text-sub)' },
  cardRight:{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'0.25rem' },
  badge:    { padding:'0.2rem 0.5rem', borderRadius:'2rem', fontSize:'0.7rem', fontWeight:700, border:'1px solid' },
  time:     { fontSize:'0.72rem', color:'var(--color-text-sub)' },

  emptyCard:{ background:'#fff', borderRadius:'var(--radius-card)', padding:'2rem', textAlign:'center', boxShadow:'var(--shadow-card)', display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem' },
  emptyText:{ color:'var(--color-text-sub)', fontSize:'0.9rem' },

  reportCard:    { background:'#fff', borderRadius:'var(--radius-card)', boxShadow:'var(--shadow-card)', overflow:'hidden' },
  reportHeader:  { display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.875rem 1rem', cursor:'pointer', borderBottom:'1px solid var(--color-border)' },
  reportBody:    { padding:'1rem', display:'flex', flexDirection:'column', gap:'0.75rem' },
  reportSection: { display:'flex', flexDirection:'column', gap:'0.3rem' },
  reportLabel:   { fontSize:'0.75rem', fontWeight:700, color:'var(--color-text-sub)' },
  reportText:    { fontSize:'0.9rem', lineHeight:1.5, margin:0 },
  replyDone:     { background:'#F0FDF4', borderRadius:'0.625rem', padding:'0.75rem', display:'flex', flexDirection:'column', gap:'0.5rem' },
  replyDoneRow:  { display:'flex', flexDirection:'column', gap:'0.2rem' },
  replyBox:      { display:'flex', flexDirection:'column', gap:'0.5rem', borderTop:'1px solid var(--color-border)', paddingTop:'0.75rem' },
  replyTextarea: { width:'100%', padding:'0.75rem', borderRadius:'0.75rem', border:'1.5px solid var(--color-border)', fontSize:'0.9rem', fontFamily:'inherit', resize:'vertical', outline:'none', boxSizing:'border-box', lineHeight:1.5 },
}
