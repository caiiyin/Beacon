from typing import Literal
from pydantic import BaseModel

SupportedLang = Literal["ko", "en", "vi", "th", "km"]


class WorkerCreate(BaseModel):
    name: str
    preferred_language: SupportedLang = "ko"
    zone: str = "A구역"


class WorkerRead(BaseModel):
    id: int
    name: str
    preferred_language: str
    zone: str

    model_config = {"from_attributes": True}
