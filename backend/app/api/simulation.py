from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any
from uuid import uuid4
import random

from ..db.repository import repository
from ..schemas.incident import IncidentCreate

router = APIRouter(prefix="/simulation", tags=["God Mode & Simulation Controls"])

class SpawnRequest(BaseModel):
    scenario: str = "flood"  # flood, medical, fire, earthquake, supply_shortage
    lat: float = 21.1458
    lng: float = 79.0882
    scale: str = "moderate"  # minor, moderate, severe

SCENARIO_TEMPLATES = {
    "flood": {
        "category": "flood",
        "description": "Rising floodwaters breached embankment near riverside settlement. 22 families trapped on terraces.",
        "people_affected": 22,
        "food_needed": 44,
        "water_needed": 88,
        "shelter_needed": 6,
        "medical_needed": 3,
        "severity": "Critical",
        "urgency": 9,
        "ai_assessment": "Severe Hydrological Threat",
        "ai_reason": "Rapid flooding with rising waters threatening structure stability.",
        "ai_confidence": 0.95
    },
    "fire": {
        "category": "fire",
        "description": "Commercial warehouse electrical blaze spreading to adjacent homes. Dense toxic smoke reported.",
        "people_affected": 12,
        "food_needed": 12,
        "water_needed": 24,
        "shelter_needed": 3,
        "medical_needed": 8,
        "severity": "Critical",
        "urgency": 9,
        "ai_assessment": "Toxic Smoke & Thermal Hazard",
        "ai_reason": "Spreading blaze with respiratory hazard; immediate evacuation corridor and burn trauma units needed.",
        "ai_confidence": 0.96
    },
    "medical": {
        "category": "medical",
        "description": "Mass heatstroke and dehydration incident at community relief transit camp. 15 patients needing saline IV.",
        "people_affected": 15,
        "food_needed": 15,
        "water_needed": 60,
        "shelter_needed": 2,
        "medical_needed": 15,
        "severity": "High",
        "urgency": 8,
        "ai_assessment": "Dehydration Surge",
        "ai_reason": "Heat exhaustion and electrolyte depletion; hydration packets and ambulance triage required.",
        "ai_confidence": 0.92
    },
    "earthquake": {
        "category": "earthquake",
        "description": "Seismic tremor caused masonry collapse and blocked access road. 6 individuals trapped in basement.",
        "people_affected": 6,
        "food_needed": 12,
        "water_needed": 24,
        "shelter_needed": 2,
        "medical_needed": 6,
        "severity": "Critical",
        "urgency": 10,
        "ai_assessment": "Structural Trapping Event",
        "ai_reason": "Confined space entrapment; heavy extraction gear and paramedic units needed.",
        "ai_confidence": 0.98
    }
}

@router.post("/spawn")
def spawn_scenario(req: SpawnRequest) -> Dict[str, Any]:
    """Spawn a realistic crisis scenario on the tactical map."""
    tpl = SCENARIO_TEMPLATES.get(req.scenario.lower(), SCENARIO_TEMPLATES["flood"])
    
    # Add slight random offset to coordinates
    lat_offset = (random.random() - 0.5) * 0.02
    lng_offset = (random.random() - 0.5) * 0.02

    inc_data = IncidentCreate(
        category=tpl["category"],
        description=tpl["description"],
        lat=req.lat + lat_offset,
        lng=req.lng + lng_offset,
        people_affected=tpl["people_affected"],
        food_needed=tpl["food_needed"],
        water_needed=tpl["water_needed"],
        shelter_needed=tpl["shelter_needed"],
        medical_needed=tpl["medical_needed"],
        severity=tpl["severity"],
        urgency=tpl["urgency"],
        ai_assessment=tpl["ai_assessment"],
        ai_reason=tpl["ai_reason"],
        ai_confidence=tpl["ai_confidence"],
        idempotency_key=f"sim_{uuid4()}"
    )

    created = repository.create_incident(inc_data)
    return {"message": f"Successfully spawned {req.scenario} crisis", "incident": created}

@router.post("/reset")
def reset_simulation() -> Dict[str, Any]:
    """Reset repository state to default initial seed."""
    with repository._lock:
        repository._incidents.clear()
        repository._incident_status_index = {"PENDING": [], "VERIFIED": [], "DISPATCHED": [], "RESOLVED": []}
        repository._events.clear()
        repository._deliveries.clear()
        repository._depots.clear()
        repository._vehicles.clear()
        repository._idempotency_keys.clear()
        repository._sos_records.clear()
        repository._seed_default_data()
    return {"message": "Simulation registry reset to operational baseline."}
