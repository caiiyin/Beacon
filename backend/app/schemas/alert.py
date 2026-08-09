from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AlertRead(BaseModel):
    id: int
    hazard_event_id: int
    worker_lang: str
    translated_message: str
    sent_at: datetime
    read_at: Optional[datetime]

    model_config = {"from_attributes": True}
