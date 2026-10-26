"""
RESQMesh — Command Center API Router
Provides comprehensive REST endpoints for emergency intake, claim verification,
opportunity-cost matching, offline partition simulation, attack lab, and privacy relays.
"""

from fastapi import APIRouter, HTTPException, Query, status
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from ..schemas.mesh import (
    DistressIntakeRequest, DispatchActionRequest, PartitionActionRequest,
    MultiHopSOSMessage, MultiHopSyncRequest, MultiHopSyncResponse, MultiHopAck,
    EmergencyContactCreate, EmergencyContactResponse,
    EmergencyNotificationRequest, EmergencyNotificationResponse
)
from ..db.repository import repository
from ..services.matching import matcher
from ..services.hazards import hazard_engine, haversine_km
from ..services.mesh_sync import mesh_simulator
from ..services.attack_lab import attack_lab
from ..services.privacy import privacy_engine
from ..services.trust import trust_engine

router = APIRouter(prefix="/resqmesh", tags=["RESQMesh Tactical Emergency Network"])

# ==================== OPERATIONS DASHBOARD METRICS ====================

@router.get("/dashboard-metrics")
def get_dashboard_metrics() -> Dict[str, Any]:
    emergencies = repository.get_all_emergencies()
    responders = repository.get_all_responders()
    dispatches = repository.get_all_dispatches()
    mesh_status = mesh_simulator.get_mesh_status()

    critical_count = sum(1 for e in emergencies if e.get("severity") == "CRITICAL" and e.get("status") != "RESCUED")
    high_count = sum(1 for e in emergencies if e.get("severity") == "HIGH" and e.get("status") != "RESCUED")
    unresolved_count = sum(1 for e in emergencies if e.get("status") in ["UNRESOLVED", "DISPATCHED"])

    available_responders = sum(1 for r in responders if r.get("status") == "AVAILABLE")
    busy_responders = sum(1 for r in responders if r.get("status") in ["EN_ROUTE", "BUSY"])
    low_battery_nodes = sum(1 for r in responders if r.get("battery_pct", 100) < 30)

    avg_battery = round(sum(r.get("battery_pct", 90) for r in responders) / max(1, len(responders)), 1)
    unverified_reports = sum(1 for e in emergencies if e.get("verification_status") in ["UNVERIFIED", "SUSPICIOUS"])

    return {
        "active_emergencies": unresolved_count,
        "critical_cases": critical_count,
        "high_cases": high_count,
        "unverified_reports": unverified_reports,
        "available_responders": available_responders,
        "busy_responders": busy_responders,
        "low_battery_nodes": low_battery_nodes,
        "avg_battery_pct": avg_battery,
        "is_partitioned": mesh_status["is_partitioned"],
        "active_mesh_nodes": len(mesh_status["nodes"]),
        "active_dispatches": len([d for d in dispatches if d.get("status") in ["PROPOSED", "ACCEPTED", "EN_ROUTE"]]),
        "recent_sync_events": len(mesh_status["audit_log"]),
        "hazards_active": len(hazard_engine.get_active_hazards())
    }

# ==================== LIVE LOCATION TELEMETRY API ====================

class LocationTelemetryRequest(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    accuracy_meters: Optional[float] = 15.0
    device_id: Optional[str] = "browser-node"

@router.get("/my-location")
def get_current_location_telemetry(
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    accuracy: Optional[float] = Query(15.0)
) -> Dict[str, Any]:
    """
    Returns verified spatial telemetry, nearest responder distance, and active hazard warnings
    for the user's current GPS location.
    """
    current_lat = lat if lat is not None else 21.1420
    current_lng = lng if lng is not None else 79.0800
    now = datetime.now(timezone.utc)

    responders = repository.get_all_responders()
    active_hazards = hazard_engine.get_active_hazards()

    # Find nearest responder
    nearest_resp = None
    min_resp_dist = 999999.0
    for r in responders:
        d = haversine_km(current_lat, current_lng, r["current_lat"], r["current_lng"])
        if d < min_resp_dist:
            min_resp_dist = d
            nearest_resp = {
                "responder_id": r["responder_id"],
                "name": r["name"],
                "role": r.get("role", "Field Volunteer"),
                "distance_km": round(d, 2),
                "battery_pct": r.get("battery_pct", 90),
                "status": r.get("status", "AVAILABLE")
            }

    # Find nearest hazard and check if inside hazard perimeter
    in_hazard = False
    nearest_hazard = None
    min_hazard_dist = 999999.0
    for h in active_hazards:
        d = haversine_km(current_lat, current_lng, h["center_lat"], h["center_lng"])
        if d <= h["radius_km"]:
            in_hazard = True
        if d < min_hazard_dist:
            min_hazard_dist = d
            nearest_hazard = {
                "hazard_id": h["hazard_id"],
                "name": h["name"],
                "hazard_type": h["hazard_type"],
                "severity": h["severity"],
                "distance_km": round(d, 2),
                "in_zone": d <= h["radius_km"]
            }

    # Locality determination
    locality = f"Tactical Grid Sector ({round(current_lat, 3)}°N, {round(current_lng, 3)}°E)"
    if 21.13 <= current_lat <= 21.16 and 79.06 <= current_lng <= 79.10:
        locality = "Ward 12 Tactical Sector (Central Command Zone)"

    return {
        "status": "success",
        "is_live_fix": lat is not None and lng is not None,
        "coords": {
            "lat": current_lat,
            "lng": current_lng,
            "accuracy_meters": round(accuracy or 15.0, 1)
        },
        "locality": locality,
        "nearest_responder": nearest_resp,
        "nearest_hazard": nearest_hazard,
        "in_hazard_zone": in_hazard,
        "timestamp": now.isoformat()
    }

@router.post("/my-location")
def update_current_location_telemetry(req: LocationTelemetryRequest) -> Dict[str, Any]:
    if req.lat is not None and req.lng is not None:
        repository.relocate_scenario(req.lat, req.lng)
        hazard_engine.relocate_hazards(req.lat, req.lng)
    return get_current_location_telemetry(lat=req.lat, lng=req.lng, accuracy=req.accuracy_meters)

class ScenarioRelocationRequest(BaseModel):
    lat: float
    lng: float
    min_km: Optional[float] = 5.0
    max_km: Optional[float] = 7.0

@router.post("/scenario/relocate")
def relocate_scenario_around_user(req: ScenarioRelocationRequest) -> Dict[str, Any]:
    """
    Relocates the simulated disaster emergencies, hazards, and responders
    so they are in the range of 5-7 km from the user's current GPS location.
    """
    repo_res = repository.relocate_scenario(req.lat, req.lng, req.min_km or 5.0, req.max_km or 7.0)
    hz_res = hazard_engine.relocate_hazards(req.lat, req.lng)
    return {
        "status": "success",
        "message": "Disaster scenario successfully relocated to 5-7 km radius of user",
        "center": {"lat": req.lat, "lng": req.lng},
        "disaster_range_km": f"{req.min_km or 5.0} - {req.max_km or 7.0} km",
        "active_hazards_count": len(hz_res),
        "details": repo_res
    }

# ==================== EMERGENCY INTAKE & VERIFICATION ====================

@router.post("/intake", status_code=status.HTTP_201_CREATED)
def intake_distress_message(req: DistressIntakeRequest) -> Dict[str, Any]:
    return repository.process_distress_intake(req)

@router.post("/outbox/sync")
def sync_outbox(reports: List[DistressIntakeRequest]) -> Dict[str, Any]:
    """
    Batch endpoint to sync multiple queued offline distress reports.
    Supports idempotency using client_message_id.
    """
    return repository.sync_outbox_batch(reports)

@router.get("/emergencies")
def list_emergencies(
    severity: Optional[str] = None,
    verification: Optional[str] = None,
    status_filter: Optional[str] = None,
    include_demo: bool = True
) -> List[Dict[str, Any]]:
    emgs = repository.get_all_emergencies()
    if not include_demo:
        emgs = [e for e in emgs if not e.get("is_demo", False)]
    if severity:
        emgs = [e for e in emgs if e.get("severity", "").upper() == severity.upper()]
    if verification:
        emgs = [e for e in emgs if e.get("verification_status", "").upper() == verification.upper()]
    if status_filter:
        emgs = [e for e in emgs if e.get("status", "").upper() == status_filter.upper()]
    return emgs

@router.get("/emergencies/{emergency_id}")
def get_emergency_detail(emergency_id: str) -> Dict[str, Any]:
    emg = repository.get_emergency(emergency_id)
    if not emg:
        raise HTTPException(status_code=404, detail="Emergency not found")
    return emg

class EmergencyStatusUpdateRequest(BaseModel):
    status: str
    actor: Optional[str] = "Helper"
    note: Optional[str] = None

@router.patch("/emergencies/{emergency_id}/status")
def patch_emergency_status(emergency_id: str, payload: EmergencyStatusUpdateRequest) -> Dict[str, Any]:
    updated = repository.update_emergency_status(
        emergency_id=emergency_id,
        new_status=payload.status,
        actor=payload.actor or "Helper",
        note=payload.note
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Emergency not found")
    return updated

class EmergencyHelpOfferRequest(BaseModel):
    helper_id: str
    helper_name: Optional[str] = "Volunteer Responder"
    assistance_type: str
    message: Optional[str] = None
    estimated_eta_min: Optional[float] = 15.0

@router.post("/emergencies/{emergency_id}/help-offers", status_code=status.HTTP_201_CREATED)
def post_emergency_help_offer(emergency_id: str, payload: EmergencyHelpOfferRequest) -> Dict[str, Any]:
    try:
        offer = repository.create_help_offer(
            incident_or_emergency_id=emergency_id,
            helper_id=payload.helper_id,
            helper_name=payload.helper_name or "Volunteer Responder",
            assistance_type=payload.assistance_type,
            message=payload.message,
            estimated_eta_min=payload.estimated_eta_min
        )
        return offer
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

@router.get("/emergencies/{emergency_id}/help-offers")
def get_emergency_help_offers(emergency_id: str) -> List[Dict[str, Any]]:
    return repository.get_help_offers(emergency_id)

# ==================== RESPONDERS & OPPORTUNITY-COST MATCHING ====================

@router.get("/responders")
def list_responders() -> List[Dict[str, Any]]:
    return repository.get_all_responders()

class MatchRequest(BaseModel):
    emergency_id: str

@router.post("/match")
def match_candidates(req: MatchRequest) -> Dict[str, Any]:
    emg = repository.get_emergency(req.emergency_id)
    if not emg:
        raise HTTPException(status_code=404, detail="Emergency not found")
    
    responders = repository.get_all_responders()
    all_emergencies = repository.get_all_emergencies()

    ranked = matcher.rank_responders(emg, responders, all_emergencies)
    best_candidate = ranked[0] if ranked and ranked[0]["is_suitable"] else None

    return {
        "emergency_id": req.emergency_id,
        "required_capabilities": emg.get("required_capabilities", []),
        "best_candidate": best_candidate,
        "ranked_candidates": ranked
    }

class DispatchCreateRequest(BaseModel):
    emergency_id: str
    responder_id: str
    justification: str
    estimated_minutes: float
    route_safe: bool

@router.post("/dispatch", status_code=status.HTTP_201_CREATED)
def propose_dispatch(req: DispatchCreateRequest) -> Dict[str, Any]:
    disp = repository.create_dispatch(
        emergency_id=req.emergency_id,
        responder_id=req.responder_id,
        justification=req.justification,
        estimated_minutes=req.estimated_minutes,
        route_safe=req.route_safe
    )
    if not disp:
        raise HTTPException(status_code=400, detail="Invalid dispatch request")
    return disp

@router.get("/dispatches")
def list_dispatches() -> List[Dict[str, Any]]:
    return repository.get_all_dispatches()

@router.post("/dispatch/action")
def take_dispatch_action(req: DispatchActionRequest) -> Dict[str, Any]:
    disp = repository.update_dispatch_action(req.dispatch_id, req.action, req.reason)
    if not disp:
        raise HTTPException(status_code=404, detail="Dispatch record not found")
    return disp

# ==================== MULTI-HOP SOS RELAY & GATEWAY SYNC ====================

@router.post("/multi-hop/sync", response_model=MultiHopSyncResponse)
def sync_multihop_messages(req: MultiHopSyncRequest) -> MultiHopSyncResponse:
    """
    Receives opportunistic batched multi-hop SOS packets from gateway nodes.
    Validates message freshness, deduplicates hops without inflating independent witnesses,
    records incidents, and returns cryptographically signed acknowledgements.
    """
    acknowledged = []
    deduplicated = []
    errors = []

    for msg in req.messages:
        try:
            # 1. Process via Repository (handles deduplication, relay path merging, and ACK return)
            res = repository.process_multihop_message(msg, gateway_node_id=req.gateway_node_id or "gateway-01")
            ack_data = res["ack"]

            if res.get("is_duplicate"):
                deduplicated.append(msg.message_id)
            else:
                # For first-time messages, verify freshness and record in trust engine
                payload_str = f"{msg.message_id}:{msg.description}:{msg.latitude}:{msg.longitude}:{msg.created_at}"
                trust_engine.verify_message_freshness(msg.message_id, payload_str, msg.created_at)

            acknowledged.append(MultiHopAck(**ack_data))

        except Exception as e:
            errors.append({"message_id": msg.message_id, "error": str(e)})

    return MultiHopSyncResponse(
        processed=len(req.messages),
        acknowledged=acknowledged,
        deduplicated=deduplicated,
        errors=errors
    )

@router.post("/multi-hop/single", response_model=MultiHopAck)
def submit_single_multihop_message(msg: MultiHopSOSMessage, gateway_id: Optional[str] = "browser-gateway") -> MultiHopAck:
    """Convenience endpoint to submit a single multi-hop SOS packet."""
    res = repository.process_multihop_message(msg, gateway_node_id=gateway_id or "browser-gateway")
    return MultiHopAck(**res["ack"])

@router.get("/multi-hop/acks", response_model=List[MultiHopAck])
def get_multihop_acks() -> List[MultiHopAck]:
    """Retrieve all server acknowledgements for mesh back-propagation."""
    acks = repository.get_multihop_acks()
    return [MultiHopAck(**a) for a in acks]

# ==================== HAZARDS & SAFE ROUTING ====================

@router.get("/hazards")
def list_hazards() -> List[Dict[str, Any]]:
    return hazard_engine.get_active_hazards()

class HazardToggleRequest(BaseModel):
    hazard_id: str
    active: bool

@router.post("/hazards/toggle")
def toggle_hazard(req: HazardToggleRequest) -> Dict[str, Any]:
    res = hazard_engine.toggle_hazard(req.hazard_id, req.active)
    if not res:
        raise HTTPException(status_code=404, detail="Hazard zone not found")
    return res

# ==================== MESH TOPOLOGY & PARTITION SIMULATOR ====================

@router.get("/mesh/status")
def get_mesh_status() -> Dict[str, Any]:
    return mesh_simulator.get_mesh_status()

@router.post("/mesh/partition")
def trigger_partition() -> Dict[str, Any]:
    return mesh_simulator.partition_network()

@router.post("/mesh/reconnect")
def trigger_reconnect() -> Dict[str, Any]:
    return mesh_simulator.reconnect_and_reconcile()

@router.post("/mesh/queue-offline")
def queue_offline_event(req: PartitionActionRequest) -> Dict[str, Any]:
    return mesh_simulator.queue_offline_event(
        island_id=req.island_id or "island_A",
        event_type=req.event_type or "DISPATCH_ACCEPTED",
        payload=req.payload or {"emergency_id": "emg-offline-01", "responder_id": "resp-medic-1"}
    )

# ==================== RED TEAM / ATTACK LAB ====================

@router.post("/attack-lab/scenario/{scenario_id}")
def run_attack_scenario(scenario_id: int) -> Dict[str, Any]:
    if scenario_id < 1 or scenario_id > 10:
        raise HTTPException(status_code=400, detail="Scenario ID must be between 1 and 10")
    return attack_lab.run_scenario(scenario_id)

@router.post("/attack-lab/reset")
def reset_attack_lab() -> Dict[str, Any]:
    trust_engine.quarantined_identities.clear()
    trust_engine.seen_message_hashes.clear()
    trust_engine.node_rate_limits.clear()
    hazard_engine.toggle_hazard("hz-flood-ward12", True)
    hazard_engine.toggle_hazard("hz-bridge-collapse", True)
    if mesh_simulator.is_partitioned:
        mesh_simulator.reconnect_and_reconcile()
    return {"message": "Attack lab state and security test harness reset to baseline."}

# ==================== PRIVACY & ENCRYPTED RELAY DEMO ====================

class PrivacyDemoRequest(BaseModel):
    emergency_id: str
    victim_name: str = "Ramesh Sharma"
    medical_condition: str = "Type 1 Diabetes, needs refrigerated insulin immediately"
    private_phone: str = "+91 94231 88910"
    address: str = "House #14, Lane 3, Flood Zone 1"

@router.post("/privacy/demo")
def demonstrate_privacy(req: PrivacyDemoRequest) -> Dict[str, Any]:
    sensitive_payload = {
        "victim_name": req.victim_name,
        "medical_condition": req.medical_condition,
        "private_phone": req.private_phone,
        "address": req.address,
        "required_skill": "refrigerated_insulin_supply"
    }

    # 1. Create secure envelope
    envelope = privacy_engine.create_secure_envelope(
        emergency_id=req.emergency_id,
        category="medical",
        urgency=9,
        lat=21.1430,
        lng=79.0810,
        sensitive_medical_payload=sensitive_payload
    )

    # 2. Simulate untrusted relay hop
    relay_view = privacy_engine.simulate_relay_forwarding(envelope, relay_node_id="node-untrusted-volunteer-mesh")

    # 3. Simulate unauthorized user attempt
    unauthorized_attempt = privacy_engine.decrypt_for_authorized_medic(envelope, responder_role="General Volunteer")

    # 4. Authorized medic receipt
    authorized_view = privacy_engine.decrypt_for_authorized_medic(envelope, responder_role="Certified Paramedic / Doctor")

    return {
        "envelope": envelope,
        "relay_intermediary_view": relay_view,
        "unauthorized_decryption_attempt": unauthorized_attempt,
        "authorized_medic_view": authorized_view
    }

# ==================== EMERGENCY CONTACTS & SOS NOTIFICATIONS ====================

@router.get("/contacts")
def get_contacts(user_id: Optional[str] = Query(None)) -> Any:
    """
    Returns the user's emergency contact, or all registered emergency contacts.
    """
    if user_id:
        contact = repository.get_emergency_contact(user_id)
        if not contact:
            # Fallback to prototype contact
            contact = repository.get_emergency_contact("usr-citizen")
        return contact
    return repository.list_all_contacts()

@router.post("/contacts", status_code=status.HTTP_201_CREATED)
def save_contact(payload: EmergencyContactCreate) -> Dict[str, Any]:
    """
    Saves or updates an emergency contact for the user.
    """
    contact = repository.save_emergency_contact(
        user_id=payload.user_id or "usr-citizen",
        name=payload.name,
        phone=payload.phone,
        country_code=payload.country_code or "+91",
        relationship=payload.relationship or "Primary Contact"
    )
    return contact

@router.post("/notifications/send", status_code=status.HTTP_200_OK)
def send_sos_notification(payload: EmergencyNotificationRequest) -> Dict[str, Any]:
    """
    Dispatches an emergency alert notification to the specified emergency contact.
    Idempotent: Duplicate requests for the same (sos_id, contact_phone) return the existing receipt.
    """
    result = repository.send_emergency_notification(
        sos_id=payload.sos_id,
        trigger_source=payload.trigger_source,
        contact_name=payload.contact_name,
        contact_phone=payload.contact_phone,
        country_code=payload.country_code,
        lat=payload.lat,
        lng=payload.lng,
        accuracy_meters=payload.accuracy_meters,
        location_status=payload.location_status,
        location_timestamp=payload.location_timestamp,
        location_age_str=payload.location_age_str,
        custom_message=payload.custom_message
    )
    return result

@router.get("/notifications")
def get_notifications(sos_id: Optional[str] = Query(None)) -> List[Dict[str, Any]]:
    return repository.get_emergency_notifications(sos_id=sos_id)

class NotificationDeliveryReportRequest(BaseModel):
    sos_id: str
    delivery_status: str
    details: Optional[str] = None

@router.post("/notifications/delivery-report")
def update_delivery_report(payload: NotificationDeliveryReportRequest) -> Dict[str, Any]:
    updated = repository.update_notification_delivery_status(
        sos_id=payload.sos_id,
        delivery_status=payload.delivery_status,
        details=payload.details
    )
    if not updated:
        return {"status": "NOT_FOUND", "sos_id": payload.sos_id}
    return updated

# ==================== AUDIT TRAIL ====================

@router.get("/audit-events")
def get_audit_trail(limit: int = 50) -> List[Any]:
    events = repository.get_events(limit=limit)
    return [e.model_dump() if hasattr(e, "model_dump") else e for e in events]
