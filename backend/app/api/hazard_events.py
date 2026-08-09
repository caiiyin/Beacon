"""
위험 감지 이벤트 라우트.

A/B 파트 연동 인터페이스:
  POST /api/hazard-events ← A/B 파트가 이 URL로 요청을 보내면 바로 연동 완료
"""
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.db import get_db, AsyncSessionLocal
from app.models.hazard import HazardEvent
from app.schemas.hazard import HazardEventCreate, HazardEventRead
from app.services.mock_hazard_generator import (
    generate_mock_event, start_auto_generation,
    stop_auto_generation, is_auto_running,
)
from app.api.websocket import manager

router = APIRouter(prefix="/api/hazard-events", tags=["위험 감지 이벤트"])


# ── 공통 저장 + WebSocket 브로드캐스트 ────────────────────────────────
async def _save_event(payload: HazardEventCreate) -> HazardEvent:
    """이벤트 DB 저장 → 관리자·근로자 전체 WebSocket 알림."""
    async with AsyncSessionLocal() as db:
        event = HazardEvent(
            type=payload.type, zone=payload.zone,
            severity=payload.severity, source=payload.source,
            detected_at=payload.detected_at or datetime.utcnow(),
        )
        db.add(event)
        await db.commit()
        await db.refresh(event)

    ws_payload = {
        "type":        "new_hazard_event",
        "id":          event.id,
        "event_type":  event.type,
        "zone":        event.zone,
        "severity":    event.severity,
        "source":      event.source,
        "detected_at": event.detected_at.isoformat(),
    }
    # 관리자 대시보드 업데이트
    await manager.broadcast_admin(ws_payload)
    # 근로자 화면 실시간 알림 (전체 브로드캐스트)
    await manager.broadcast_all_workers({**ws_payload, "type": "hazard_alert"})

    return event


# ── A/B 파트 연동 엔드포인트 ──────────────────────────────────────────

@router.post("", response_model=HazardEventRead, summary="위험 감지 이벤트 수신")
async def create_hazard_event(payload: HazardEventCreate):
    """
    A/B 파트(또는 mock)가 보낸 이벤트를 저장하고 실시간으로 전파한다.
    스키마(HazardEventCreate)만 맞으면 출처에 상관없이 동일하게 처리.
    """
    return await _save_event(payload)


@router.get("", response_model=list[HazardEventRead], summary="최근 이벤트 목록 조회")
async def list_hazard_events(limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(HazardEvent).order_by(desc(HazardEvent.detected_at)).limit(limit)
    )
    return result.scalars().all()


# ── Mock 전용 엔드포인트 ──────────────────────────────────────────────

@router.post("/mock/generate", response_model=HazardEventRead, summary="Mock 이벤트 1개 즉시 생성")
async def mock_generate_one():
    return await _save_event(generate_mock_event())


@router.post("/mock/auto/start", summary="Mock 자동 생성 시작")
async def mock_auto_start(interval_sec: int = 10):
    if is_auto_running():
        return {"status": "already_running", "interval_sec": interval_sec}
    start_auto_generation(interval_sec, _save_event)
    return {"status": "started", "interval_sec": interval_sec}


@router.post("/mock/auto/stop", summary="Mock 자동 생성 중지")
async def mock_auto_stop():
    return {"status": "stopped" if stop_auto_generation() else "not_running"}


@router.get("/mock/auto/status", summary="Mock 자동 생성 상태 확인")
async def mock_auto_status():
    return {"running": is_auto_running()}
