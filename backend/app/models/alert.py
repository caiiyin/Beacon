from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Integer, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class Alert(Base):
    """근로자에게 발송된 다국어 알림"""
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    hazard_event_id: Mapped[int] = mapped_column(Integer, ForeignKey("hazard_events.id"))
    worker_lang: Mapped[str] = mapped_column(String(10))       # ko / en / vi / th / km
    translated_message: Mapped[str] = mapped_column(String(500))
    sent_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
