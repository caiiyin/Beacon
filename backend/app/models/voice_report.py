from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class VoiceReport(Base):
    """근로자 음성 사고 신고"""
    __tablename__ = "voice_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    worker_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    worker_lang: Mapped[str] = mapped_column(String(10))         # 신고자 언어 코드
    audio_url: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    original_text: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)   # STT 결과
    translated_text: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True) # 한국어 번역
    admin_reply_ko: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)  # 관리자 한국어 답변
    admin_reply_translated: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True) # 근로자 언어 번역
    # 상태: received(접수) / processing(처리중) / completed(완료)
    status: Mapped[str] = mapped_column(String(20), default="received")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=datetime.utcnow
    )
