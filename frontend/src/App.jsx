import { useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { LANGUAGES, t } from './i18n/index.js'

// 페이지 (단계별로 채워질 예정)
import WorkerHome from './pages/worker/WorkerHome.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'

// 언어 설정을 앱 전체에서 공유하기 위한 Context (경량 상태관리)
import { createContext, useContext } from 'react'
export const LangContext = createContext({ lang: 'ko', setLang: () => {} })
export const useLang = () => useContext(LangContext)

export default function App() {
  const [lang, setLang] = useState('ko')

  // JupyterHub 프록시 경로를 Router basename으로 사용
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <BrowserRouter basename={basename}>
        <Header />
        <Routes>
          <Route path="/"       element={<WorkerHome />} />
          <Route path="/admin"  element={<AdminDashboard />} />
        </Routes>
      </BrowserRouter>
    </LangContext.Provider>
  )
}

function Header() {
  const { lang, setLang } = useLang()

  return (
    <header style={styles.header}>
      <div style={styles.logo}>
        <span style={styles.logoIcon}>⛑️</span>
        <span style={styles.logoText}>Beacon</span>
      </div>

      <nav style={styles.nav}>
        <Link to="/"      style={styles.navLink}>{t(lang, 'workerMenu')}</Link>
        <Link to="/admin" style={styles.navLink}>{t(lang, 'adminMenu')}</Link>
      </nav>

      {/* 언어 선택 드롭다운 */}
      <select
        value={lang}
        onChange={e => setLang(e.target.value)}
        style={styles.langSelect}
        aria-label="언어 선택"
      >
        {LANGUAGES.map(l => (
          <option key={l.code} value={l.code}>
            {l.flag} {l.label}
          </option>
        ))}
      </select>
    </header>
  )
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.875rem 1rem',
    background: '#fff',
    borderBottom: '1px solid var(--color-border)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 8px rgba(10,191,188,0.08)',
  },
  logo: { display: 'flex', alignItems: 'center', gap: '0.375rem', flex: 1 },
  logoIcon: { fontSize: '1.375rem' },
  logoText: { fontWeight: 700, fontSize: '1.125rem', color: 'var(--color-primary-dark)' },
  nav: { display: 'flex', gap: '0.5rem' },
  navLink: {
    padding: '0.375rem 0.75rem',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-primary-dark)',
    background: 'var(--color-primary-light)',
    transition: 'opacity .15s',
  },
  langSelect: {
    padding: '0.375rem 0.5rem',
    borderRadius: '0.5rem',
    border: '1.5px solid var(--color-border)',
    fontSize: '0.8rem',
    background: '#fff',
    color: 'var(--color-text)',
    cursor: 'pointer',
  },
}
