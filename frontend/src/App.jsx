import { useState, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom'
import { LANGUAGES, t } from './i18n/index.js'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import WorkerHome from './pages/worker/WorkerHome.jsx'
import ReportHistory from './pages/worker/ReportHistory.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'

// 언어 컨텍스트
export const LangContext = createContext({ lang: 'ko', setLang: () => {} })
export const useLang = () => useContext(LangContext)

export default function App() {
  const [lang, setLang] = useState('ko')
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

  return (
    <AuthProvider>
      <LangContext.Provider value={{ lang, setLang }}>
        <BrowserRouter basename={basename}>
          <AppInner />
        </BrowserRouter>
      </LangContext.Provider>
    </AuthProvider>
  )
}

function AppInner() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <Header />
      {/* 헤더 높이(56px)만큼 밀어내어 sticky 헤더 아래부터 콘텐츠 시작 */}
      <div style={{ flex: 1, paddingTop: 'var(--header-h)' }}>
        <Routes>
          <Route path="/" element={
            <ProtectedRoute role="worker"><WorkerHome /></ProtectedRoute>
          } />
          <Route path="/worker/reports" element={
            <ProtectedRoute role="worker"><ReportHistory /></ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>
          } />
          {/* 알 수 없는 경로는 메인으로 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

function Header() {
  const { lang, setLang } = useLang()
  const { role, setRole } = useAuth()
  const navigate = useNavigate()

  function switchRole(newRole) {
    setRole(newRole)
    navigate(newRole === 'admin' ? '/admin' : '/')
  }

  // Beacon 로고 클릭 → 현재 역할의 메인 페이지
  const homeHref = role === 'admin' ? '/admin' : '/'

  return (
    <header style={hd.header}>
      {/* 로고 → 메인 이동 */}
      <Link to={homeHref} style={hd.logo} aria-label="Beacon 홈">
        <span style={hd.logoIcon}>⛑️</span>
        <span style={hd.logoText}>Beacon</span>
      </Link>

      {/* 역할 전환 버튼 (추후 로그인 버튼으로 교체 예정) */}
      <nav style={hd.nav} aria-label="역할 전환">
        <button
          onClick={() => switchRole('worker')}
          style={{ ...hd.roleBtn, ...(role === 'worker' ? hd.roleBtnOn : hd.roleBtnOff) }}
        >
          {t(lang, 'workerMenu')}
        </button>
        <button
          onClick={() => switchRole('admin')}
          style={{ ...hd.roleBtn, ...(role === 'admin' ? hd.roleBtnOn : hd.roleBtnOff) }}
        >
          {t(lang, 'adminMenu')}
        </button>
      </nav>

      {/* 언어 선택 */}
      <select
        value={lang}
        onChange={e => setLang(e.target.value)}
        style={hd.langSel}
        aria-label="언어 선택"
      >
        {LANGUAGES.map(l => (
          <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
        ))}
      </select>
    </header>
  )
}

const hd = {
  header: {
    position: 'fixed',
    top: 0,
    /* #root(max-width 430px)에 맞추어 fixed 헤더도 같은 너비로 제한 */
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100%',
    maxWidth: 430,
    height: 'var(--header-h)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0 1rem',
    background: '#fff',
    borderBottom: '1px solid var(--color-border)',
    zIndex: 200,
    boxShadow: '0 2px 8px rgba(10,191,188,0.10)',
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: '0.375rem',
    flex: 1, minWidth: 0,
    textDecoration: 'none',
  },
  logoIcon: { fontSize: '1.375rem', flexShrink: 0 },
  logoText: {
    fontWeight: 800, fontSize: '1.125rem',
    color: 'var(--color-primary-dark)',
    letterSpacing: '-0.01em',
  },
  nav: { display: 'flex', gap: '0.3rem', flexShrink: 0 },
  roleBtn: {
    height: 44,
    padding: '0 0.625rem',
    borderRadius: '0.625rem',
    fontSize: '0.8rem',
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    transition: 'background .15s, color .15s',
    whiteSpace: 'nowrap',
  },
  roleBtnOn:  { background: 'var(--color-primary)', color: '#fff' },
  roleBtnOff: { background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' },
  langSel: {
    height: 44,
    padding: '0 0.25rem',
    borderRadius: '0.625rem',
    border: '1.5px solid var(--color-border)',
    fontSize: '0.75rem',
    background: '#fff',
    color: 'var(--color-text)',
    cursor: 'pointer',
    flexShrink: 0,
    maxWidth: 68,
  },
}
