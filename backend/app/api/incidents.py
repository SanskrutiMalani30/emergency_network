from fastapi import APIRouter, HTTPException, Query, status
from typing import List, Optional, Union
from uuid import UUID

from ..schemas.incident import (
    IncidentCreate, IncidentResponse, IncidentStatusUpdate,
    SOSCreate, HelpOfferCreate, HelpOfferResponse
)
from ..db.repository import repository
from ..services.ai_triage import ai_engine
from ..schemas.ai import AIAssessmentRequest

router = APIRouter(prefix="/incidents", tags=["Incidents & SOS"])

@router.post("", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
def report_incident(data: IncidentCreate):
    """
    Submit a citizen crisis report.
    Automatically enriches with AI triage score and resource assessment if not pre-computed.
    """
    if not data.ai_assessment or not data.severity:
        assessment = ai_engine.assess_incident(AIAssessmentRequest(
            category=data.category,
            description=data.description,
            people_affected=data.people_affected,
            has_image=bool(data.image_url)
        ))
        data.category = assessment.suggested_category
        data.severity = assessment.severity
        data.urgency = assessment.urgency_score
        data.ai_assessment = f"{assessment.severity} {data.category.capitalize()}"
        data.ai_reason = assessment.ai_reason
        data.ai_confidence = assessment.confidence
        if data.food_needed == 0:
            data.food_needed = assessment.recommended_food
        if data.water_needed == 0:
            data.water_needed = assessment.recommended_water
        if data.shelter_needed == 0:
            data.shelter_needed = assessment.recommended_shelter
        if data.medical_needed == 0:
            data.medical_needed = assessment.recommended_medical

    return repository.create_incident(data)

@router.get("", response_model=List[IncidentResponse])
def list_incidents(
    status: Optional[str] = Query(None, description="Filter by status: PENDING, VERIFIED, DISPATCHED, RESOLVED"),
    category: Optional[str] = Query(None, description="Filter by category: flood, fire, medical, etc."),
    include_demo: bool = Query(True, description="Whether to include seeded demo emergencies")
):
    """Retrieve all operational incidents matching criteria."""
    incidents = repository.list_incidents(status=status, category=category)
    if not include_demo:
        incidents = [inc for inc in incidents if not getattr(inc, "is_demo", False)]
    return incidents

@router.get("/{incident_id}")
def get_incident(incident_id: Union[UUID, str]):
    """Retrieve details of a single incident by UUID or string emergency ID."""
    # Try UUID lookup first
    try:
        u_id = incident_id if isinstance(incident_id, UUID) else UUID(str(incident_id))
        inc = repository.get_incident(u_id)
        if inc:
            return inc
    except (ValueError, TypeError):
        pass

    # Try string emergency lookup
    emg = repository.get_emergency(str(incident_id))
    if emg:
        return emg

    raise HTTPException(status_code=404, detail="Incident not found in tactical registry")

@router.patch("/{incident_id}/status")
def update_status(incident_id: Union[UUID, str], payload: IncidentStatusUpdate):
    """Update status (e.g. from OPEN/PENDING to HELP_OFFERED, RESPONDER_ASSIGNED, or RESOLVED)."""
    # Try UUID update
    try:
        u_id = incident_id if isinstance(incident_id, UUID) else UUID(str(incident_id))
        updated = repository.update_incident_status(
            incident_id=u_id,
            new_status=payload.status,
            actor=payload.actor or "Operator",
            note=payload.note
        )
        if updated:
            return updated
    except (ValueError, TypeError):
        pass

    # Try emergency string update
    updated_emg = repository.update_emergency_status(
        emergency_id=str(incident_id),
        new_status=payload.status,
        actor=payload.actor or "Operator",
        note=payload.note
    )
    if updated_emg:
        return updated_emg

    raise HTTPException(status_code=404, detail="Incident not found")

@router.post("/{incident_id}/help-offers", response_model=HelpOfferResponse, status_code=status.HTTP_201_CREATED)
def submit_help_offer(incident_id: str, payload: HelpOfferCreate):
    """
    Submits a helper's explicit offer to assist with an incident.
    Records capability, confirmation, and updates incident assistance status.
    """
    try:
        offer = repository.create_help_offer(
            incident_or_emergency_id=incident_id,
            helper_id=payload.helper_id,
            helper_name=payload.helper_name or "Volunteer Responder",
            assistance_type=payload.assistance_type,
            message=payload.message,
            estimated_eta_min=payload.estimated_eta_min
        )
        return offer
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

@router.get("/{incident_id}/help-offers", response_model=List[HelpOfferResponse])
def list_help_offers(incident_id: str):
    """Retrieve all authorized help offers registered for an incident."""
    return repository.get_help_offers(incident_id)

@router.post("/sos", status_code=status.HTTP_201_CREATED)
def trigger_sos(payload: SOSCreate):
    """Deploy rapid emergency SOS beacon with GPS coordinates."""
    return repository.record_sos(payload)
