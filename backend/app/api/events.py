from fastapi import APIRouter, Query
from typing import List
from ..schemas.events import TacticalEventResponse
from ..db.repository import repository

router = APIRouter(prefix="/events", tags=["Tactical Event Stream"])

@router.get("", response_model=List[TacticalEventResponse])
def get_recent_events(limit: int = Query(50, ge=1, le=200)):
    """Retrieve reverse-chronological tactical event feed."""
    return repository.get_events(limit=limit)
