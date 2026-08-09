from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field

# A/B 파트가 POST로 보내는 이벤트 형식 (인터페이스 고정)
HazardType = Literal[
    "helmet_missing",    # A파트: 안전모 미착용
    "vest_missing",      # A파트: 안전조끼 미착용
    "restricted_zone",   # B파트: 위험구역 출입
    "fire_smoke",        # B파트: 화재·연기
]

SeverityLevel = Literal["low", "medium", "high", "critical"]


class HazardEventCreate(BaseModel):
    """A/B 파트(또는 mock)가 전송하는 위험 감지 이벤트 스키마"""
    type: HazardType
    zone: str = Field(..., description="감지된 구역명 (예: A동 1층)")
    severity: SeverityLevel = "medium"
    source: str = Field(default="mock", description="이벤트 출처 (mock / part_a / part_b)")
    detected_at: Optional[datetime] = None


class HazardEventRead(BaseModel):
    id: int
    type: str
    zone: str
    severity: str
    source: str
    detected_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}
