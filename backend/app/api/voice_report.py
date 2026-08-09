"""
음성 사고 신고 전체 플로우.

흐름:
  근로자: POST /api/voice-reports  (음성 업로드)
    → STT → 한국어 번역 → DB 저장 → 관리자 WebSocket 알림
  관리자: POST /api/voice-reports/{id}/reply  (한국어 답변 입력)
    → 근로자 언어 번역 → DB 갱신 → 근로자 WebSocket 알림
  테스트: POST /api/voice-reports/mock  (실제 파일 없이 전체 파이프라인 확인)
"""
from typing import Optional, Literal
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.voice_report import VoiceReport
from app.schemas.voice_report import VoiceReportRead, AdminReplyCreate
from app.services.stt_service import transcribe, save_audio, USE_MOCK
from app.services.translation_service import translate
from app.api.websocket import manager

router = APIRouter(tags=["음성 신고"])


# ── 근로자: 음성 신고 접수 ────────────────────────────────────────────

@router.post("/api/voice-reports", response_model=VoiceReportRead, summary="음성 신고 접수")
async def create_voice_report(
    file: UploadFile = File(..., description="음성 파일 (wav/mp3/webm/m4a)"),
    worker_lang: Literal["ko", "en", "vi", "th", "km"] = Form(default="ko"),
    worker_id: Optional[int] = Form(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    음성 파일 업로드 → STT → 한국어 번역 → DB 저장 → 관리자 알림.
    USE_MOCK_AI=true 이면 파일 내용 없이도 Mock STT 결과를 반환한다.
    """
    audio_bytes = await file.read()

    # 1. STT: 음성 → 텍스트 (근로자 언어)
    stt_result = await transcribe(audio_bytes, file.filename or "audio.wav", worker_lang)
    original_text = stt_result["text"]

    # 2. 번역: 근로자 언어 → 한국어 (관리자 전달용)
    translated_ko = await translate(original_text, "ko", source_lang=worker_lang)

    # 3. DB 저장 (1차: audio_url 없이 저장해 id 확보)
    report = VoiceReport(
        worker_id=worker_id,
        worker_lang=worker_lang,
        original_text=original_text,
        translated_text=translated_ko,
        status="received",
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    # 4. 음성 파일 저장 (mock 모드에서도 빈 파일로 저장)
    audio_url = save_audio(audio_bytes, file.filename or "audio.wav", report.id)
    report.audio_url = audio_url
    report.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(report)

    # 5. 관리자 WebSocket 알림 (연결된 관리자가 없으면 조용히 무시)
    await manager.broadcast_admin({
        "type":           "new_voice_report",
        "report_id":      report.id,
        "worker_lang":    worker_lang,
        "original_text":  original_text,
        "translated_ko":  translated_ko,
        "created_at":     report.created_at.isoformat(),
    })

    return report


# ── Mock 신고 (파일 없이 파이프라인 전체 테스트) ───────────────────────

class MockReportRequest(BaseModel):
    worker_lang: Literal["ko", "en", "vi", "th", "km"] = "vi"
    worker_id: Optional[int] = None


@router.post("/api/voice-reports/mock", response_model=VoiceReportRead, summary="Mock 신고 접수 (파일 없이)")
async def create_mock_voice_report(
    body: MockReportRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    파일 없이 Mock STT를 사용해 전체 신고 파이프라인을 테스트한다.
    Swagger에서 바로 실행 가능.
    """
    stt_result  = await transcribe(b"", "mock.wav", body.worker_lang)
    original    = stt_result["text"]
    translated  = await translate(original, "ko", source_lang=body.worker_lang)

    report = VoiceReport(
        worker_id=body.worker_id,
        worker_lang=body.worker_lang,
        audio_url=None,
        original_text=original,
        translated_text=translated,
        status="received",
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    await manager.broadcast_admin({
        "type":          "new_voice_report",
        "report_id":     report.id,
        "worker_lang":   body.worker_lang,
        "original_text": original,
        "translated_ko": translated,
        "created_at":    report.created_at.isoformat(),
    })

    return report


# ── 관리자: 신고 목록 조회 ────────────────────────────────────────────

@router.get("/api/voice-reports", response_model=list[VoiceReportRead], summary="신고 목록 조회")
async def list_voice_reports(
    limit: int = 50,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """관리자 대시보드용 신고 목록. status 필터 지원 (received/processing/completed)."""
    q = select(VoiceReport).order_by(desc(VoiceReport.created_at)).limit(limit)
    if status:
        q = q.where(VoiceReport.status == status)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/api/voice-reports/{report_id}", response_model=VoiceReportRead, summary="신고 단건 조회")
async def get_voice_report(report_id: int, db: AsyncSession = Depends(get_db)):
    report = await db.get(VoiceReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="신고를 찾을 수 없습니다.")
    return report


# ── 관리자: 답변 등록 ─────────────────────────────────────────────────

@router.post("/api/voice-reports/{report_id}/reply", response_model=VoiceReportRead, summary="관리자 답변 등록")
async def admin_reply(
    report_id: int,
    body: AdminReplyCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    관리자가 한국어로 답변 입력 → 근로자 언어로 번역 → DB 갱신 → 근로자 알림.
    """
    report = await db.get(VoiceReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="신고를 찾을 수 없습니다.")

    # 1. 상태를 '처리중'으로 갱신
    report.status = "processing"
    await db.commit()

    # 2. 한국어 답변 → 근로자 언어 번역
    translated_reply = await translate(body.reply_ko, report.worker_lang)

    # 3. DB 갱신
    report.admin_reply_ko         = body.reply_ko
    report.admin_reply_translated = translated_reply
    report.status                 = "completed"
    report.updated_at             = datetime.utcnow()
    await db.commit()
    await db.refresh(report)

    # 4. 근로자 WebSocket 알림 (worker_id가 있을 때만)
    if report.worker_id:
        await manager.send_to_worker(report.worker_id, {
            "type":      "admin_reply",
            "report_id": report.id,
            "reply":     translated_reply,
            "status":    "completed",
        })

    # 5. 관리자 대시보드에도 상태 변경 브로드캐스트
    await manager.broadcast_admin({
        "type":      "report_updated",
        "report_id": report.id,
        "status":    "completed",
    })

    return report


# ── STT 테스트 (단독 테스트용, 5단계 이후 제거 가능) ──────────────────

class MockSTTRequest(BaseModel):
    language: Literal["ko", "en", "vi", "th", "km"] = "ko"


@router.post("/api/stt/mock", summary="Mock STT 테스트 (파일 없이)")
async def stt_mock_test(body: MockSTTRequest):
    """파일 없이 언어만 지정하면 Mock STT + 한국어 번역 결과를 반환한다."""
    stt    = await transcribe(b"", "mock.wav", body.language)
    ko     = await translate(stt["text"], "ko", source_lang=body.language)
    return {
        "mock_mode":       USE_MOCK,
        "worker_language": body.language,
        "stt_result":      stt["text"],
        "translated_ko":   ko,
        "pipeline":        "음성 → STT → 한국어 번역 완료",
    }


@router.post("/api/stt/test", summary="실제 음성 파일 STT 테스트")
async def stt_file_test(
    file: UploadFile = File(...),
    language: Literal["ko", "en", "vi", "th", "km"] = Form(default="ko"),
):
    """음성 파일 업로드 → STT → 한국어 번역."""
    audio_bytes = await file.read()
    stt  = await transcribe(audio_bytes, file.filename or "audio.wav", language)
    ko   = await translate(stt["text"], "ko", source_lang=language)
    return {
        "mock_mode":       USE_MOCK,
        "filename":        file.filename,
        "worker_language": language,
        "file_size_bytes": len(audio_bytes),
        "stt_result":      stt["text"],
        "translated_ko":   ko,
    }
