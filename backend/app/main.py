"""
Beacon - 스마트 산업안전 플랫폼 백엔드
C파트: FastAPI 메인 엔트리포인트

배포 구조:
  개발: React dev server(5173) + FastAPI(8000) 분리 실행
  데모: React 빌드 후 FastAPI가 /로 서빙 → cloudflared 터널 하나로 통일
"""
import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from app.db import engine, Base
from app.api import hazard_events, alerts, voice_report, websocket

load_dotenv()

# CORS_ORIGINS에 * 또는 특정 URL 목록을 ,로 구분해 .env에 지정 가능
# 미지정 시 데모용으로 전체 허용
_raw_origins = os.getenv("CORS_ORIGINS", "*")
CORS_ORIGINS = ["*"] if _raw_origins == "*" else [o.strip() for o in _raw_origins.split(",")]

# 빌드된 React 앱 경로 (backend/ 기준 ../frontend/dist)
STATIC_DIR = Path(__file__).parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """서버 시작 시 DB 테이블 자동 생성"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ DB 테이블 초기화 완료")
    if STATIC_DIR.exists():
        print(f"🌐 React 정적 파일 서빙 중: {STATIC_DIR}")
    yield


app = FastAPI(
    title="Beacon API",
    description="화성시 스마트 산업안전 플랫폼 - C파트 백엔드",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_ORIGINS != ["*"],   # * 와 credentials 동시 사용 불가
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 등록 (/api/... 경로는 항상 FastAPI가 처리)
app.include_router(hazard_events.router)
app.include_router(alerts.router)
app.include_router(voice_report.router)
app.include_router(websocket.router)


@app.get("/health", tags=["헬스체크"])
async def health():
    return {"status": "ok", "mock_mode": os.getenv("USE_MOCK_AI", "true")}


# ── 프론트엔드 정적 파일 서빙 (빌드 결과물이 있을 때만) ──────────────
# API 라우터 등록 이후에 마운트해야 /api/* 가 가려지지 않음
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    # React Router의 모든 경로를 index.html로 넘겨 SPA 라우팅 지원
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return FileResponse(STATIC_DIR / "index.html")
else:
    @app.get("/", tags=["헬스체크"])
    async def root():
        return {
            "service": "Beacon API",
            "version": "0.1.0",
            "status": "running",
            "hint": "프론트엔드를 보려면 frontend/ 에서 npm run build 실행 후 재시작",
        }
