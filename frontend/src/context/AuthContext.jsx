import { createContext, useContext, useState } from 'react'

/**
 * 역할(role) 상태 관리 컨텍스트.
 *
 * 현재: 헤더의 "근로자 / 관리자" 버튼이 role 값을 직접 변경.
 * 추후: setRole 호출부를 로그인 API 응답으로 교체하면 인증 구조 완성.
 *
 * role: 'worker' | 'admin'
 */
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [role, setRole] = useState('worker')
  return (
    <AuthContext.Provider value={{ role, setRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
