from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class Worker(Base):
    """근로자 기본 정보"""
    __tablename__ = "workers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    # 선호 언어: ko / en / vi / th / km
    preferred_language: Mapped[str] = mapped_column(String(10), default="ko")
    zone: Mapped[str] = mapped_column(String(100), default="A구역")
