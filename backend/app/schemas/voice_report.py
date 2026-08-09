from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class VoiceReportCreate(BaseModel):
    worker_id: Optional[int] = None
    worker_lang: str = "ko"


class VoiceReportRead(BaseModel):
    id: int
    worker_id: Optional[int]
    worker_lang: str
    audio_url: Optional[str]
    original_text: Optional[str]
    translated_text: Optional[str]
    admin_reply_ko: Optional[str]
    admin_reply_translated: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdminReplyCreate(BaseModel):
    """관리자가 근로자 신고에 답변할 때 사용하는 스키마"""
    reply_ko: str   # 관리자는 항상 한국어로 입력
