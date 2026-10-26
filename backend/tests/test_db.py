from uuid import uuid4
from backend.app.db.repository import repository
from backend.app.schemas.incident import IncidentCreate

def test_idempotent_incident_creation():
    idemp_key = f"idemp_{uuid4()}"
    payload1 = IncidentCreate(
        category="fire",
        description="Transformer fire sparking near gas line",
        lat=21.1500,
        lng=79.0800,
        people_affected=3,
        idempotency_key=idemp_key
    )
    inc1 = repository.create_incident(payload1)

    # Re-submit with same idempotency key (simulating network retry)
    payload2 = IncidentCreate(
        category="fire",
        description="Duplicate retransmission",
        lat=21.1500,
        lng=79.0800,
        people_affected=3,
        idempotency_key=idemp_key
    )
    inc2 = repository.create_incident(payload2)

    assert inc1.incident_id == inc2.incident_id
    assert inc2.description == payload1.description  # Original preserved

def test_status_transition_and_audit_event():
    payload = IncidentCreate(
        category="flood",
        description="Basement flooded with electric meter submerged",
        lat=21.1300,
        lng=79.0700,
        people_affected=2
    )
    inc = repository.create_incident(payload)
    assert inc.status == "PENDING"

    updated = repository.update_incident_status(inc.incident_id, "VERIFIED", actor="Field Scout")
    assert updated.status == "VERIFIED"

    # Verify event logged
    events = repository.get_events(limit=5)
    matching = [e for e in events if e.incident_id == inc.incident_id and e.event_type == "STATUS_CHANGED"]
    assert len(matching) > 0
    assert "Field Scout" in matching[0].actor
