import pytest
from uuid import UUID
from backend.app.api.health import health_check
from backend.app.api.incidents import report_incident, get_incident, trigger_sos, update_status
from backend.app.api.ai import assess_crisis_situation
from backend.app.api.relief import get_depots, get_vehicles, allocate_supplies
from backend.app.schemas.incident import IncidentCreate, SOSCreate, IncidentStatusUpdate
from backend.app.schemas.ai import AIAssessmentRequest
from backend.app.schemas.relief import AllocationRequest

def test_health_endpoint():
    data = health_check()
    assert data["status"] == "healthy"
    assert "database" in data
    assert "ai_engine" in data
    assert data["database"]["type"] == "ScyllaDB"

def test_create_and_get_incident():
    payload = IncidentCreate(
        category="flood",
        description="Rising waters near community bridge; 6 people trapped on car roof.",
        lat=21.1490,
        lng=79.0820,
        reporter_phone="+91 99887 76655",
        people_affected=6,
        food_needed=0,
        water_needed=0,
        shelter_needed=0,
        medical_needed=0
    )
    created = report_incident(payload)
    assert created.incident_id is not None
    assert created.category == "flood"
    assert created.severity in ["High", "Critical"]
    assert created.food_needed > 0
    assert created.water_needed > 0

    # Retrieve by ID
    retrieved = get_incident(created.incident_id)
    assert retrieved.incident_id == created.incident_id

def test_ai_triage_assessment():
    payload = AIAssessmentRequest(
        description="Massive building collapse with 14 individuals crushed and bleeding underneath concrete slab.",
        people_affected=14,
        has_image=True
    )
    assessment = assess_crisis_situation(payload)
    assert assessment.severity == "Critical"
    assert assessment.urgency_score >= 8
    assert "Emergency Ambulance" in assessment.recommended_vehicles
    assert len(assessment.ai_reason) > 10

def test_sos_distress_beacon():
    payload = SOSCreate(
        lat=21.1350,
        lng=79.0710,
        phone="+91 91234 56789",
        message="Trapped in dark basement with rising water",
        urgency="CRITICAL",
        battery_level=42
    )
    res = trigger_sos(payload)
    assert res["status"] == "BEACON_ACTIVE"
    assert "incident_id" in res

def test_depots_and_allocation():
    depots = get_depots()
    assert len(depots) >= 2
    depot_id = depots[0].depot_id
    initial_food = depots[0].food_units

    vehicles = get_vehicles()
    assert len(vehicles) >= 1
    vehicle_id = vehicles[0].vehicle_id

    # Create incident to allocate to
    inc_payload = IncidentCreate(
        category="supplies",
        description="Urgent dry rations needed for evacuation center.",
        lat=21.1400,
        lng=79.0800,
        people_affected=5
    )
    incident = report_incident(inc_payload)

    # Allocate supplies
    alloc_req = AllocationRequest(
        incident_id=incident.incident_id,
        depot_id=depot_id,
        vehicle_id=vehicle_id,
        food_units=10,
        water_units=20,
        shelter_units=1,
        medical_units=1
    )
    delivery = allocate_supplies(alloc_req)
    assert delivery.status == "EN_ROUTE"

    # Verify depot stock reduced
    depots_after = get_depots()
    depot_after = next(d for d in depots_after if d.depot_id == depot_id)
    assert depot_after.food_units == initial_food - 10

def test_help_offer_and_status_lifecycle():
    from backend.app.schemas.incident import HelpOfferCreate, IncidentStatusUpdate
    from backend.app.api.incidents import submit_help_offer, list_help_offers, update_status, get_incident
    import pytest
    from fastapi import HTTPException

    # 1. Submit helper offer
    offer_req = HelpOfferCreate(
        helper_id="usr-test-helper-1",
        helper_name="Amulya Yadav",
        assistance_type="medical",
        message="I have a first aid kit and oxygen tank ready.",
        estimated_eta_min=10.0
    )
    offer = submit_help_offer("demo-emg-01-insulin", offer_req)
    assert offer["offer_id"].startswith("offer-")
    assert offer["status"] == "CONFIRMED"
    assert offer["helper_name"] == "Amulya Yadav"

    # 2. Check offer is retrieved
    offers = list_help_offers("demo-emg-01-insulin")
    assert len(offers) >= 1
    assert any(o["helper_id"] == "usr-test-helper-1" for o in offers)

    # 3. Prevent duplicate active offer from same helper
    with pytest.raises(HTTPException) as exc_info:
        submit_help_offer("demo-emg-01-insulin", offer_req)
    assert exc_info.value.status_code == 409

    # 4. Status transition
    updated = update_status("demo-emg-01-insulin", IncidentStatusUpdate(status="RESPONDER_ASSIGNED", note="Assigned Amulya"))
    assert updated["status"] == "RESPONDER_ASSIGNED"

def test_direct_sos_beacon():
    from backend.app.schemas.incident import SOSCreate
    from backend.app.api.incidents import trigger_sos

    sos_res = trigger_sos(SOSCreate(
        lat=21.1458,
        lng=79.0882,
        phone="+91 94231 00000",
        message="Flash flood rising quickly in Sector 4 ground level."
    ))
    assert "sos_id" in sos_res
    assert sos_res["status"] == "BEACON_ACTIVE"
