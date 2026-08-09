from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class HazardEvent(Base):
    """A/B 파트에서 수신하는 위험 감지 이벤트"""
    __tablename__ = "hazard_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 이벤트 타입: helmet_missing / vest_missing / restricted_zone / fire_smoke
    type: Mapped[str] = mapped_column(String(50))
    zone: Mapped[str] = mapped_column(String(100))
    # 심각도: low / medium / high / critical
    severity: Mapped[str] = mapped_column(String(20), default="medium")
    # A/B 파트 출처 식별 (나중에 실제 연동 시 구분용)
    source: Mapped[str] = mapped_column(String(50), default="mock")
    detected_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
