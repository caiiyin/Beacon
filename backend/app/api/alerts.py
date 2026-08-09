"""
다국어 알림 + 번역 테스트 라우트.
"""
from typing import Literal
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.translation_service import translate, build_hazard_alert, USE_MOCK

router = APIRouter(prefix="/api", tags=["번역 · 알림"])

ALL_LANGS = ["ko", "en", "vi", "th", "km"]


class TranslateRequest(BaseModel):
    text: str
    target_lang: Literal["ko", "en", "vi", "th", "km"]
    source_lang: str = "ko"


class HazardAlertRequest(BaseModel):
    event_type: Literal["helmet_missing", "vest_missing", "restricted_zone", "fire_smoke"]
    zone: str
    target_lang: Literal["ko", "en", "vi", "th", "km"] = "en"


@router.post("/translate", summary="텍스트 번역 테스트")
async def translate_text(body: TranslateRequest):
    """임의의 텍스트를 지정 언어로 번역한다. (번역 서비스 동작 확인용)"""
    result = await translate(body.text, body.target_lang, body.source_lang)
    return {
        "source_lang": body.source_lang,
        "target_lang": body.target_lang,
        "original":    body.text,
        "translated":  result,
        "mock_mode":   USE_MOCK,
    }


@router.post("/translate/hazard-alert", summary="위험 이벤트 → 5개 언어 알림 변환")
async def translate_hazard_alert(body: HazardAlertRequest):
    """위험 이벤트 타입과 구역을 받아 5개 언어 알림 문장을 모두 반환한다."""
    alerts = {}
    for lang in ALL_LANGS:
        alerts[lang] = await build_hazard_alert(body.event_type, body.zone, lang)
    return {
        "event_type": body.event_type,
        "zone":       body.zone,
        "alerts":     alerts,
        "mock_mode":  USE_MOCK,
    }


@router.get("/alerts", summary="알림 발송 이력 조회 (구현 예정)")
async def list_alerts():
    return {"message": "6단계 WebSocket 연동 후 이력이 쌓입니다."}
