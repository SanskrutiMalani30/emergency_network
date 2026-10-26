from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID

class TacticalEventResponse(BaseModel):
    event_id: UUID
    incident_id: Optional[UUID] = None
    event_type: str
    title: str
    details: Optional[str] = None
    actor: str
    event_time: datetime
