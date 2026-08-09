import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../../App.jsx'
import { t } from '../../i18n/index.js'
import { getVoiceReports } from '../../api/index.js'
import Pagination from '../../components/Pagination.jsx'

const PER_PAGE = 5
const LANG_FLAG = { ko:'🇰🇷', en:'🇺🇸', vi:'🇻🇳', th:'🇹🇭', km:'🇰🇭' }
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

export default function ReportHistory() {
  const { lang } = useLang()
  const [reports, setReports] = useState([])
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)

  const fetchReports = useCallback(async () => {
    try {
      const data = await getVoiceReports()
      setReports(data)
    } catch { /* 서버 미연결 무시 */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])

  // 페이지 변경 시 목록 상단으로 스크롤
  function handlePageChange(p) {
    setPage(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const paginated = reports.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <main style={s.main}>
      {/* 헤더 */}
      <div style={s.topBar}>
        <Link to="/" style={s.backBtn} aria-label="메인으로 돌아가기">
          ← 돌아가기
        </Link>
        <h1 style={s.title}>📋 {t(lang, 'voiceReports')}</h1>
        <span style={s.count}>{reports.length}건</span>
      </div>

      {loading && <p style={s.loading}>불러오는 중...</p>}

      {!loading && reports.length === 0 && (
        <div style={s.empty}>
          <span style={{ fontSize:'2rem' }}>🎙️</span>
          <p>아직 신고 내역이 없습니다</p>
        </div>
      )}

      {!loading && reports.length > 0 && (
        <>
          <div style={s.list}>
            {paginated.map(r => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.received
              return (
                <div key={r.id} style={s.card}>
                  {/* 카드 헤더 */}
                  <div style={s.cardTop}>
                    <span style={s.cardIcon}>{LANG_FLAG[r.worker_lang]||'🌐'}</span>
                    <div style={s.cardMeta}>
                      <span style={s.cardId}>신고 #{r.id}</span>
                      <span style={s.cardTime}>{timeAgo(r.created_at)}</span>
                    </div>
                    <span style={{ ...s.statusBadge, background: st.bg, color: st.text }}>
                      {st.label}
                    </span>
                  </div>

                  {/* 원문 */}
                  {r.original_text && (
                    <div style={s.section}>
                      <span style={s.label}>🗣 원문 ({r.worker_lang?.toUpperCase()})</span>
                      <p style={s.text}>{r.original_text}</p>
                    </div>
                  )}

                  {/* 한국어 번역 */}
                  {r.translated_text && (
                    <div style={s.section}>
                      <span style={s.label}>🇰🇷 한국어 번역</span>
                      <p style={{ ...s.text, fontWeight: 600 }}>{r.translated_text}</p>
                    </div>
                  )}

                  {/* 관리자 답변 */}
                  {r.admin_reply_translated && (
                    <div style={s.replyBox}>
                      <span style={s.replyLabel}>💬 관리자 답변</span>
                      <p style={s.replyText}>{r.admin_reply_translated}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <Pagination
            total={reports.length}
            page={page}
            perPage={PER_PAGE}
            onChange={handlePageChange}
          />
        </>
      )}
    </main>
  )
}

const s = {
  main:    { padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },

  topBar:  { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' },
  backBtn: {
    display: 'flex', alignItems: 'center',
    height: 44, padding: '0 0.75rem',
    borderRadius: '0.625rem',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary-dark)',
    fontSize: '0.85rem', fontWeight: 700,
    textDecoration: 'none', flexShrink: 0,
  },
  title:   { flex: 1, fontSize: '1rem', fontWeight: 800 },
  count:   { fontSize: '0.8rem', color: 'var(--color-text-sub)', flexShrink: 0 },

  loading: { textAlign: 'center', color: 'var(--color-text-sub)', padding: '2rem 0' },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '0.75rem', padding: '3rem 1rem',
    color: 'var(--color-text-sub)', textAlign: 'center',
  },

  list: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },

  card: {
    background: '#fff',
    borderRadius: 'var(--radius-card)',
    padding: '1rem',
    boxShadow: 'var(--shadow-card)',
    display: 'flex', flexDirection: 'column', gap: '0.625rem',
  },
  cardTop:  { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  cardIcon: { fontSize: '1.5rem', flexShrink: 0 },
  cardMeta: { flex: 1, display: 'flex', flexDirection: 'column', gap: '0.1rem' },
  cardId:   { fontSize: '0.85rem', fontWeight: 700 },
  cardTime: { fontSize: '0.75rem', color: 'var(--color-text-sub)' },
  statusBadge: {
    padding: '0.2rem 0.625rem', borderRadius: '2rem',
    fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
  },

  section: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  label:   { fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-sub)' },
  text:    { fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--color-text)' },

  replyBox: {
    background: '#F0FDF4', borderRadius: '0.625rem',
    padding: '0.625rem 0.75rem',
    display: 'flex', flexDirection: 'column', gap: '0.25rem',
  },
  replyLabel: { fontSize: '0.72rem', fontWeight: 700, color: '#166534' },
  replyText:  { fontSize: '0.875rem', lineHeight: 1.5, color: '#14532D' },
}
