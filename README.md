# Beacon - 스마트 산업안전 플랫폼 (C파트)

화성시 산업단지 외국인 근로자를 위한 AI 기반 다국어 안전 플랫폼

## 빠른 시작

### 백엔드
```bash
cd backend
pip install -r requirements.txt
# .env 파일 확인 (USE_MOCK_AI=true 로 API 키 없이 실행 가능)
uvicorn app.main:app --reload
# → http://localhost:8000
# → API 문서: http://localhost:8000/docs
```

### 프론트엔드
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## 환경 변수 (.env)
`.env.example`을 복사해서 `.env`로 만든 후 필요한 키를 채워넣으세요.

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `USE_MOCK_AI` | true 이면 STT/번역 API 없이 가짜 응답 | `true` |
| `OPENAI_API_KEY` | Whisper STT 사용 시 필요 | - |
| `GOOGLE_TRANSLATE_API_KEY` | Google 번역 사용 시 필요 | - |

## 개발 진행 상황

- [x] **1단계**: 프로젝트 뼈대 세팅
- [ ] **2단계**: Mock 위험 이벤트 생성 + Hazard Events API
- [ ] **3단계**: 번역 서비스 (Google/LibreTranslate)
- [ ] **4단계**: STT 서비스 (Whisper)
- [ ] **5단계**: 음성 신고 전체 플로우
- [ ] **6단계**: WebSocket 실시간 통신
- [ ] **7단계**: React 근로자 화면
- [ ] **8단계**: React 관리자 대시보드
- [ ] **9단계**: 통합 테스트
