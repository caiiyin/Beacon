"""
A/B 파트 대체용 Mock 위험 이벤트 생성기.

실제 A/B 파트가 완성되면 이 모듈은 제거하고
hazard_events.py의 POST 엔드포인트에 동일한 스키마로 요청을 보내면 됩니다.
"""
import asyncio
import random
from datetime import datetime

from app.schemas.hazard import HazardEventCreate

# 이벤트 타입별 발생 구역 · 기본 심각도 풀
HAZARD_TEMPLATES = {
    "helmet_missing":  {"zones": ["A동 1층", "B동 2층", "조립라인 3번"],  "severity": "high"},
    "vest_missing":    {"zones": ["C동 출입구", "D동 야적장", "B동 1층"],  "severity": "medium"},
    "restricted_zone": {"zones": ["전기실", "화학물질 보관소", "변전실"],   "severity": "critical"},
    "fire_smoke":      {"zones": ["도장 공정실", "E동 보일러실", "F동 창고"], "severity": "critical"},
}

# 자동 생성 루프 태스크 (싱글턴)
_auto_task: asyncio.Task | None = None


def generate_mock_event() -> HazardEventCreate:
    """무작위 mock 위험 이벤트 하나를 생성한다."""
    event_type = random.choice(list(HAZARD_TEMPLATES.keys()))
    tpl = HAZARD_TEMPLATES[event_type]
    return HazardEventCreate(
        type=event_type,
        zone=random.choice(tpl["zones"]),
        severity=tpl["severity"],
        source="mock",
        detected_at=datetime.utcnow(),
    )


async def _generation_loop(interval_sec: int, save_fn) -> None:
    """interval_sec 마다 이벤트를 생성해 DB에 저장하는 루프."""
    while True:
        await asyncio.sleep(interval_sec)
        event_data = generate_mock_event()
        await save_fn(event_data)


def start_auto_generation(interval_sec: int, save_fn) -> bool:
    """자동 생성 루프를 시작한다. 이미 실행 중이면 False 반환."""
    global _auto_task
    if _auto_task and not _auto_task.done():
        return False
    _auto_task = asyncio.create_task(_generation_loop(interval_sec, save_fn))
    return True


def stop_auto_generation() -> bool:
    """자동 생성 루프를 멈춘다. 실행 중이 아니면 False 반환."""
    global _auto_task
    if _auto_task and not _auto_task.done():
        _auto_task.cancel()
        _auto_task = None
        return True
    return False


def is_auto_running() -> bool:
    return _auto_task is not None and not _auto_task.done()
