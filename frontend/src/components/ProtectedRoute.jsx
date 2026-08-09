import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

/**
 * 역할 기반 라우트 가드.
 *
 * 현재: role 불일치 시 해당 역할 메인 페이지로 리다이렉트.
 * 추후: role === null (비로그인) 이면 /login 으로 리다이렉트하도록 확장.
 *
 * @param {string} role   - 이 라우트에 접근 가능한 역할 ('worker' | 'admin')
 * @param {ReactNode} children
 */
export default function ProtectedRoute({ role: required, children }) {
  const { role } = useAuth()

  if (role !== required) {
    return <Navigate to={role === 'admin' ? '/admin' : '/'} replace />
  }
  return children
}
