/**
 * 재사용 가능한 페이지네이션 컴포넌트.
 * 근로자·관리자 양쪽에서 동일하게 사용.
 *
 * Props:
 *   total   - 전체 아이템 수
 *   page    - 현재 페이지 (1부터 시작)
 *   perPage - 페이지당 아이템 수 (기본 5)
 *   onChange(page) - 페이지 변경 콜백
 */
export default function Pagination({ total, page, perPage = 5, onChange }) {
  const totalPages = Math.ceil(total / perPage)
  if (totalPages <= 1) return null

  // 7개 이상이면 앞뒤·가운데만 표시하고 중간에 … 삽입
  function getPageNums() {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const pages = []
    if (page <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i)
      pages.push('…')
      pages.push(totalPages)
    } else if (page >= totalPages - 3) {
      pages.push(1)
      pages.push('…')
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      pages.push('…')
      pages.push(page - 1)
      pages.push(page)
      pages.push(page + 1)
      pages.push('…')
      pages.push(totalPages)
    }
    return pages
  }

  return (
    <div style={s.wrap} role="navigation" aria-label="페이지 이동">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        style={{ ...s.btn, ...(page === 1 ? s.dim : {}) }}
        aria-label="이전 페이지"
      >
        ‹
      </button>

      {getPageNums().map((p, i) =>
        p === '…'
          ? <span key={`e${i}`} style={s.ellipsis}>…</span>
          : <button
              key={p}
              onClick={() => onChange(p)}
              aria-current={p === page ? 'page' : undefined}
              style={{ ...s.btn, ...(p === page ? s.active : {}) }}
            >
              {p}
            </button>
      )}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        style={{ ...s.btn, ...(page === totalPages ? s.dim : {}) }}
        aria-label="다음 페이지"
      >
        ›
      </button>
    </div>
  )
}

const s = {
  wrap: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '1rem 0 0.25rem',
  },
  btn: {
    minWidth: 44,
    height: 44,
    borderRadius: '0.625rem',
    border: '1.5px solid var(--color-border)',
    background: '#fff',
    color: 'var(--color-text)',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background .15s, color .15s',
  },
  active: {
    background: 'var(--color-primary)',
    color: '#fff',
    borderColor: 'var(--color-primary)',
  },
  dim: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  ellipsis: {
    width: 32,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-sub)',
    fontSize: '0.85rem',
    userSelect: 'none',
  },
}
